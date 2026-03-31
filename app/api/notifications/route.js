export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../lib/prisma";
import { ok, serverError } from "../../../lib/api-response";

/**
 * GET /api/notifications
 * Returns all notifications for the authenticated user, newest first.
 */
export async function GET(request) {
    try {
        const userId = request.headers.get("x-user-id");
        if (!userId) return ok({ notifications: [], unreadCount: 0 });

        const notifications = await prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        const unreadCount = notifications.filter((n) => !n.isRead).length;

        return ok({ notifications, unreadCount });
    } catch (err) {
        console.error("Get notifications error:", err);
        return serverError();
    }
}
