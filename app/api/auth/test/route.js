export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import prisma from "../../../../lib/prisma";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/test
 * Health check — verifies database connection and API routing.
 */
export async function GET() {
    let database = "failed";
    let usersCount = 0;

    try {
        usersCount = await prisma.user.count();
        database = "connected";
    } catch (err) {
        console.error("[TEST] DB error:", err.message);
    }

    return NextResponse.json({
        database,
        usersCount,
        jwtSecretSet: !!process.env.JWT_SECRET,
        message: "API is working",
    });
}
