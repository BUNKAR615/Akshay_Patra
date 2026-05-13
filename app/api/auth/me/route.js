export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { ok, unauthorized, notFound, serverError } from "../../../../lib/api-response";

/** GET /api/auth/me */
export async function GET(request) {
    try {
        const userId = request.headers.get("x-user-id");
        if (!userId) return unauthorized();

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true, empCode: true, name: true, role: true, departmentId: true, designation: true, mobile: true,
                department: { select: { id: true, name: true, branch: { select: { name: true } } } },
                departmentRoles: {
                    select: { departmentId: true, role: true, department: { select: { id: true, name: true } } },
                },
            },
        });
        if (!user) return notFound("User not found");

        const activeQuarter = await prisma.quarter.findFirst({
            where: { status: "ACTIVE" },
            select: { id: true, name: true },
        });

        // HOD entries in `departmentRoles` are only meaningful while there's
        // a corresponding HodAssignment in the ACTIVE quarter. Stale rows
        // from closed quarters (e.g. Rishpal's Q02-2026 row that persisted
        // after the quarter closed) would otherwise surface as an extra
        // "HOD" pill on the profile and on lists that read departmentRoles.
        // We drop those stale HOD rows here so the profile reflects the
        // user's TRUE active-quarter roles only.
        let activeHodDeptIds = new Set();
        if (activeQuarter && (user.departmentRoles || []).some((dr) => dr.role === "HOD")) {
            const rows = await prisma.hodAssignment.findMany({
                where: { hodUserId: user.id, quarterId: activeQuarter.id },
                select: { departmentId: true },
            });
            activeHodDeptIds = new Set(rows.map((r) => r.departmentId));
        }
        const filteredDepartmentRoles = (user.departmentRoles || []).filter((dr) => {
            if (dr.role !== "HOD") return true;
            return activeHodDeptIds.has(dr.departmentId);
        });

        // Return the *session* role from the JWT (set in headers by middleware),
        // not the DB role. For Admin+HOD dual users who picked HOD at login,
        // user.role in DB is "ADMIN" but the chosen session role is "HOD".
        // Dashboard isolation depends on dashboards seeing the picked role.
        const sessionRole = request.headers.get("x-user-role") || user.role;

        return ok({
            user: { ...user, role: sessionRole, departmentRoles: filteredDepartmentRoles },
            currentQuarter: activeQuarter?.name || null,
        });
    } catch (err) {
        console.error("Me error:", err);
        return serverError();
    }
}
