export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../../lib/prisma";
import { withRole } from "../../../../../lib/withRole";
import { ok, fail, serverError } from "../../../../../lib/api-response";

/**
 * GET /api/branch-manager/hod/search?q=...
 * Search candidate HODs by empCode, name, or department name within the BM's branch.
 * Returns users who belong to the same branch and can be nominated as HOD.
 */
export const GET = withRole(["BRANCH_MANAGER", "ADMIN"], async (request, { user }) => {
    try {
        const { searchParams } = new URL(request.url);
        const q = (searchParams.get("q") || "").trim();

        // Resolve BM's branchId
        const bmUser = await prisma.user.findUnique({
            where: { id: user.userId },
            select: { department: { select: { branchId: true } } }
        });
        const branchId = bmUser?.department?.branchId;
        if (!branchId) return fail("Could not determine your branch");

        const where = {
            department: { branchId },
        };

        if (q) {
            where.OR = [
                { empCode: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                { department: { name: { contains: q, mode: "insensitive" } } },
            ];
        }

        const candidates = await prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                empCode: true,
                designation: true,
                department: { select: { id: true, name: true, collarType: true } },
            },
            orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
            take: 50,
        });

        return ok({
            candidates: candidates.map(c => ({
                id: c.id,
                name: c.name,
                empCode: c.empCode,
                designation: c.designation || "",
                departmentId: c.department?.id,
                departmentName: c.department?.name,
                departmentCollar: c.department?.collarType,
            })),
            total: candidates.length,
        });
    } catch (err) {
        console.error("[HOD-SEARCH] Error:", err.message);
        return serverError();
    }
});
