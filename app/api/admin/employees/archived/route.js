export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { NextResponse } from "next/server";

/**
 * GET /api/admin/employees/archived
 * Returns list of archived (removed) employees with their details.
 */
export const GET = withRole(["ADMIN", "HR_ADMIN"], async () => {
    try {
        const archived = await prisma.archivedEmployee.findMany({
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
