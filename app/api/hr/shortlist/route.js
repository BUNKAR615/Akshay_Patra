export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, fail, forbidden, serverError } from "../../../../lib/api-response";
import { resolveScopeBranch, resolveAllScopeBranches } from "../../../../lib/auth/resolveScopeBranch";

// An HR person must never see THEMSELVES as a candidate, and pure staff
// (HR / BM / CM / Committee / Admin) are never Best-Employee candidates — they
// only evaluate. This guards against a staff member who was shortlisted while
// still an EMPLOYEE (stale Stage-1..3 rows that survive promotion) resurfacing
// in — and being evaluable through — their OWN HR dashboard. It mirrors the
// shortlist *generation* filter (role: 'EMPLOYEE') in lib/shortlistManager.ts.
const NON_CANDIDATE_ROLES = ["HR", "BRANCH_MANAGER", "CLUSTER_MANAGER", "COMMITTEE", "ADMIN"];

/**
 * GET /api/hr/shortlist
 *
 * Branch-scope semantics (mirrors the CM departments route):
 *   - ?branchId=<id>  → focus on that branch (must be in the HR's
 *                       HrBranchAssignment table).
 *   - omitted / empty / "ALL" → Total mode: merge Stage 3 shortlists across
 *                       every branch this HR is assigned to. Each employee
 *                       carries branchId/branchName for in-row labeling.
 *
 * Total is the default — the pre-login branch picker has been removed.
 * The returned `assignedBranches` array drives the dashboard dropdown
 * (with per-branch progress counts).
 */
