export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";
import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, notFound, forbidden, conflict, created, handleApiError } from "../../../../../../lib/api-response";
import { requireBranchScope } from "../../../../../../lib/auth/requireBranchScope";
import { resolveBranch } from "../../../../../../lib/resolveBranch";
import { defaultPasswordFor } from "../../../../../../lib/auth/defaultPassword";

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
        const departmentIdFilter = searchParams.get("departmentId");
        const requestedQuarterId = searchParams.get("quarterId");

        // Resolve the quarter that scopes the HOD listing. Explicit `?quarterId=`
        // selects an archived quarter for the admin's history view; otherwise
        // we default to the ACTIVE quarter. Falls through to `null` when no
        // quarter exists yet — HOD union below is then skipped.
        let scopeQuarterId = null;
        if (requestedQuarterId) {
            const q = await prisma.quarter.findUnique({
                where: { id: requestedQuarterId },
                select: { id: true },
            });
            if (!q) return notFound("Quarter not found");
            scopeQuarterId = q.id;
        } else {
            const active = await prisma.quarter.findFirst({
                where: { status: "ACTIVE" },
                select: { id: true },
            });
            scopeQuarterId = active?.id || null;
        }

        const where = {
            OR: [{ branchId }, { department: { branchId } }],
        };
        if (roleFilter) where.role = roleFilter;
        if (departmentIdFilter) {
            // Restrict to the requested department, but keep the branch scope by
            // requiring the department itself to belong to this branch — prevents
            // a forged departmentId from a different branch from leaking rows.
            where.department = { id: departmentIdFilter, branchId };
            // Drop the OR clause: a row scoped only by branchId (e.g. BM with no
            // departmentId) shouldn't appear when filtering by department.
            delete where.OR;
        }

        const userSelect = {
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
        };

        const users = await prisma.user.findMany({
            where,
            select: userSelect,
            orderBy: [{ role: "asc" }, { name: "asc" }],
        });

        // Union in role-holders whose User.branchId is null because they live
        // in the assignment tables (CM and HR can serve multiple branches; a
        // single Committee row is per (member, branch)). BM is already covered
        // because applyBmAssignment writes User.branchId. We also fold in HODs
        // who have an active HodAssignment for this branch — they're EMPLOYEE
        // role users in the schema, but for this branch they wear the HOD hat.
        // Skipped when filtering by departmentId (those queries are dept-scoped
        // and role-holders have no department).
        let extraRoleHolders = [];
        if (!departmentIdFilter) {
            const [cmRows, hrRows, committeeRows, hodRows] = await Promise.all([
                (!roleFilter || roleFilter === "CLUSTER_MANAGER")
                    ? prisma.clusterManagerBranchAssignment.findMany({
                        where: { branchId },
                        select: { cm: { select: userSelect } },
                    })
                    : Promise.resolve([]),
                (!roleFilter || roleFilter === "HR")
                    ? prisma.hrBranchAssignment.findMany({
                        where: { branchId },
                        select: { hr: { select: userSelect } },
                    })
                    : Promise.resolve([]),
                (!roleFilter || roleFilter === "COMMITTEE")
                    ? prisma.committeeBranchAssignment.findMany({
                        where: { branchId },
                        select: { member: { select: userSelect } },
                    })
                    : Promise.resolve([]),
                // HOD union is quarter-scoped: for archive views we pin to the
                // requested quarter's HodAssignment rows (which are preserved
                // by quarterReset). When no quarter is resolvable we return
                // an empty union rather than leaking cross-quarter HODs.
                (!roleFilter || roleFilter === "HOD") && scopeQuarterId
                    ? prisma.hodAssignment.findMany({
                        where: { branchId, quarterId: scopeQuarterId },
                        select: { hod: { select: userSelect } },
                    })
                    : Promise.resolve([]),
            ]);
            extraRoleHolders = [
                ...cmRows.map((r) => r.cm),
                ...hrRows.map((r) => r.hr),
                ...committeeRows.map((r) => r.member),
                ...hodRows.map((r) => r.hod),
            ];
        }

        // Dedupe: assignment-table users may already appear in `users` (e.g. a BM).
        // Map keyed on user.id keeps a single row; existing branchId-scoped row wins.
        const merged = new Map();
        for (const u of users) merged.set(u.id, u);
        for (const u of extraRoleHolders) if (!merged.has(u.id)) merged.set(u.id, u);

        const finalUsers = [...merged.values()].sort((a, b) => {
            if (a.role !== b.role) return String(a.role).localeCompare(String(b.role));
            return String(a.name || "").localeCompare(String(b.name || ""));
        });

        return ok({ employees: finalUsers, branch: { id: branch.id, name: branch.name, branchType: branch.branchType } });
    } catch (err) {
        return handleApiError(err, "BRANCH-EMPLOYEES");
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
        const { name, mobile, departmentName, joiningDate, reason, empCode, designation, collarType } = body;

        if (!name || !departmentName) {
            return fail("Name and department are required");
        }

        // Optional collarType from the form. Validate against the enum;
        // fall back to the department's default collar when not provided.
        const VALID_COLLAR = ["BLUE_COLLAR", "WHITE_COLLAR"];
        let resolvedCollar = null;
        if (collarType !== undefined && collarType !== null && collarType !== "") {
            if (!VALID_COLLAR.includes(collarType)) {
                return fail(`Invalid collarType "${collarType}". Must be BLUE_COLLAR or WHITE_COLLAR.`);
            }
            resolvedCollar = collarType;
        }

        const dept = await prisma.department.findFirst({ where: { name: departmentName, branchId } });
        if (!dept) {
            return fail(`Department "${departmentName}" not found in ${branch.name}`);
        }

        if (empCode) {
            const existing = await prisma.user.findUnique({ where: { empCode } });
            if (existing) return conflict(`Employee code "${empCode}" already exists`);
        }

        // Default password for EMPLOYEE = empCode (per spec).
        const rawPassword = defaultPasswordFor({ role: "EMPLOYEE", empCode: empCode || `tmp${Date.now()}`, name });
        const hashedPassword = await bcrypt.hash(rawPassword, 10);

        const newUser = await prisma.user.create({
            data: {
                empCode: empCode || null,
                name: name.toUpperCase(),
                password: hashedPassword,
                role: "EMPLOYEE",
                branchId,
                departmentId: dept.id,
                collarType: resolvedCollar || dept.collarType,
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
        return handleApiError(err, "BRANCH-ADD-EMPLOYEE");
    }
}, { allowedEmpCodes: HR_ALLOWED });
