/**
 * lib/branchPromotion.js
 *
 * Branch-level "partial promotion" with round-locking. Shared by the BM / HOD /
 * CM / HR evaluate routes AND the one-off recompute script, so the live pipeline
 * and any backfill always apply identical rules.
 *
 * Rules (agreed with admin):
 *   1. A stage no longer waits for EVERY target to be evaluated. On each
 *      submission we regenerate the next-stage shortlist from the evaluations
 *      done SO FAR — top-N by score, capped at the stage limit. Employees
 *      proceed on the basis of current evaluations.
 *   2. The previous round freezes the moment the NEXT round starts evaluating a
 *      branch (its first evaluation exists). Once locked we never touch that
 *      shortlist again, so a late evaluation can't reshuffle a round the next
 *      stage is already working on.
 *
 * Plain CommonJS, no ESM/TS imports, takes `prisma` as an argument — this keeps
 * it requireable from a standalone `node scripts/...` process as well as from
 * the Next.js route handlers (webpack ESM↔CJS interop gives the named exports).
 *
 * Combined scores are read straight off the persisted evaluation rows
 * (stage3CombinedScore / stage2CombinedScore / cmNormalized / stage4CombinedScore),
 * so no score recomputation happens here — only ranking + selection.
 */

// Stage shortlist sizes (mirror lib/branchRules.ts).
const BIG_LIMITS = {
    WHITE_COLLAR: { stage2: 3, stage3: 2, stage4: 1 },
    BLUE_COLLAR: { stage2: 10, stage3: 5, stage4: 3 },
};
const SMALL_LIMITS = { stage2: 10, stage3: 5, stage4: 3 };

// ── Lock helpers — has the NEXT round started for this branch? ──
async function stage3Started(prisma, branchId, quarterId) {
    const c = await prisma.clusterManagerEvaluation.count({
        where: { quarterId, employee: { department: { branchId } } },
    });
    return c > 0;
}
async function stage4Started(prisma, branchId, quarterId) {
    const c = await prisma.hrEvaluation.count({
        where: { quarterId, employee: { department: { branchId } } },
    });
    return c > 0;
}

// notIn:[] matches nothing in SQL; use a sentinel so an empty desired set
// clears the whole (branch-scoped) shortlist instead of being a no-op.
const pruneNotIn = (ids) => (ids.length ? ids : ["__none__"]);

/**
 * Stage 2 — who clears into Stage 3. Built from current BM (white-collar / all)
 * and HOD (blue-collar, big branches) evaluations. Locked once CM starts.
 * @returns {Promise<{locked: boolean, added: string[]}>}
 */
