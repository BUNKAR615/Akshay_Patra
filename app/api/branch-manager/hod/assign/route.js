export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError, created } from "../../../../../lib/api-response";
import { assignHodSchema } from "../../../../../lib/validators";
import { defaultHodSecondaryPasswordFor } from "../../../../../lib/auth/defaultPassword";
import { resolveScopeBranch } from "../../../../../lib/auth/resolveScopeBranch";

const SALT_ROUNDS = 10;

/**
 * POST /api/branch-manager/hod/assign
 * BM assigns an HOD to a department for big branches.
 * Only available for big branch BMs.
 */
export const POST = withRole(["BRANCH_MANAGER"], async (request, { user }) => {
    try {
        const body = await request.json();
        const result = assignHodSchema.safeParse(body);
        if (!result.success) return fail(result.error.errors[0].message);
        const { hodUserId, departmentId } = result.data;

        // Get BM's branch info — JWT first, then BranchManagerAssignment fallback.
        const { branchId, branch } = await resolveScopeBranch(user);
        if (!branchId) return fail("Could not determine your branch");

        const branchType = branch?.branchType;
        if (branchType !== "BIG") return fail("HOD assignment is only available for big branches (Jaipur, Nathdwara)");

        // Verify department belongs to same branch
        const dept = await prisma.department.findUnique({
            where: { id: departmentId },
            select: { id: true, name: true, branchId: true }
        });
        if (!dept || dept.branchId !== branchId) return fail("Department does not belong to your branch");

        // Verify HOD user exists. Fetch User.collarType (the collar source of
        // truth) plus branch info so we can verify branch membership defensively.
        const hodUser = await prisma.user.findUnique({
            where: { id: hodUserId },
            select: {
                id: true, name: true, empCode: true, departmentId: true,
                collarType: true, role: true, passwordHod: true, branchId: true,
                department: { select: { branchId: true } },
            }
        });
        if (!hodUser) return fail("HOD user not found");

        // Defensive branch check — never let an HOD from a different branch
        // be assigned through this BM endpoint. The search endpoint already
        // scopes by branch; this is belt-and-braces for the assign call.
        const userBranchId = hodUser.branchId || hodUser.department?.branchId || null;
        if (!userBranchId || userBranchId !== branchId) {
            return fail(`${hodUser.name} is not in your branch`);
        }

        // Spec rule: only WHITE_COLLAR employees may act as HOD. The check comes
        // from the employee's OWN stored category in this branch
        // (User.collarType) — never from the department (departments carry no
        // collar) or another branch.
        if (hodUser.collarType !== "WHITE_COLLAR") {
            return fail(`${hodUser.name} cannot be HOD — only white-collar employees can act as HOD`);
        }

        // Ensure the dual-login passwordHod is populated. Without passwordHod
        // the Firstname_## role-password login would fail and the HOD could
        // never reach the HOD dashboard.
        //
        // Role: ONLY change role when the current role is EMPLOYEE. Any
        // higher-privilege role (ADMIN, BRANCH_MANAGER, CLUSTER_MANAGER, HR,
        // COMMITTEE, SUPERVISOR) is preserved so HOD nomination is purely
        // additive — admin/BM/CM/HR/committee flows must not be demoted.
        // Existing HOD-role users (legacy promotions) keep that role.
        const promoteData = {};
        if (hodUser.role === "EMPLOYEE") promoteData.role = "HOD";
        if (!hodUser.passwordHod) {
            const plain = defaultHodSecondaryPasswordFor({ empCode: hodUser.empCode, name: hodUser.name });
            promoteData.passwordHod = await bcrypt.hash(plain, SALT_ROUNDS);
        }
        if (Object.keys(promoteData).length > 0) {
            await prisma.user.update({ where: { id: hodUserId }, data: promoteData });
        }

        // Get active quarter
        const quarter = await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
        if (!quarter) return fail("No active quarter");

        // Create or update HOD assignment
        const assignment = await prisma.hodAssignment.upsert({
            where: {
                hodUserId_departmentId_quarterId: {
                    hodUserId,
                    departmentId,
                    quarterId: quarter.id
                }
            },
            update: { assignedBy: user.userId },
            create: {
                hodUserId,
                branchId,
                departmentId,
                quarterId: quarter.id,
                assignedBy: user.userId,
            }
        });

        // Also create DepartmentRoleMapping for HOD if not exists
        await prisma.departmentRoleMapping.upsert({
            where: {
                userId_departmentId_role: {
                    userId: hodUserId,
                    departmentId,
                    role: "HOD"
                }
            },
            update: {},
            create: {
                userId: hodUserId,
                departmentId,
                role: "HOD"
            }
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "HOD_ASSIGNED",
                details: {
                    hodUserId, hodName: hodUser.name,
                    departmentId, departmentName: dept.name,
                    quarterId: quarter.id, branchId
                }
            }
        }).catch(() => {});

        return created({
            message: `${hodUser.name} assigned as HOD for ${dept.name}`,
            assignment
        });
    } catch (err) {
        console.error("[HOD-ASSIGN] Error:", err.message);
        return serverError();
    }
});
