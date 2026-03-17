import prisma from "../../../../../lib/prisma";
import { ok, notFound, forbidden, serverError } from "../../../../../lib/api-response";

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read.
 */
export async function PATCH(request, { params }) {
    try {
        const userId = request.headers.get("x-user-id");
        if (!userId) return forbidden("Authentication required");

        const { id } = await params;

        const notification = await prisma.notification.findUnique({ where: { id } });
        if (!notification) return notFound("Notification not found");
        if (notification.userId !== userId) return forbidden("Not your notification");

        const updated = await prisma.notification.update({
            where: { id },
            data: { isRead: true },
        });

        return ok({ notification: updated });
    } catch (err) {
        console.error("Mark read error:", err);
        return serverError();
    }
}
