/**
 * HTTP / DB utilities for API routes.
 */

/**
 * Extract the client IP from incoming request headers.
 * Honours x-forwarded-for (first hop) and x-real-ip, falls back to "unknown".
 */
export function getClientIp(request) {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown"
    );
}

/**
 * Detects transient DB / network connection errors.
 *
 * These are errors that typically resolve on retry — Neon Postgres
 * auto-suspend wake-up, serverless cold start racing Prisma connection init,
 * or transient network blips. They must surface to clients as a 503
 * ("service starting up, retry") rather than a dead 500 "Internal Server
 * Error", which is what made the Admin dashboard look broken until a retry.
 *
 * Permission / validation / logical errors are NOT transient.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTransientDbError(err) {
    const code = err?.code || "";
    const name = err?.name || "";
    const msg = String(err?.message || "");
    return (
        code === "P1001" ||        // Can't reach database server
        code === "P1002" ||        // Database server timed out
        code === "P1008" ||        // Operations timed out
        code === "P1017" ||        // Server closed the connection
        code === "P2024" ||        // Timed out fetching a new connection from pool
        // Neon auto-suspend cold start: Prisma fails to open a connection. This
        // arrives as a PrismaClientInitializationError whose message is "Can't
        // reach database server …" and OFTEN carries NO P-code, so the code
        // checks above miss it and it would otherwise surface as a raw 500.
        name === "PrismaClientInitializationError" ||
        /Can't reach database server|Can't reach database|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|Connection terminated|Connection closed|Closed the connection/i.test(msg)
    );
}

/**
 * Retry a DB / network operation on transient connection errors.
 *
 * Handles the classic "first request after idle period fails, second succeeds"
 * pattern caused by:
 *   - Neon Postgres auto-suspend wake-up (pooler cold start)
 *   - Vercel serverless lambda cold start racing with Prisma connection init
 *   - Transient network blips between Vercel edge and Neon
 *
 * Only retries on connection-level errors; permission / validation / logical
 * errors are thrown immediately so they're never masked.
 *
 * @param {() => Promise<T>} fn          - the DB call to execute
 * @param {object}          [opts]
 * @param {number}          [opts.retries=3]   - total attempts (including the first)
 * @param {number}          [opts.delayMs=250] - delay between attempts (linear backoff)
 * @returns {Promise<T>}
 */
export async function withDbRetry(fn, { retries = 3, delayMs = 250 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastErr = err;
            if (!isTransientDbError(err) || attempt === retries - 1) throw err;
            const code = err?.code || "";
            const msg = String(err?.message || "");
            console.warn(`[withDbRetry] transient DB error on attempt ${attempt + 1}/${retries}: ${code || msg.slice(0, 120)} — retrying in ${delayMs * (attempt + 1)}ms`);
            await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        }
    }
    throw lastErr;
}
