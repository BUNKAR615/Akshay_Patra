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
                id: true, empCode: true, name: true, email: true, role: true, departmentId: true, designation: true, mobile: true,
                department: { select: { id: true, name: true, branch: { select: { name: true } } } },
                departmentRoles: {
                    select: { departmentId: true, role: true, department: { select: { id: true, name: true } } },
                },
            },
        });
        if (!user) return notFound("User not found");

        const activeQuarter = await prisma.quarter.findFirst({
            where: { status: "ACTIVE" },
            select: { name: true }
        });

        return ok({ user, currentQuarter: activeQuarter?.name || null });
    } catch (err) {
        console.error("Me error:", err);
        return serverError();
    }
}
