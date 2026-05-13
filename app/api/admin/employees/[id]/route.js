export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import bcrypt from "bcryptjs";
import { withRole } from "../../../../../lib/withRole";
import { NextResponse } from "next/server";
import { assertBmAssignable, applyBmAssignment, clearBmAssignment } from "../../../../../lib/auth/bmAssignment";

/**
 * DELETE /api/admin/employees/[id]
 * Archive an employee — writes ArchivedEmployee row, then hard-deletes the
 * User row. Open to any ADMIN; the existing role===ADMIN guard on the target
 * still prevents demoting the system admin.
 */
export const DELETE = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { id } = await params;
        const body = await request.json();
        const { reasonLeaving } = body;

        if (!reasonLeaving) {
            return NextResponse.json(
                { success: false, message: "Reason for leaving is required" },
                { status: 400 }
            );
        }

        // Find the employee with full details
        const employee = await prisma.user.findUnique({
            where: { id },
            include: {
                department: { select: { id: true, name: true, supervisorId: true, branchManagerId: true } },
                departmentRoles: { select: { id: true, role: true, departmentId: true } },
            },
        });

        if (!employee) {
            return NextResponse.json(
                { success: false, message: "Employee not found" },
                { status: 404 }
            );
        }

        // Don't allow removing admins
        if (employee.role === "ADMIN") {
            return NextResponse.json(
                { success: false, message: "Cannot remove admin users" },
                { status: 403 }
            );
        }

        // Archive the employee record
        await prisma.archivedEmployee.create({
            data: {
                empCode: employee.empCode,
                name: employee.name,
                mobile: employee.mobile,
                designation: employee.designation,
                department: employee.department?.name || "Unknown",
                joiningDate: employee.createdAt,
                reasonLeaving,
                archivedBy: user.empCode,
                originalUserId: employee.id,
            },
        });

        // Clean up department FK shortcuts if this user was a BM
        const deptUpdates = [];
        for (const dr of employee.departmentRoles) {
            if (dr.role === "BRANCH_MANAGER") {
                deptUpdates.push(
                    prisma.department.updateMany({
                        where: { id: dr.departmentId, branchManagerId: id },
                        data: { branchManagerId: null },
                    })
                );
            }
        }
        if (deptUpdates.length > 0) await Promise.all(deptUpdates);

        // Clean up all related records in order (before deleting user due to cascade)
        // DepartmentRoleMapping, Notifications, EmployeeQuarterQuestions are cascaded,
        // but shortlists and evaluations need explicit cleanup for data integrity
        await Promise.all([
            prisma.departmentRoleMapping.deleteMany({ where: { userId: id } }),
            prisma.notification.deleteMany({ where: { userId: id } }),
            prisma.employeeQuarterQuestions.deleteMany({ where: { employeeId: id } }),
            prisma.shortlistStage1.deleteMany({ where: { userId: id } }),
            prisma.shortlistStage2.deleteMany({ where: { userId: id } }),
            prisma.shortlistStage3.deleteMany({ where: { userId: id } }),
            prisma.bestEmployee.deleteMany({ where: { userId: id } }),
        ]);

        // Clean evaluations (as employee being evaluated)
        await Promise.all([
            prisma.selfAssessment.deleteMany({ where: { userId: id } }),
            prisma.supervisorEvaluation.deleteMany({ where: { employeeId: id } }),
            prisma.branchManagerEvaluation.deleteMany({ where: { employeeId: id } }),
            prisma.clusterManagerEvaluation.deleteMany({ where: { employeeId: id } }),
        ]);

        // Clean evaluations given by this user (as evaluator)
        await Promise.all([
            prisma.supervisorEvaluation.deleteMany({ where: { supervisorId: id } }),
            prisma.branchManagerEvaluation.deleteMany({ where: { managerId: id } }),
            prisma.clusterManagerEvaluation.deleteMany({ where: { clusterId: id } }),
        ]);

        // Delete the user
        await prisma.user.delete({ where: { id } });

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "EMPLOYEE_REMOVED",
                details: {
                    removedEmployeeId: id,
                    name: employee.name,
                    empCode: employee.empCode,
                    department: employee.department?.name,
                    reasonLeaving,
                    removedBy: user.empCode,
                },
            },
        }).catch(() => {});

        return NextResponse.json({
            success: true,
            data: { message: `${employee.name} has been archived and removed` },
        });
    } catch (err) {
        console.error("[REMOVE EMPLOYEE] Error:", err);
        return NextResponse.json(
            { success: false, message: "Server error" },
            { status: 500 }
        );
    }
});

