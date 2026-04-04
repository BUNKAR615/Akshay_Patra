export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
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
                email: employee.email,
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