async function regenerateBranchStage2(prisma, { branchId, branchType, quarterId, respectLock = true }) {
    if (respectLock && (await stage3Started(prisma, branchId, quarterId))) {
        return { locked: true, added: [] };
    }

    const cfg = await prisma.branchEvalConfig
        .findUnique({ where: { branchId_quarterId: { branchId, quarterId } }, select: { stage2Limit: true } })
        .catch(() => null);

    const stage1 = await prisma.branchShortlistStage1.findMany({
        where: { branchId, quarterId },
        select: { userId: true, collarType: true },
    });

    let desired = [];

    if (branchType === "BIG") {
        // Two independent tracks: WC via BM, BC via HOD.
        const wcIds = stage1.filter((s) => s.collarType === "WHITE_COLLAR").map((s) => s.userId);
        const bcIds = stage1.filter((s) => s.collarType === "BLUE_COLLAR").map((s) => s.userId);
        const wcLimit = cfg && cfg.stage2Limit != null ? cfg.stage2Limit : BIG_LIMITS.WHITE_COLLAR.stage2;
        const bcLimit = BIG_LIMITS.BLUE_COLLAR.stage2;

        const bmEvals = wcIds.length
            ? await prisma.branchManagerEvaluation.findMany({
                where: { quarterId, employeeId: { in: wcIds } },
                orderBy: { stage3CombinedScore: "desc" },
                select: { employeeId: true, selfContribution: true, bmContribution: true, stage3CombinedScore: true },
            })
            : [];
        const hodEvals = bcIds.length
            ? await prisma.hodEvaluation.findMany({
                where: { quarterId, employeeId: { in: bcIds } },
                orderBy: { stage2CombinedScore: "desc" },
                select: { employeeId: true, selfContribution: true, hodContribution: true, stage2CombinedScore: true },
            })
            : [];

        desired = [
            ...bmEvals.slice(0, wcLimit).map((e) => ({
                userId: e.employeeId, collarType: "WHITE_COLLAR",
                selfScore: e.selfContribution, evaluatorScore: e.bmContribution, combinedScore: e.stage3CombinedScore,
            })),
            ...hodEvals.slice(0, bcLimit).map((e) => ({
                userId: e.employeeId, collarType: "BLUE_COLLAR",
                selfScore: e.selfContribution, evaluatorScore: e.hodContribution, combinedScore: e.stage2CombinedScore,
            })),
        ];
    } else {
        // SMALL: BM evaluates everyone; one combined track.
        const allIds = stage1.map((s) => s.userId);
        const limit = cfg && cfg.stage2Limit != null ? cfg.stage2Limit : SMALL_LIMITS.stage2;
        const collarByUser = new Map(stage1.map((s) => [s.userId, s.collarType]));
        const bmEvals = allIds.length
            ? await prisma.branchManagerEvaluation.findMany({
                where: { quarterId, employeeId: { in: allIds } },
                orderBy: { stage3CombinedScore: "desc" },
                select: { employeeId: true, selfContribution: true, bmContribution: true, stage3CombinedScore: true },
            })
            : [];
        desired = bmEvals.slice(0, limit).map((e) => ({
            userId: e.employeeId, collarType: collarByUser.get(e.employeeId) || "BLUE_COLLAR",
            selfScore: e.selfContribution, evaluatorScore: e.bmContribution, combinedScore: e.stage3CombinedScore,
        }));
    }

    desired.sort((a, b) => b.combinedScore - a.combinedScore);
    const desiredIds = desired.map((d) => d.userId);

    const existing = await prisma.branchShortlistStage2.findMany({ where: { branchId, quarterId }, select: { userId: true } });
    const existingIds = new Set(existing.map((r) => r.userId));

    for (let i = 0; i < desired.length; i++) {
        const d = desired[i];
        await prisma.branchShortlistStage2.upsert({
            where: { userId_quarterId: { userId: d.userId, quarterId } },
            update: { branchId, collarType: d.collarType, selfScore: d.selfScore, evaluatorScore: d.evaluatorScore, combinedScore: d.combinedScore, rank: i + 1 },
            create: { userId: d.userId, quarterId, branchId, collarType: d.collarType, selfScore: d.selfScore, evaluatorScore: d.evaluatorScore, combinedScore: d.combinedScore, rank: i + 1 },
        });
    }
    await prisma.branchShortlistStage2.deleteMany({ where: { branchId, quarterId, userId: { notIn: pruneNotIn(desiredIds) } } });

    return { locked: false, added: desiredIds.filter((id) => !existingIds.has(id)) };
}

/**
 * Stage 3 — who clears into Stage 4. Built from current CM evaluations of the
 * Stage 2 pool; only CM-evaluated employees are eligible. Locked once HR starts.
 * @returns {Promise<{locked: boolean, added: string[]}>}
 */
async function regenerateBranchStage3(prisma, { branchId, branchType, quarterId, respectLock = true }) {
    if (respectLock && (await stage4Started(prisma, branchId, quarterId))) {
        return { locked: true, added: [] };
    }

    const stage2 = await prisma.branchShortlistStage2.findMany({
        where: { branchId, quarterId },
        select: { userId: true, collarType: true, selfScore: true, evaluatorScore: true },
    });
    if (stage2.length === 0) {
        await prisma.branchShortlistStage3.deleteMany({ where: { branchId, quarterId } });
        return { locked: false, added: [] };
    }

    const ids = stage2.map((s) => s.userId);
    const cmEvals = await prisma.clusterManagerEvaluation.findMany({
        where: { quarterId, employeeId: { in: ids } },
        select: { employeeId: true, cmNormalized: true },
    });
    const byEmp = new Map();
    for (const e of cmEvals) {
        const a = byEmp.get(e.employeeId) || { sum: 0, n: 0 };
        a.sum += e.cmNormalized; a.n += 1;
        byEmp.set(e.employeeId, a);
    }

    // Partial promotion: only employees evaluated by a CM so far are eligible.
    const candidates = stage2
        .filter((s) => byEmp.has(s.userId))
        .map((s) => {
            const a = byEmp.get(s.userId);
            const avgCm = a.n > 0 ? a.sum / a.n : 0;
            return {
                userId: s.userId, collarType: s.collarType, selfScore: s.selfScore, evaluatorScore: s.evaluatorScore,
                cmScore: avgCm,
                combinedScore: s.selfScore + s.evaluatorScore + Math.round((avgCm / 100) * 30 * 100) / 100,
            };
        });

    let desired;
    if (branchType === "BIG") {
        const wc = candidates.filter((c) => c.collarType === "WHITE_COLLAR").sort((a, b) => b.combinedScore - a.combinedScore).slice(0, BIG_LIMITS.WHITE_COLLAR.stage3);
        const bc = candidates.filter((c) => c.collarType === "BLUE_COLLAR").sort((a, b) => b.combinedScore - a.combinedScore).slice(0, BIG_LIMITS.BLUE_COLLAR.stage3);
        desired = [...wc, ...bc];
    } else {
        desired = candidates.sort((a, b) => b.combinedScore - a.combinedScore).slice(0, SMALL_LIMITS.stage3);
    }
    desired.sort((a, b) => b.combinedScore - a.combinedScore);
    const desiredIds = desired.map((d) => d.userId);

    const existing = await prisma.branchShortlistStage3.findMany({ where: { branchId, quarterId }, select: { userId: true } });
    const existingIds = new Set(existing.map((r) => r.userId));

    for (let i = 0; i < desired.length; i++) {
        const d = desired[i];
        await prisma.branchShortlistStage3.upsert({
            where: { userId_quarterId: { userId: d.userId, quarterId } },
            update: { branchId, collarType: d.collarType, selfScore: d.selfScore, evaluatorScore: d.evaluatorScore, cmScore: d.cmScore, combinedScore: d.combinedScore, rank: i + 1 },
            create: { userId: d.userId, quarterId, branchId, collarType: d.collarType || "BLUE_COLLAR", selfScore: d.selfScore, evaluatorScore: d.evaluatorScore, cmScore: d.cmScore, combinedScore: d.combinedScore, rank: i + 1 },
        });
    }
    await prisma.branchShortlistStage3.deleteMany({ where: { branchId, quarterId, userId: { notIn: pruneNotIn(desiredIds) } } });

    return { locked: false, added: desiredIds.filter((id) => !existingIds.has(id)) };
}

