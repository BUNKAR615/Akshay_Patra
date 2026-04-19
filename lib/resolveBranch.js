import prisma from "./prisma";

/**
 * Resolve a branch by slug OR by CUID id.
 * Accepts whatever is in the URL segment (slug for new URLs, cuid for legacy links).
 * Returns the full branch record or null.
 *
 * @param {string} slugOrId - value from params.branchId (slug or cuid)
 * @returns {Promise<import("@prisma/client").Branch | null>}
 */
export async function resolveBranch(slugOrId) {
    return prisma.branch.findFirst({
        where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    });
}
