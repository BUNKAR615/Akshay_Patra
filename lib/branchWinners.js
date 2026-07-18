import prisma from "./prisma";

/**
 * Shared branch-winners dataset builder.
 *
 * Extracted from /api/committee/results so the admin area can serve the SAME
 * payload shape through its own permission-gated route
 * (/api/admin/winners, guard: pipeline.winners) without inheriting the
 * committee route's per-member branch scoping. The committee route keeps its
 * CommitteeBranchAssignment scoping and calls this for the heavy lifting.
 */

/** Resolve the quarter to report on: explicit id → ACTIVE → most recent. */
export async function resolveWinnersQuarter(quarterId) {
    if (quarterId) {
        return prisma.quarter.findUnique({ where: { id: quarterId } });
    }
    let quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
    if (!quarter) quarter = await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
    return quarter;
}

/**
 * Build the winners payload for a quarter.
 *
 * @param {object} args
 * @param {{ id: string }} args.quarter - resolved Quarter row
 * @param {object} [args.branchWhere] - optional extra filter for branchId
 *        (e.g. { branchId: "..." } or { branchId: { in: [...] } }). Omit for
 *        every branch with results.
 * @returns {Promise<{ branches: object[], results: object[] }>}
 */
export async function buildBranchWinners({ quarter, branchWhere = {} }) {
    const bestEmployees = await prisma.branchBestEmployee.findMany({
        where: { quarterId: quarter.id, ...branchWhere },
        include: {
            user: {
                select: {
                    id: true, name: true, empCode: true, designation: true,
                    collarType: true,
                    department: { select: { name: true } }
                }
            },
            branch: { select: { id: true, name: true, branchType: true } }
        },
        orderBy: [{ branch: { name: "asc" } }, { finalScore: "desc" }]
    });

    // Group by branch and pick winners per branch type:
    //   BIG   => 1 WC winner + 3 BC winners  (total 4)
    //   SMALL => 3 overall winners (top finalScore)
    const byBranch = new Map();
    for (const be of bestEmployees) {
        if (!byBranch.has(be.branchId)) {
            byBranch.set(be.branchId, {
                branch: be.branch,
                wc: [],
                bc: [],
                all: [],
            });
        }
        const g = byBranch.get(be.branchId);
        g.all.push(be);
        if (be.collarType === "WHITE_COLLAR") g.wc.push(be);
        else g.bc.push(be);
    }

    const mapEntry = (be) => ({
        name: be.user.name,
        empCode: be.user.empCode,
        designation: be.user.designation,
        department: be.user.department?.name,
        collarType: be.collarType,
        branch: be.branch.name,
        branchType: be.branch.branchType,
        stages: [
            { stage: 1, name: "Self Assessment", score: be.selfScore, weightPct: 30 },
            { stage: 2, name: "BM / HOD Evaluation", score: be.evaluatorScore, weightPct: 25 },
            { stage: 3, name: "Cluster Manager", score: be.cmScore, weightPct: 25 },
            { stage: 4, name: "HR Evaluation", score: be.hrScore, weightPct: 20 },
        ],
        attendancePct: be.attendancePct,
        // `workingHours` column now persists the punctuality % (HR Stage-4 change).
        punctualityPct: be.workingHours,
        attendancePdfUrl: be.attendancePdfUrl,
        punctualityPdfUrl: be.punctualityPdfUrl,
        referenceSheetUrl: be.referenceSheetUrl,
        finalScore: be.finalScore,
        rank: 0,
    });

    const branches = [];
    for (const g of byBranch.values()) {
        let winners = [];
        if (g.branch.branchType === "BIG") {
            const wc = g.wc.slice(0, 1);
            const bc = g.bc.slice(0, 3);
            winners = [...wc, ...bc].map(mapEntry);
        } else {
            winners = g.all.slice(0, 3).map(mapEntry);
        }
        winners.forEach((w, i) => { w.rank = i + 1; });
        branches.push({
            branchId: g.branch.id,
            branchName: g.branch.name,
            branchType: g.branch.branchType,
            expectedCount: g.branch.branchType === "BIG" ? 4 : 3,
            winners,
        });
    }

    // Flat list (backward compat with existing pages)
    const results = branches.flatMap((b) => b.winners);

    return { branches, results };
}