/**
 * Stage 4 — the branch's Best Employees, built from current HR evaluations of
 * the Stage 3 pool. Terminal stage (no further round to lock against), so it
 * always reflects the HR evaluations done so far.
 * @returns {Promise<{locked: boolean, added: string[]}>}
 */
async function regenerateBranchStage4(prisma, { branchId, branchType, quarterId }) {
    const stage3Count = await prisma.branchShortlistStage3.count({ where: { branchId, quarterId } });
    if (stage3Count === 0) {
        await prisma.branchBestEmployee.deleteMany({ where: { branchId, quarterId } });
        return { locked: false, added: [] };
    }

    const hrEvals = await prisma.hrEvaluation.findMany({
        where: { quarterId, employee: { department: { branchId } } },
        include: { employee: { select: { id: true, collarType: true } } },
        orderBy: { stage4CombinedScore: "desc" },
    });

    let winners;
    if (branchType === "BIG") {
        const wc = hrEvals.filter((e) => e.employee.collarType === "WHITE_COLLAR").slice(0, BIG_LIMITS.WHITE_COLLAR.stage4);
        const bc = hrEvals.filter((e) => e.employee.collarType === "BLUE_COLLAR").slice(0, BIG_LIMITS.BLUE_COLLAR.stage4);
        winners = [...wc, ...bc];
    } else {
        winners = hrEvals.slice(0, SMALL_LIMITS.stage4);
    }
    const winnerIds = winners.map((w) => w.employeeId);

    const existing = await prisma.branchBestEmployee.findMany({ where: { branchId, quarterId }, select: { userId: true } });
    const existingIds = new Set(existing.map((r) => r.userId));

    for (const ev of winners) {
        await prisma.branchBestEmployee.upsert({
            where: { userId_quarterId: { userId: ev.employeeId, quarterId } },
            update: { selfScore: ev.selfContribution, evaluatorScore: ev.evaluatorContribution, cmScore: ev.cmContribution, hrScore: ev.hrContribution, finalScore: ev.stage4CombinedScore, attendancePct: ev.attendancePct, workingHours: ev.workingHours, referenceSheetUrl: ev.referenceSheetUrl },
            create: { userId: ev.employeeId, quarterId, branchId, collarType: ev.employee.collarType || "BLUE_COLLAR", selfScore: ev.selfContribution, evaluatorScore: ev.evaluatorContribution, cmScore: ev.cmContribution, hrScore: ev.hrContribution, finalScore: ev.stage4CombinedScore, attendancePct: ev.attendancePct, workingHours: ev.workingHours, referenceSheetUrl: ev.referenceSheetUrl },
        });
    }
    await prisma.branchBestEmployee.deleteMany({ where: { branchId, quarterId, userId: { notIn: pruneNotIn(winnerIds) } } });

    return { locked: false, added: winnerIds.filter((id) => !existingIds.has(id)) };
}

module.exports = {
    regenerateBranchStage2,
    regenerateBranchStage3,
    regenerateBranchStage4,
    stage3Started,
    stage4Started,
};
