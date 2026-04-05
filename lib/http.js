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
            const code = err?.code || "";
            const msg = String(err?.message || "");
            const isTransient =
                code === "P1001" ||        // Can't reach database server
                code === "P1002" ||        // Database server timed out
                code === "P1008" ||        // Operations timed out
                code === "P1017" ||        // Server closed the connection
                code === "P2024" ||        // Timed out fetching a new connection from pool
                /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|Connection terminated|Connection closed|Closed the connection/i.test(msg);
            if (!isTransient || attempt === retries - 1) throw err;
            console.warn(`[withDbRetry] transient DB error on attempt ${attempt + 1}/${retries}: ${code || msg.slice(0, 120)} — retrying in ${delayMs * (attempt + 1)}ms`);
            await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        }
    }
    throw lastErr;
}
