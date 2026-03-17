import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

/** @type {PrismaClient} */
const prisma =
    globalForPrisma.prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

/**
 * Test the database connection and return a status object.
 * Used by health-check and error pages.
 *
 * @returns {Promise<{ connected: boolean, error?: string }>}
 */
export async function checkDatabaseConnection() {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return { connected: true };
    } catch (err) {
        console.error("[PRISMA] Database connection failed:", err.message);
        return { connected: false, error: err.message };
    }
}

export default prisma;
