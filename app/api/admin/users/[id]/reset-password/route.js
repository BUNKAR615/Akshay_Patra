export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import bcrypt from "bcryptjs";

import prisma from "../../../../../../lib/prisma";
import { withRole } from "../../../../../../lib/withRole";
import { ok, fail, notFound, serverError, validateBody } from "../../../../../../lib/api-response";
import { getClientIp } from "../../../../../../lib/http";
import { createNotification } from "../../../../../../lib/notifications";
import { resetPasswordSchema } from "../../../../../../lib/validators";

/**
 * POST /api/admin/users/[id]/reset-password
 *
 * Admin-initiated password reset. Writes a fresh bcrypt hash to User.password
 * and notifies the user in-app. Does not invalidate already-issued JWTs —
 * they remain valid until their natural expiry. A stricter token-revocation
 * flow is out of scope (would need a user→token index we don't keep).
 */
const SALT_ROUNDS = 10;

export const POST = withRole(["ADMIN"], async (request, { params, user }) => {
    try {
        const { data, error } = await validateBody(request, resetPasswordSchema);
        if (error) return error;

        const targetUserId = params?.id;
        if (!targetUserId) return fail("Missing user id", 400);

        const target = await prisma.user.findUnique({
            where: { id: targetUserId },
            select: { id: true, empCode: true, name: true },
        });
        if (!target) return notFound("User not found");

        const hash = await bcrypt.hash(data.newPassword, SALT_ROUNDS);
        await prisma.user.update({
            where: { id: target.id },
            data: { password: hash },
        });

        await createNotification(target.id, "Your password was reset by an administrator. Please log in with the new password.");

        await prisma.auditLog.create({
            data: {
                userId: user.userId,
                action: "ADMIN_PASSWORD_RESET",
                ipAddress: getClientIp(request),
                details: { targetUserId: target.id, targetEmpCode: target.empCode },
            },
        }).catch(() => {});

        return ok({ userId: target.id });
    } catch (err) {
        console.error("[ADMIN_PASSWORD_RESET] Error:", err?.code, err?.message);
        return serverError();
    }
});