export const GET = withRole(["HR", "ADMIN"], async (request, { user }) => {
    try {
        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        const { searchParams } = new URL(request.url);
        const requested = (searchParams.get("branchId") || "").trim();
        const isTotal = !requested || requested.toUpperCase() === "ALL";

        // All branches this HR is assigned to — source of truth for both
        // the dropdown and the data scope in Total mode.
        const allAssignedBranches = await resolveAllScopeBranches({
            userId: user.userId,
            role: "HR",
        });

        // ADMIN bypass: when an admin hits this route (e.g. for QA) without
        // explicit branchId, fall back to user.branchId to avoid touching
        // every branch in the system. HR users always have at least one
        // assignment by the time they reach a dashboard (login guards it).
        if (allAssignedBranches.length === 0 && user.role !== "ADMIN") {
            return forbidden("You are not assigned to any branch. Please contact your administrator.");
        }

        let targetBranches;
        if (isTotal) {
            if (allAssignedBranches.length === 0 && user.role === "ADMIN") {
                // ADMIN with no explicit branch and no HR assignments — keep
                // legacy fallback to the JWT branch so audit screens work.
                const fallback = await resolveScopeBranch(user);
                if (!fallback.branchId) return fail("Could not determine branch.");
                targetBranches = [
                    { id: fallback.branchId, name: fallback.branch?.name || "", branchType: fallback.branch?.branchType || "" },
                ];
            } else {
                targetBranches = allAssignedBranches.map((b) => ({ id: b.id, name: b.name, branchType: b.branchType }));
            }
        } else {
            // Validate the requested branch against the HR's assignment table.
            const { branch } = await resolveScopeBranch({
                userId: user.userId,
                role: "HR",
                branchId: requested,
            });
            if (!branch) {
                // ADMIN can still focus on any branch — surface a softer 404
                // for HR users so the dashboard renders the empty-state
                // rather than booting them to login.
                if (user.role === "ADMIN") {
                    const adminBranch = await prisma.branch.findUnique({
                        where: { id: requested },
                        select: { id: true, name: true, branchType: true },
                    });
                    if (!adminBranch) return fail("Branch not found", 404);
                    targetBranches = [adminBranch];
                } else {
                    return forbidden("You are not authorized for this branch. Please sign in again.");
                }
            } else {
                targetBranches = [branch];
            }
        }

        const targetBranchIds = targetBranches.map((b) => b.id);
        const branchById = new Map(targetBranches.map((b) => [b.id, b]));

        // Stage 3 shortlisted employees across the target branches.
        // Exclude the HR viewer themselves and any staff role-holder so no one
        // can be a candidate in a branch they evaluate (no self-evaluation,
        // and an HR person never appears as a Best-Employee candidate).
        const shortlisted = await prisma.branchShortlistStage3.findMany({
            where: {
                branchId: { in: targetBranchIds },
                quarterId: quarter.id,
                userId: { not: user.userId },
                user: { role: { notIn: NON_CANDIDATE_ROLES } },
            },
            include: {
                user: {
                    select: {
                        id: true, name: true, empCode: true, designation: true, collarType: true,
                        department: { select: { name: true, branchId: true } },
                    },
                },
            },
            orderBy: [{ branchId: "asc" }, { collarType: "asc" }, { rank: "asc" }],
        });

        // HR's already-submitted evaluations across the active quarter.
        const evaluations = await prisma.hrEvaluation.findMany({
            where: { hrUserId: user.userId, quarterId: quarter.id },
            select: { employeeId: true, attendancePct: true, workingHours: true, attendancePdfUrl: true, punctualityPdfUrl: true, referenceSheetUrl: true, hrScore: true, notes: true },
        });
        const evalMap = new Map(evaluations.map((e) => [e.employeeId, e]));

        // HR must not see stage-wise or combined scores — those are restricted
        // to the Committee view. We deliberately omit selfScore, evaluatorScore,
        // cmScore, combinedScore, and rank so the data never reaches the
        // browser, even via dev-tools.
        const employees = shortlisted.map((s) => {
            const ev = evalMap.get(s.user.id);
            const b = branchById.get(s.branchId);
            return {
                ...s.user,
                collarType: s.collarType,
                branchId: s.branchId,
                branchName: b?.name || "",
                hrEvaluated: !!ev,
                attendancePct: ev?.attendancePct ?? null,
                // `workingHours` column now persists the punctuality % (see evaluate route).
                punctualityPct: ev?.workingHours ?? null,
                attendancePdfUrl: ev?.attendancePdfUrl ?? null,
                punctualityPdfUrl: ev?.punctualityPdfUrl ?? null,
                referenceSheetUrl: ev?.referenceSheetUrl ?? null,
                hrNotes: ev?.notes ?? null,
            };
        });

        // Per-branch progress strip for the dropdown — always show every
        // assigned branch so the dashboard's dropdown options are stable
        // regardless of which branch is currently focused.
        const assignedBranches = await Promise.all(
            allAssignedBranches.map(async (b) => {
                const stage3Count = await prisma.branchShortlistStage3.count({
                    where: {
                        branchId: b.id,
                        quarterId: quarter.id,
                        userId: { not: user.userId },
                        user: { role: { notIn: NON_CANDIDATE_ROLES } },
                    },
                });
                const evaluatedHere = stage3Count > 0
                    ? await prisma.hrEvaluation.count({
                        where: {
                            hrUserId: user.userId,
                            quarterId: quarter.id,
                            employee: { department: { branchId: b.id } },
                        },
                    })
                    : 0;
                return {
                    id: b.id,
                    name: b.name,
                    branchType: b.branchType,
                    totalToEvaluate: stage3Count,
                    evaluated: evaluatedHere,
                };
            })
        );

        // Totals across all assigned branches (for the Total tile / progress).
        const totalToEvaluateAll = assignedBranches.reduce((n, b) => n + b.totalToEvaluate, 0);
        const totalEvaluatedAll = assignedBranches.reduce((n, b) => n + b.evaluated, 0);

        return ok({
            employees,
            branch: isTotal ? null : targetBranches[0],
            mode: isTotal ? "TOTAL" : "BRANCH",
            quarterId: quarter.id,
            assignedBranches,
            totalEvaluated: isTotal ? totalEvaluatedAll : employees.filter((e) => e.hrEvaluated).length,
            totalToEvaluate: isTotal ? totalToEvaluateAll : employees.length,
        });
    } catch (err) {
        console.error("[HR-SHORTLIST] Error:", err.message);
        return serverError();
    }
});
