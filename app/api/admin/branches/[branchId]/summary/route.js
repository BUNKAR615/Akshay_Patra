export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, serverError, notFound } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";
import { resolveBranch } from "../../../../../../lib/resolveBranch";

/**
 * GET /api/admin/branches/[branchId]/summary
 * Returns branch meta + stage-wise candidate counts for the ACTIVE quarter.
 *
 * Response shape:
 * {
 *   branch: { id, name, location, branchType, ... },
 *   quarter: { id, name, status } | null,
 *   counts: {
 *     employees, departments, bm, cm, hr, committee, hod,
 *     stage1, stage2, stage3, stage4, winners
 *   }
 * }
 */
export const GET = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await resolveBranch(slugOrId);
        if (!branch) return notFound("Branch not found");
        const branchId = branch.id;

        const branchWithCount = await prisma.branch.findUnique({
            where: { id: branchId },
            include: { _count: { select: { departments: true } } },
        });

        // Resolve quarter: explicit `?quarterId=` → that quarter; otherwise
        // the active quarter (or null when none active — counts stay 0).
        const { searchParams } = new URL(request.url);
        const requestedQuarterId = searchParams.get("quarterId");
        let quarter = null;
        if (requestedQuarterId) {
            quarter = await prisma.quarter.findUnique({
                where: { id: requestedQuarterId },
                select: { id: true, name: true, status: true },
            });
            if (!quarter) return notFound("Quarter not found");
        } else {
            quarter = await prisma.quarter.findFirst({
                where: { status: "ACTIVE" },
                select: { id: true, name: true, status: true },
            });
        }

        const [
            employees,
            bm,
            cm,
            hods,
            hrAssigned,
            committeeAssigned,
        ] = await Promise.all([
            prisma.user.count({
                where: {
                    role: "EMPLOYEE",
                    OR: [{ branchId }, { department: { branchId } }],
                },
            }),
            prisma.user.count({ where: { role: "BRANCH_MANAGER", branchId } }),
            prisma.user.count({ where: { role: "CLUSTER_MANAGER", branchId } }),
            prisma.user.count({
                where: { role: "HOD", OR: [{ branchId }, { department: { branchId } }] },
            }),
            prisma.hrBranchAssignment.count({ where: { branchId } }),
            prisma.committeeBranchAssignment.count({ where: { branchId } }),
        ]);

        let stage1 = 0, stage2 = 0, stage3 = 0, stage4 = 0, winners = 0, hrParticipated = 0;
        if (quarter) {
            [stage1, stage2, stage3, stage4, winners] = await Promise.all([
                prisma.branchShortlistStage1.count({ where: { branchId, quarterId: quarter.id } }),
                prisma.branchShortlistStage2.count({ where: { branchId, quarterId: quarter.id } }),
                prisma.branchShortlistStage3.count({ where: { branchId, quarterId: quarter.id } }),
                prisma.branchShortlistStage4.count({ where: { branchId, quarterId: quarter.id } }),
                prisma.branchBestEmployee.count({ where: { branchId, quarterId: quarter.id } }),
            ]);

            // Distinct employees actually evaluated by HR this quarter — i.e.
            // those who participated in the HR round. `distinct` guards against
            // double-counting if more than one HR evaluates the same employee.
            const hrEvalRows = await prisma.hrEvaluation.findMany({
                where: { quarterId: quarter.id, employee: { department: { branchId } } },
                select: { employeeId: true },
                distinct: ['employeeId'],
            });
            hrParticipated = hrEvalRows.length;
        }

        return ok({
            branch: {
                id: branch.id,
                name: branch.name,
                slug: branch.slug,
                location: branch.location,
                branchType: branch.branchType,
                createdAt: branch.createdAt,
            },
            quarter,
            counts: {
                employees,
                departments: branchWithCount._count.departments,
                bm,
                cm,
                hod: hods,
                hr: hrAssigned,
                committee: committeeAssigned,
                stage1,
                stage2,
                stage3,
                stage4,
                winners,
                hrParticipated,
            },
        });
    } catch (err) {
        console.error("[BRANCH-SUMMARY] Error:", err.message);
        return serverError();
    }
});
