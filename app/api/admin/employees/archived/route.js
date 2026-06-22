export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withPermission } from "../../../../../lib/withPermission";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/employees/archived
 * Returns list of archived (removed) employees with their details.
 *
 * Optional ?branchId — restricts to employees archived from the given branch.
 *   Resolution: ArchivedEmployee doesn't carry branchId, so we resolve via
 *   department names that belong to the branch. Best-effort, since the
 *   archived row's `department` is a free-form snapshot string.
 *
 * Open to any ADMIN; no longer gated by HR_ALLOWED.
 */
export const GET = withPermission("employees.view", async (request) => {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get("branchId");

        let where = {};
        if (branchId) {
            const branchDepts = await prisma.department.findMany({
                where: { branchId },
                select: { name: true },
            });
            const deptNames = branchDepts.map((d) => d.name);
            // Restrict to archived rows whose snapshotted department name
            // matches any of this branch's departments.
            where = { department: { in: deptNames } };
        }

        const archived = await prisma.archivedEmployee.findMany({
            where,
            orderBy: { removalDate: "desc" },
        });

        return NextResponse.json({
            success: true,
            data: { archived },
        });
    } catch (err) {
        console.error("[ARCHIVED EMPLOYEES] Error:", err);
        return NextResponse.json(
            { success: false, message: "Server error" },
            { status: 500 }
        );
    }
});
