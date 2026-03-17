import prisma from "./prisma";

/**
 * Helper to create notifications for one or many users.
 *
 * @param {string|string[]} userIds — single or array of user IDs
 * @param {string} message — notification text
 */
export async function createNotification(userIds, message) {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    if (ids.length === 0) return;

    try {
        await prisma.notification.createMany({
            data: ids.map((userId) => ({ userId, message })),
        });
    } catch (err) {
        console.error("Failed to create notifications:", err);
        // Non-critical — don't throw to avoid breaking the primary flow
    }
}

/**
 * Notify ALL employees in the system.
 */
export async function notifyAllEmployees(message) {
    const employees = await prisma.user.findMany({
        where: { role: "EMPLOYEE" },
        select: { id: true },
    });
    await createNotification(
        employees.map((e) => e.id),
        message
    );
}