/**
 * PATCH /api/admin/employees/[id]
 * Edit employee details: department, role, designation, password.
 * Only Rishpal Kumar (ADMIN) can do this.
 * Sends a notification to the employee listing what was changed.
 * On department change, clears old dept FK shortcuts (supervisorId/branchManagerId).
 */
export const PATCH = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { id } = await params;
        const body = await request.json();
        const { department, role, designation, password, mobile, departmentId: bodyDepartmentId, branchId: bodyBranchId, collarType } = body;

        // Fetch current employee data + their current branch (for history snapshot)
        const employee = await prisma.user.findUnique({
            where: { id },
            include: {
                department: { select: { id: true, name: true, branchId: true, branch: { select: { id: true, name: true } } } },
                departmentRoles: { select: { id: true, role: true, departmentId: true } },
                scopedBranch: { select: { id: true, name: true } },
            },
        });

        if (!employee) {
            return NextResponse.json({ success: false, message: "Employee not found" }, { status: 404 });
        }

        const updateData = {};
        const changes = [];

        // Designation
        if (designation !== undefined && designation !== (employee.designation || "")) {
            updateData.designation = designation || null;
            changes.push(`Designation changed from "${employee.designation || "—"}" to "${designation || "—"}"`);
        }

        // Mobile
        if (mobile !== undefined && mobile !== (employee.mobile || "")) {
            updateData.mobile = mobile || null;
            changes.push(`Mobile changed from "${employee.mobile || "—"}" to "${mobile || "—"}"`);
        }

        // Collar type (employee category)
        if (collarType !== undefined) {
            const VALID_COLLAR = ["BLUE_COLLAR", "WHITE_COLLAR"];
            const normalized = collarType === "" || collarType === null ? null : collarType;
            if (normalized !== null && !VALID_COLLAR.includes(normalized)) {
                return NextResponse.json({ success: false, message: `Invalid collarType "${collarType}". Must be BLUE_COLLAR or WHITE_COLLAR.` }, { status: 400 });
            }
            if (normalized !== (employee.collarType || null)) {
                updateData.collarType = normalized;
                const fmt = (c) => c === "WHITE_COLLAR" ? "White-collar" : c === "BLUE_COLLAR" ? "Blue-collar" : "—";
                changes.push(`Category changed from "${fmt(employee.collarType)}" to "${fmt(normalized)}"`);
            }
        }

        // Role
        const validRoles = ["EMPLOYEE", "BRANCH_MANAGER", "CLUSTER_MANAGER", "HOD", "HR", "COMMITTEE", "ADMIN"];
        if (role !== undefined && role !== employee.role && validRoles.includes(role)) {
            updateData.role = role;
            changes.push(`Role changed from "${employee.role}" to "${role}"`);
        }

        // Password
        if (password && password.trim().length >= 6) {
            updateData.password = await bcrypt.hash(password.trim(), 10);
            changes.push("Password was updated");
        }

        // Department — accept either `department` (name) or `departmentId` (FK)
        let oldDeptId = employee.departmentId;
        let newDeptId = null;
        let resolvedNewDeptName = null;
        if (bodyDepartmentId !== undefined && bodyDepartmentId !== employee.departmentId) {
            const dept = await prisma.department.findUnique({ where: { id: bodyDepartmentId } });
            if (!dept) {
                return NextResponse.json({ success: false, message: "Department not found" }, { status: 400 });
            }
            newDeptId = dept.id;
            resolvedNewDeptName = dept.name;
            updateData.departmentId = newDeptId;
            changes.push(`Department changed from "${employee.department?.name || "—"}" to "${dept.name}"`);
        } else if (department !== undefined && department !== (employee.department?.name || "")) {
            const dept = await prisma.department.findFirst({ where: { name: department } });
            if (!dept) {
                return NextResponse.json({ success: false, message: `Department "${department}" not found` }, { status: 400 });
            }
            newDeptId = dept.id;
            resolvedNewDeptName = dept.name;
            updateData.departmentId = newDeptId;
            changes.push(`Department changed from "${employee.department?.name || "—"}" to "${department}"`);
        }

        // Branch — only honored when an admin explicitly passes branchId AND
        // the new department's branch (if any) doesn't override. For non-dept
        // roles (CM/HR/Committee), branchId is the only branch source.
        if (bodyBranchId !== undefined && bodyBranchId !== employee.branchId) {
            const newBranch = await prisma.branch.findUnique({ where: { id: bodyBranchId }, select: { id: true, name: true } });
            if (!newBranch) {
                return NextResponse.json({ success: false, message: "Branch not found" }, { status: 400 });
            }
            updateData.branchId = newBranch.id;
            changes.push(`Branch changed from "${employee.scopedBranch?.name || employee.department?.branch?.name || "—"}" to "${newBranch.name}"`);
        }

        if (changes.length === 0) {
            return NextResponse.json({ success: false, message: "No changes detected" }, { status: 400 });
        }

        // Branch Manager rules — block before any DB write so the unique-index
        // failure path is only a defensive net for true concurrent races.
        // Determine the branch the user will end up in after this PATCH.
        let resolvedTargetBranchId = employee.department?.branchId || employee.branchId || null;
        if (newDeptId) {
            const newDept = await prisma.department.findUnique({
                where: { id: newDeptId },
                select: { branchId: true },
            });
            resolvedTargetBranchId = newDept?.branchId || resolvedTargetBranchId;
        }

        const willBeBm = (updateData.role === "BRANCH_MANAGER")
            || (updateData.role === undefined && employee.role === "BRANCH_MANAGER");
        const branchChanged = newDeptId && resolvedTargetBranchId !== (employee.department?.branchId || employee.branchId);

        if (willBeBm && resolvedTargetBranchId && (updateData.role === "BRANCH_MANAGER" || branchChanged)) {
            const check = await assertBmAssignable(id, resolvedTargetBranchId);
            if (!check.ok) {
                await prisma.auditLog.create({
                    data: {
                        userId: user.userId,
                        action: "ASSIGNMENT_REJECTED",
                        details: {
                            type: "BRANCH_MANAGER",
                            reason: check.code,
                            message: check.message,
                            via: "employees/[id] PATCH",
                            branchId: resolvedTargetBranchId,
                            targetUserId: id,
                        },
                    },
                }).catch((err) => { console.error("[EDIT EMPLOYEE] Audit log failed:", err); });
                return NextResponse.json({ success: false, message: check.message }, { status: 409 });
            }
        }

        // If the role is being changed AWAY from BRANCH_MANAGER, also clear
        // any BranchManagerAssignment row pointing at this user.
        const wasBm = employee.role === "BRANCH_MANAGER";
        const roleDemoted = updateData.role !== undefined && updateData.role !== "BRANCH_MANAGER" && wasBm;

        await prisma.$transaction(async (tx) => {
            // Update the user
            await tx.user.update({ where: { id }, data: updateData });

            if (roleDemoted) {
                // Demoting an existing BM — clear the assignment + legacy fields.
                const existing = await tx.branchManagerAssignment.findUnique({
                    where: { bmUserId: id },
                });
                if (existing) {
                    await clearBmAssignment(tx, { branchId: existing.branchId });
                }
            }

            // Becoming or staying a BM — sync the assignment table.
            if (willBeBm && resolvedTargetBranchId && (updateData.role === "BRANCH_MANAGER" || branchChanged)) {
                await applyBmAssignment(tx, {
                    userId: id,
                    branchId: resolvedTargetBranchId,
                    assignedBy: user.userId,
                });
            }

            // If department changed, clear old FK shortcuts on the old department
            if (newDeptId && oldDeptId) {
                // Clear supervisorId if this user was the supervisor of the old dept
                await tx.department.updateMany({
                    where: { id: oldDeptId, supervisorId: id },
                    data: { supervisorId: null },
                });
                // Clear branchManagerId if this user was the BM of the old dept
                await tx.department.updateMany({
                    where: { id: oldDeptId, branchManagerId: id },
                    data: { branchManagerId: null },
                });
            }

            // Assignment history — write a row when role/dept/branch changed,
            // capturing both old and new snapshots so history survives later
            // dept/branch rename or deletion.
            const roleChanged       = updateData.role !== undefined && updateData.role !== employee.role;
            const deptChanged       = updateData.departmentId !== undefined && updateData.departmentId !== employee.departmentId;
            const branchChangedHist = updateData.branchId !== undefined && updateData.branchId !== employee.branchId;

            if (roleChanged || deptChanged || branchChangedHist) {
                let newDeptName = resolvedNewDeptName;
                if (deptChanged && !newDeptName) {
                    const d = await tx.department.findUnique({ where: { id: updateData.departmentId }, select: { name: true } });
                    newDeptName = d?.name || null;
                }

                const oldBranchId   = employee.scopedBranch?.id || employee.department?.branch?.id || employee.branchId || null;
                const oldBranchName = employee.scopedBranch?.name || employee.department?.branch?.name || null;

                let newBranchId   = updateData.branchId !== undefined ? updateData.branchId : oldBranchId;
                let newBranchName = null;
                if (branchChangedHist) {
                    const nb = await tx.branch.findUnique({ where: { id: updateData.branchId }, select: { name: true } });
                    newBranchName = nb?.name || null;
                } else if (deptChanged) {
                    // Department change pulls branch with it
                    const newDept = await tx.department.findUnique({
                        where: { id: updateData.departmentId },
                        select: { branchId: true, branch: { select: { name: true } } },
                    });
                    newBranchId = newDept?.branchId || newBranchId;
                    newBranchName = newDept?.branch?.name || oldBranchName;
                } else {
                    newBranchName = oldBranchName;
                }

                await tx.employeeAssignmentHistory.create({
                    data: {
                        userId: id,
                        empCode: employee.empCode,
                        employeeName: employee.name,
                        changedById: user.userId,
                        changedByEmpCode: user.empCode || null,
                        oldRole: roleChanged ? employee.role : null,
                        newRole: roleChanged ? updateData.role : null,
                        oldDepartmentId: deptChanged ? employee.departmentId : null,
                        newDepartmentId: deptChanged ? updateData.departmentId : null,
                        oldDepartmentName: deptChanged ? (employee.department?.name || null) : null,
                        newDepartmentName: deptChanged ? newDeptName : null,
                        oldBranchId: (deptChanged || branchChangedHist) ? oldBranchId : null,
                        newBranchId: (deptChanged || branchChangedHist) ? newBranchId : null,
                        oldBranchName: (deptChanged || branchChangedHist) ? oldBranchName : null,
                        newBranchName: (deptChanged || branchChangedHist) ? newBranchName : null,
                    },
                });
            }

            // Send notification to the employee
            await tx.notification.create({
                data: {
                    userId: id,
                    message: `Your profile details have been updated by Admin: ${changes.join("; ")}`,
                    isRead: false,
                },
            });

            // Audit log
            await tx.auditLog.create({
                data: {
                    userId: user.userId,
                    action: "EMPLOYEE_UPDATED",
                    details: {
                        employeeId: id,
                        employeeName: employee.name,
                        empCode: employee.empCode,
                        changes,
                        updatedBy: user.empCode,
                    },
                },
            });
        });

        return NextResponse.json({
            success: true,
            data: { message: "Employee updated successfully", changes },
        });
    } catch (err) {
        // Concurrency safeguard: if a parallel admin assigned a conflicting
        // BM in the gap between assertBmAssignable and the transaction, the
        // unique index on bm_branch_assignments raises P2002 — translate to
        // the spec error message.
        if (err && err.code === "P2002") {
            const target = err.meta?.target;
            if (Array.isArray(target) && target.includes("bm_user_id")) {
                return NextResponse.json(
                    { success: false, message: "This user is already assigned as Branch Manager in another branch." },
                    { status: 409 }
                );
            }
            return NextResponse.json(
                { success: false, message: "This branch already has a Branch Manager assigned." },
                { status: 409 }
            );
        }
        console.error("[EDIT EMPLOYEE] Error:", err);
        return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
    }
});
