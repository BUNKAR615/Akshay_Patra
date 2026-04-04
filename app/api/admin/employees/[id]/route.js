export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import bcrypt from "bcryptjs";
import { withRole } from "../../../../../lib/withRole";
import { NextResponse } from "next/server";

// Only these two empCodes can add/remove employees
const HR_ALLOWED = ["1800349", "5100029"];

/**
 * DELETE /api/admin/employees/[id]
 * Archive an employee — soft-delete with reason tracking.
 * Cleans up ALL references: evaluations, shortlists, notifications, role mappings, etc.
 * Only Rishpal Kumar and Chetan Singh Bhati can do this.
 */
export const DELETE = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        if (!HR_ALLOWED.includes(user.empCode)) {
            return NextResponse.json(
                { success: false, message: "You are not authorized to remove employees" },
                { status: 403 }
            );
        }

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

        // Clean up department FK shortcuts if this user was a supervisor/BM
        const deptUpdates = [];
        for (const dr of employee.departmentRoles) {
            if (dr.role === "SUPERVISOR") {
                deptUpdates.push(
                    prisma.department.updateMany({
                        where: { id: dr.departmentId, supervisorId: id },
                        data: { supervisorId: null },
                    })
                );
            }
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
}, { allowedEmpCodes: HR_ALLOWED });

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
        const { department, role, designation, password } = body;

        // Fetch current employee data
        const employee = await prisma.user.findUnique({
            where: { id },
            include: {
                department: { select: { id: true, name: true } },
                departmentRoles: { select: { id: true, role: true, departmentId: true } },
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

        // Role
        const validRoles = ["EMPLOYEE", "SUPERVISOR", "BRANCH_MANAGER", "CLUSTER_MANAGER", "ADMIN"];
        if (role !== undefined && role !== employee.role && validRoles.includes(role)) {
            updateData.role = role;
            changes.push(`Role changed from "${employee.role}" to "${role}"`);
        }

        // Password
        if (password && password.trim().length >= 6) {
            updateData.password = await bcrypt.hash(password.trim(), 10);
            changes.push("Password was updated");
        }

        // Department
        let oldDeptId = employee.departmentId;
        let newDeptId = null;
        if (department !== undefined && department !== (employee.department?.name || "")) {
            const dept = await prisma.department.findFirst({ where: { name: department } });
            if (!dept) {
                return NextResponse.json({ success: false, message: `Department "${department}" not found` }, { status: 400 });
            }
            newDeptId = dept.id;
            updateData.departmentId = newDeptId;
            changes.push(`Department changed from "${employee.department?.name || "—"}" to "${department}"`);
        }

        if (changes.length === 0) {
            return NextResponse.json({ success: false, message: "No changes detected" }, { status: 400 });
        }

        await prisma.$transaction(async (tx) => {
            // Update the user
            await tx.user.update({ where: { id }, data: updateData });

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
        console.error("[EDIT EMPLOYEE] Error:", err);
        return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
    }
});
