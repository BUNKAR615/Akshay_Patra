export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, notFound, serverError } from "../../../../lib/api-response";

/**
 * GET /api/admin/answer-sheet?employeeId=&stage=1|2|3|4&quarterId=
 *
 * Admin-only. Returns the FULL question-by-question answer sheet for one
 * employee at one stage of one quarter — the live evaluation records.
 *
 * Answer shape across every stage is `[{ questionId, score }]` (score is the
 * Likert value -2..+2). We resolve each questionId to its text so the report
 * shows question number, text, the selected option, and the per-question mark.
 *
 * Stage map:
 *   1 → SelfAssessment            (evaluator = the employee)
 *   2 → BranchManagerEvaluation + HodEvaluation (one or both sections)
 *   3 → ClusterManagerEvaluation
 *   4 → HrEvaluation (attendance/punctuality — no questionnaire)
 *
 * Quarter resolution mirrors /api/admin/reports: ?quarterId → that quarter,
 * else ACTIVE, else most recent. Like that route, scores are deliberately
 * exposed to ADMIN even while the quarter is ACTIVE (audit override).
 */
export const GET = withRole(["ADMIN"], async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const employeeId = searchParams.get("employeeId");
        const stage = Number(searchParams.get("stage"));
        const requestedQuarterId = searchParams.get("quarterId");

        if (!employeeId) return fail("employeeId is required");
        if (![1, 2, 3, 4].includes(stage)) return fail("stage must be 1, 2, 3 or 4");

        // Resolve quarter.
        let quarter = null;
        if (requestedQuarterId) {
            quarter = await prisma.quarter.findUnique({ where: { id: requestedQuarterId } });
            if (!quarter) return notFound("Quarter not found");
        } else {
            quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } })
                || await prisma.quarter.findFirst({ orderBy: { createdAt: "desc" } });
        }
        if (!quarter) return fail("No quarters exist yet");
        const quarterId = quarter.id;

        const employee = await prisma.user.findUnique({
            where: { id: employeeId },
            select: {
                id: true, empCode: true, name: true, designation: true, collarType: true,
                department: { select: { name: true, branch: { select: { name: true, branchType: true } } } },
            },
        });
        if (!employee) return notFound("Employee not found");

        const employeeOut = {
            id: employee.id,
            empCode: employee.empCode || "",
            name: employee.name,
            department: employee.department?.name || "—",
            branchName: employee.department?.branch?.name || "—",
            branchType: employee.department?.branch?.branchType || null,
            designation: employee.designation || "",
            collarType: employee.collarType || null,
        };

        const userPick = { select: { id: true, name: true, empCode: true } };
        const sheets = [];
        let attendance = null;

        // Resolve a list of {questionId, score} answers into numbered question rows.
        const buildQuestions = async (answers) => {
            const list = Array.isArray(answers) ? answers : [];
            const ids = list.map(a => a?.questionId).filter(Boolean);
            const questions = ids.length
                ? await prisma.question.findMany({
                    where: { id: { in: ids } },
                    select: { id: true, text: true, textHindi: true, category: true },
                })
                : [];
            const qMap = new Map(questions.map(q => [q.id, q]));
            return list.map((a, i) => {
                const q = qMap.get(a?.questionId);
                return {
                    number: i + 1,
                    questionId: a?.questionId || null,
                    text: q?.text || "(question not found)",
                    textHindi: q?.textHindi || "",
                    category: q?.category || null,
                    score: typeof a?.score === "number" ? a.score : null,
                };
            });
        };

        if (stage === 1) {
            const self = await prisma.selfAssessment.findUnique({
                where: { userId_quarterId: { userId: employeeId, quarterId } },
                select: { answers: true, submittedAt: true, rawScore: true, maxScore: true, normalizedScore: true },
            }).catch(() => null);
            if (self) {
                sheets.push({
                    role: "Self Assessment",
                    evaluatorName: employee.name,
                    evaluatorEmpCode: employee.empCode || "",
                    submittedAt: self.submittedAt,
                    rawScore: self.rawScore, maxScore: self.maxScore, normalizedScore: self.normalizedScore,
                    questions: await buildQuestions(self.answers),
                });
            }
        } else if (stage === 2) {
            const [bm, hod] = await Promise.all([
                prisma.branchManagerEvaluation.findFirst({
                    where: { employeeId, quarterId },
                    select: { answers: true, submittedAt: true, bmRawScore: true, bmNormalized: true, manager: userPick },
                }).catch(() => null),
                prisma.hodEvaluation.findFirst({
                    where: { employeeId, quarterId },
                    select: { answers: true, submittedAt: true, hodRawScore: true, hodNormalized: true, hod: userPick },
                }).catch(() => null),
            ]);
            if (bm) {
                sheets.push({
                    role: "Branch Manager",
                    evaluatorName: bm.manager?.name || "—",
                    evaluatorEmpCode: bm.manager?.empCode || "",
                    submittedAt: bm.submittedAt,
                    rawScore: bm.bmRawScore, maxScore: (Array.isArray(bm.answers) ? bm.answers.length : 0) * 2, normalizedScore: bm.bmNormalized,
                    questions: await buildQuestions(bm.answers),
                });
            }
            if (hod) {
                sheets.push({
                    role: "HOD",
                    evaluatorName: hod.hod?.name || "—",
                    evaluatorEmpCode: hod.hod?.empCode || "",
                    submittedAt: hod.submittedAt,
                    rawScore: hod.hodRawScore, maxScore: (Array.isArray(hod.answers) ? hod.answers.length : 0) * 2, normalizedScore: hod.hodNormalized,
                    questions: await buildQuestions(hod.answers),
                });
            }
        } else if (stage === 3) {
            const cm = await prisma.clusterManagerEvaluation.findFirst({
                where: { employeeId, quarterId },
                select: { answers: true, submittedAt: true, cmRawScore: true, cmNormalized: true, finalScore: true, cluster: userPick },
            }).catch(() => null);
            if (cm) {
                sheets.push({
                    role: "Cluster Manager",
                    evaluatorName: cm.cluster?.name || "—",
                    evaluatorEmpCode: cm.cluster?.empCode || "",
                    submittedAt: cm.submittedAt,
                    rawScore: cm.cmRawScore, maxScore: (Array.isArray(cm.answers) ? cm.answers.length : 0) * 2, normalizedScore: cm.cmNormalized,
                    questions: await buildQuestions(cm.answers),
                });
            }
        } else if (stage === 4) {
            const hr = await prisma.hrEvaluation.findFirst({
                where: { employeeId, quarterId },
                select: {
                    submittedAt: true, attendancePct: true, workingHours: true,
                    presentDays: true, punctualDays: true, workingDays: true,
                    hrScore: true, notes: true, attendancePdfUrl: true, punctualityPdfUrl: true,
                    referenceSheetUrl: true, hr: userPick,
                },
            }).catch(() => null);
            if (hr) {
                attendance = {
                    evaluatorName: hr.hr?.name || "—",
                    evaluatorEmpCode: hr.hr?.empCode || "",
                    submittedAt: hr.submittedAt,
                    attendancePct: hr.attendancePct,
                    punctualityPct: hr.workingHours,
                    presentDays: hr.presentDays,
                    punctualDays: hr.punctualDays,
                    workingDays: hr.workingDays,
                    hrScore: hr.hrScore,
                    notes: hr.notes || "",
                    attendancePdfUrl: hr.attendancePdfUrl || null,
                    punctualityPdfUrl: hr.punctualityPdfUrl || null,
                    referenceSheetUrl: hr.referenceSheetUrl || null,
                };
            }
        }

        return ok({
            employee: employeeOut,
            quarter: { id: quarter.id, name: quarter.name, status: quarter.status },
            stage,
            sheets,
            attendance,
            exportedAt: new Date().toISOString(),
        });
    } catch (err) {
        console.error("[ADMIN-ANSWER-SHEET] Error:", err.message);
        return serverError();
    }
});
