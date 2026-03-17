import prisma from "../../../../lib/prisma";
import { ok, serverError } from "../../../../lib/api-response";
import { withRole } from "../../../../lib/withRole";

/** GET /api/admin/employees — returns all employees for the directory */
async function handler(request) {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true,
                empCode: true,
                name: true,
                email: true,
                role: true,
                designation: true,
                department: { select: { name: true } },
            },
            orderBy: { name: "asc" },
        });

        return ok({
            employees: users.map(u => ({
                id: u.id,
                empCode: u.empCode,
                name: u.name,
                email: u.email,
                role: u.role,
                designation: u.designation || "—",
                department: u.department?.name || "—",
            })),
            total: users.length,
        });
    } catch (err) {
        console.error("[ADMIN EMPLOYEES] Error:", err);
        return serverError();
    }
}

export const GET = withRole(handler, "ADMIN");
