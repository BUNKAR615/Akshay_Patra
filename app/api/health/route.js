import prisma from "../../../lib/prisma";

/**
 * GET /api/health
 * Returns service status, database connectivity, and key counts.
 */
export async function GET() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        const quarterCount = await prisma.quarter.count();
        const userCount = await prisma.user.count();
        const questionCount = await prisma.question.count();

        return Response.json({
            status: "ok",
            database: "connected",
            timestamp: new Date().toISOString(),
            counts: {
                quarters: quarterCount,
                users: userCount,
                questions: questionCount,
            },
        });
    } catch (error) {
        console.error("Health check error:", error);
        return Response.json(
            {
                status: "error",
                database: "disconnected",
                error: String(error),
            },
            { status: 500 }
        );
    }
}
