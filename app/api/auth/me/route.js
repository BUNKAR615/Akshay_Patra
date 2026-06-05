export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { ok, unauthorized, notFound, fail, serverError } from "../../../../lib/api-response";
import { withDbRetry, isTransientDbError } from "../../../../lib/http";

/** GET /api/auth/me */
export async function GET(request) {
    try {
        const userId = request.headers.get("x-user-id");
        if (!userId) return unauthorized();

        // User profile and the active-quarter lookup are independent, so run
        // them concurrently — this endpoint gates every dashboard's first
        // render, so shaving a DB round-trip here speeds up every role's load.
        const [user, activeQuarter] = await Promise.all([
            withDbRetry(() => prisma.user.findUnique({
                where: { id: userId },
                select: {
                    id: true, empCode: true, name: true, role: true, departmentId: true, designation: true, mobile: true,
                    branchId: true,
                    department: { select: { id: true, name: true, branch: { select: { name: true } } } },
                    // Branch-level scope for ADMIN / BM / CM / HR / COMMITTEE users
                    // who have no departmentId — the profile card resolves Branch
                    // from here when the department-derived branch is absent.
                    scopedBranch: { select: { name: true } },
                    departmentRoles: {
                        select: { departmentId: true, role: true, department: { select: { id: true, name: true } } },
                    },
                },
            })),
            withDbRetry(() => prisma.quarter.findFirst({
                where: { status: "ACTIVE" },
                select: { id: true, name: true },
            })),
        ]);
        if (!user) return notFound("User not found");

        // HOD entries in `departmentRoles` are only meaningful while there's
        // a corresponding HodAssignment in the ACTIVE quarter. Stale rows
        // from closed quarters (e.g. Rishpal's Q02-2026 row that persisted
        // after the quarter closed) would otherwise surface as an extra
        // "HOD" pill on the profile and on lists that read departmentRoles.
        // We drop those stale HOD rows here so the profile reflects the
        // user's TRUE active-quarter roles only.
        let activeHodDeptIds = new Set();
        if (activeQuarter && (user.departmentRoles || []).some((dr) => dr.role === "HOD")) {
            const rows = await withDbRetry(() => prisma.hodAssignment.findMany({
                where: { hodUserId: user.id, quarterId: activeQuarter.id },
                select: { departmentId: true },
            }));
            activeHodDeptIds = new Set(rows.map((r) => r.departmentId));
        }
        const filteredDepartmentRoles = (user.departmentRoles || []).filter((dr) => {
            // SUPERVISOR is a legacy value in the Role enum (kept only for
            // historic schema-compat with SupervisorEvaluation). It is not a
            // runtime role anywhere in the app — no login flow, dashboard,
            // or evaluator path consumes it. Stale rows that survive from
            // old seed data (e.g. Rishpal Kumawat / IT) would otherwise
            // surface as a bogus "SUPERVISOR" pill on the profile. Drop
            // them here at the API boundary so no UI surface has to know.
            if (dr.role === "SUPERVISOR") return false;
            if (dr.role !== "HOD") return true;
            return activeHodDeptIds.has(dr.departmentId);
        });

        // Return the *session* role from the JWT (set in headers by middleware),
        // not the DB role. For Admin+HOD dual users who picked HOD at login,
        // user.role in DB is "ADMIN" but the chosen session role is "HOD".
        // Dashboard isolation depends on dashboards seeing the picked role.
        const sessionRole = request.headers.get("x-user-role") || user.role;

        // Branch name for the profile card. Department-derived branch (for
        // EMPLOYEE/HOD) wins; otherwise fall back to the branch-level scope
        // (ADMIN/BM/CM/HR/COMMITTEE). UserProfileCard reads `branchName` first.
        const branchName = user.department?.branch?.name || user.scopedBranch?.name || null;

        return ok({
            user: { ...user, role: sessionRole, departmentRoles: filteredDepartmentRoles, branchName },
            currentQuarter: activeQuarter?.name || null,
        });
    } catch (err) {
        console.error("Me error:", err);
        // Transient DB connection errors (cold start / pool wake-up) must
        // surface as 503 so the client can retry gracefully instead of
        // showing a dead "Internal Server Error".
        if (isTransientDbError(err)) {
            return fail("Service is starting up. Please try again in a moment.", 503);
        }
        return serverError();
    }
}
