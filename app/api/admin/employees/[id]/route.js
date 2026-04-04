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
 * Only Rishpal Kumar and Chetan Singh Bhati can do this.
 */
export const DELETE = withRole(["ADMIN", "HR_ADMIN"], async (request, { params, user }) => {
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

        // Find the employee
        const employee = await prisma.user.findUnique({
            where: { id },
            include: { department: { select: { name: true } } },
        });

        if (!employee) {
            return NextResponse.json(
                { success: false, message: "Employee not found" },
                { status: 404 }
            );
        }

        // Don't allow removing admins
        if (employee.role === "ADMIN" || employee.role === "HR_ADMIN") {
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

        // Remove department role mappings
        await prisma.departmentRoleMapping.deleteMany({ where: { userId: id } });

        // Delete the user (cascades to evaluations, assessments, etc.)
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
