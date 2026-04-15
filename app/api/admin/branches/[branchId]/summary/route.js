export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, serverError, notFound } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";

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
        const { branchId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            include: { _count: { select: { departments: true } } },
        });
        if (!branch) return notFound("Branch not found");

        const quarter = await prisma.quarter.findFirst({
            where: { status: "ACTIVE" },
            select: { id: true, name: true, status: true, year: true, number: true },
        });

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

        let stage1 = 0, stage2 = 0, stage3 = 0, stage4 = 0, winners = 0;
        if (quarter) {
            [stage1, stage2, stage3, stage4, winners] = await Promise.all([
                prisma.branchShortlistStage1.count({ where: { branchId, quarterId: quarter.id } }),
                prisma.branchShortlistStage2.count({ where: { branchId, quarterId: quarter.id } }),
                prisma.branchShortlistStage3.count({ where: { branchId, quarterId: quarter.id } }),
                prisma.branchShortlistStage4.count({ where: { branchId, quarterId: quarter.id } }),
                prisma.branchBestEmployee.count({ where: { branchId, quarterId: quarter.id } }),
            ]);
        }

        return ok({
            branch: {
                id: branch.id,
                name: branch.name,
                location: branch.location,
                branchType: branch.branchType,
                createdAt: branch.createdAt,
            },
            quarter,
            counts: {
                employees,
                departments: branch._count.departments,
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
            },
        });
    } catch (err) {
        console.error("[BRANCH-SUMMARY] Error:", err.message);
        return serverError();
    }
});
