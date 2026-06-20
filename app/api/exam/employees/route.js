export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma from "../../../../lib/prisma";
import { withRole } from "../../../../lib/withRole";
import { ok, serverError } from "../../../../lib/api-response";
import { roleBucket, initialsOf, avatarColors } from "../../../../lib/examEmployeeRole";

/**
 * GET /api/exam/employees
 * Lightweight live employee directory for the exam-builder audience picker.
 * Returns every active employee with a resolved branch / department / role
 * facet. The picker filters, facets, and selects entirely client-side (matching
 * the prototype UX), so this endpoint just hands back the flat list once.
 */
export const GET = withRole(["ADMIN"], async () => {
    try {
        const rows = await prisma.user.findMany({
            where: { role: "EMPLOYEE", departmentId: { not: null } },
            select: {
                id: true,
                empCode: true,
                name: true,
                designation: true,
                department: {
                    select: {
                        name: true,
                        branch: { select: { name: true, location: true } },
                    },
                },
            },
            orderBy: [{ name: "asc" }],
        });

        const employees = rows.map((u) => {
            const br = u.department?.branch;
            const branch = br ? (br.location ? `${br.name} — ${br.location}` : br.name) : "Unassigned";
            const [avBg, avTx] = avatarColors(u.empCode || u.id);
            return {
                id: u.id,
                code: u.empCode || u.id,
                name: u.name,
                branch,
                dept: u.department?.name || "—",
                role: roleBucket(u.designation),
                desig: u.designation || "—",
                initials: initialsOf(u.name),
                avBg,
                avTx,
            };
        });

        return ok({ employees, total: employees.length });
    } catch (err) {
        console.error("[GET /api/exam/employees] error:", err);
        return serverError();
    }
});
