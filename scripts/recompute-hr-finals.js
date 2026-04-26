/**
 * Recompute HrEvaluation.stage4CombinedScore and BranchBestEmployee.finalScore
 * for the current ACTIVE quarter, using the corrected Stage 4 reverse-formula.
 *
 * Background:
 *   Before this fix, app/api/hr/evaluate/route.js reverse-engineered the
 *   normalized evaluator/cm scores incorrectly (divided by 0.30 instead of
 *   recognizing that evaluatorScore is a 0-40 weighted contribution and
 *   cmScore is already 0-100 normalized). Every HR evaluation in the current
 *   quarter therefore stored the wrong contributions and final score.
 *
 * Closed quarters are intentionally NOT touched — published winners remain
 * historical record.
 *
 * Run:  node scripts/recompute-hr-finals.js
 *       node scripts/recompute-hr-finals.js --dry-run    (preview only)
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

function round2(n) {
    return Math.round(n * 100) / 100;
}

function calculateBranchFinalScore(selfNorm, evaluatorNorm, cmNorm, hrNorm) {
    const selfContribution = round2((selfNorm / 100) * 30);
    const evaluatorContribution = round2((evaluatorNorm / 100) * 25);
    const cmContribution = round2((cmNorm / 100) * 25);
    const hrContribution = round2((hrNorm / 100) * 20);
    const finalScore = round2(selfContribution + evaluatorContribution + cmContribution + hrContribution);
    return { selfContribution, evaluatorContribution, cmContribution, hrContribution, finalScore };
}

async function main() {
    const activeQuarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
    if (!activeQuarter) {
        console.log("No ACTIVE quarter found. Nothing to recompute.");
        return;
    }
    console.log(`Active quarter: ${activeQuarter.name} (${activeQuarter.id})`);
    console.log(DRY_RUN ? "Mode: DRY RUN (no writes)" : "Mode: WRITE");
    console.log("");

    const hrEvals = await prisma.hrEvaluation.findMany({
        where: { quarterId: activeQuarter.id },
        orderBy: { submittedAt: "asc" },
    });
    console.log(`Found ${hrEvals.length} HR evaluations in active quarter`);
    if (hrEvals.length === 0) return;

    let hrUpdated = 0;
    let bestUpdated = 0;
    const touchedUserIds = [];

    for (const ev of hrEvals) {
        const stage3 = await prisma.branchShortlistStage3.findUnique({
            where: { userId_quarterId: { userId: ev.employeeId, quarterId: ev.quarterId } },
        });
        const selfAssess = await prisma.selfAssessment.findUnique({
            where: { userId_quarterId: { userId: ev.employeeId, quarterId: ev.quarterId } },
        });
        if (!stage3 || !selfAssess) {
            console.log(`  SKIP employee ${ev.employeeId} — missing stage3 or self-assessment`);
            continue;
        }

        const selfNorm = selfAssess.normalizedScore;
        const evaluatorNorm = (stage3.evaluatorScore / 40) * 100;
        const cmNorm = stage3.cmScore;
        const hrNorm = Math.max(0, Math.min(100, ev.hrScore || 0));

        const next = calculateBranchFinalScore(selfNorm, evaluatorNorm, cmNorm, hrNorm);

        const beforeFinal = ev.stage4CombinedScore;
        const afterFinal = next.finalScore;
        const delta = round2(afterFinal - beforeFinal);

        console.log(
            `  emp=${ev.employeeId} | self=${selfNorm} eval=${round2(evaluatorNorm)} cm=${cmNorm} hr=${hrNorm} | ` +
            `final ${beforeFinal} -> ${afterFinal} (Δ ${delta >= 0 ? "+" : ""}${delta})`
        );

        if (!DRY_RUN) {
            await prisma.hrEvaluation.update({
                where: { id: ev.id },
                data: {
                    selfContribution: next.selfContribution,
                    evaluatorContribution: next.evaluatorContribution,
                    cmContribution: next.cmContribution,
                    hrContribution: next.hrContribution,
                    stage4CombinedScore: next.finalScore,
                },
            });
            hrUpdated++;
            touchedUserIds.push(ev.employeeId);
        }
    }

    if (!DRY_RUN && touchedUserIds.length > 0) {
        const bestRows = await prisma.branchBestEmployee.findMany({
            where: { quarterId: activeQuarter.id, userId: { in: touchedUserIds } },
        });
        console.log("");
        console.log(`Updating ${bestRows.length} BranchBestEmployee row(s)...`);

        for (const best of bestRows) {
            const matchingEval = await prisma.hrEvaluation.findFirst({
                where: { quarterId: activeQuarter.id, employeeId: best.userId },
                orderBy: { submittedAt: "desc" },
            });
            if (!matchingEval) continue;
            await prisma.branchBestEmployee.update({
                where: { id: best.id },
                data: {
                    selfScore: matchingEval.selfContribution,
                    evaluatorScore: matchingEval.evaluatorContribution,
                    cmScore: matchingEval.cmContribution,
                    hrScore: matchingEval.hrContribution,
                    finalScore: matchingEval.stage4CombinedScore,
                },
            });
            bestUpdated++;
            console.log(`  best userId=${best.userId} | finalScore ${best.finalScore} -> ${matchingEval.stage4CombinedScore}`);
        }
    }

    console.log("");
    console.log(`Done. hrEvaluation updates: ${hrUpdated}, branchBestEmployee updates: ${bestUpdated}`);
    if (DRY_RUN) console.log("Dry run — no rows were actually modified.");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(async () => { await prisma.$disconnect(); });
