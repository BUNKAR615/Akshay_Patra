export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, serverError, notFound, forbidden, conflict, created } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";
import { resolveBranch } from "../../../../../../lib/resolveBranch";

// Only these two empCodes can add employees (mirrors /api/admin/employees POST)
const HR_ALLOWED = ["1800349", "5100029"];

/**
 * GET /api/admin/branches/[branchId]/employees
 * Returns all users belonging to a branch (employees + branch staff).
 * Supports optional `role` query filter: EMPLOYEE | BRANCH_MANAGER | CLUSTER_MANAGER | HOD
 */
export const GET = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await resolveBranch(slugOrId);
        if (!branch) return notFound("Branch not found");
        const branchId = branch.id;

        const { searchParams } = new URL(request.url);
        const roleFilter = searchParams.get("role");

        const where = {
            OR: [{ branchId }, { department: { branchId } }],
        };
        if (roleFilter) where.role = roleFilter;

        const users = await prisma.user.findMany({
            where,
            select: {
                id: true,
                empCode: true,
                name: true,
                mobile: true,
                designation: true,
                role: true,
                collarType: true,
                branchId: true,
                departmentId: true,
                department: { select: { id: true, name: true, collarType: true, branchId: true } },
                createdAt: true,
            },
            orderBy: [{ role: "asc" }, { name: "asc" }],
        });

        return ok({ employees: users, branch: { id: branch.id, name: branch.name, branchType: branch.branchType } });
    } catch (err) {
        console.error("[BRANCH-EMPLOYEES] Error:", err.message);
        return serverError();
    }
});

/**
 * POST /api/admin/branches/[branchId]/employees
 * Add a single employee scoped to this branch. Department is resolved within
 * the branch (name + branchId). Mirrors the global /api/admin/employees POST
 * but targets the URL's branchId instead of a name-only department lookup.
 */
export const POST = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        if (!HR_ALLOWED.includes(user.empCode)) {
            return forbidden("You are not authorized to add employees");
        }

        const { branchId: slugOrId, error } = requireBranchScope(user, params);
        if (error) return error;

        const branch = await resolveBranch(slugOrId);
        if (!branch) return notFound("Branch not found");
        const branchId = branch.id;

        const body = await request.json();
        const { name, mobile, departmentName, joiningDate, reason, empCode, designation } = body;

        if (!name || !departmentName) {
            return fail("Name and department are required");
        }

        const dept = await prisma.department.findFirst({ where: { name: departmentName, branchId } });
        if (!dept) {
            return fail(`Department "${departmentName}" not found in ${branch.name}`);
        }

        if (empCode) {
            const existing = await prisma.user.findUnique({ where: { empCode } });
            if (existing) return conflict(`Employee code "${empCode}" already exists`);
        }

        const firstName = name.split(" ")[0];
        const codeSuffix = empCode ? empCode.slice(-2) : String(Date.now()).slice(-2);
        const rawPassword = `${firstName}_${codeSuffix}`;
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        const newUser = await prisma.user.create({
            data: {
                empCode: empCode || null,
                name: name.toUpperCase(),
                password: hashedPassword,
                role: "EMPLOYEE",
                branchId,
                departmentId: dept.id,
                collarType: dept.collarType,
                designation: designation || null,
                mobile: mobile || null,
            },
            select: {
                id: true, empCode: true, name: true,
                role: true, designation: true, mobile: true,
                department: { select: { name: true } },
            },
        });

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "EMPLOYEE_ADDED",
                details: {
                    newEmployeeId: newUser.id,
                    name: newUser.name,
                    branchId,
                    branchName: branch.name,
                    department: departmentName,
                    joiningDate: joiningDate || null,
                    reason: reason || null,
                    addedBy: user.empCode,
                },
            },
        }).catch(() => {});

        return created({ employee: newUser, defaultPassword: rawPassword });
    } catch (err) {
        console.error("[BRANCH-ADD-EMPLOYEE] Error:", err.message);
        return serverError();
    }
}, { allowedEmpCodes: HR_ALLOWED });
