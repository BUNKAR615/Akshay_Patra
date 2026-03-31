export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { ok, unauthorized, serverError } from "../../../../lib/api-response";

/**
 * PATCH /api/notifications/read-all
 * Marks ALL of the user's notifications as read.
 */
export async function PATCH(request) {
    try {
        const userId = request.headers.get("x-user-id");
        if (!userId) return unauthorized("Authentication required");

        const result = await prisma.notification.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });

        return ok({ message: "All notifications marked as read", count: result.count });
    } catch (err) {
        console.error("Read-all error:", err);
        return serverError();
    }
}
