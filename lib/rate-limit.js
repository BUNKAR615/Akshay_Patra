import { RateLimiterMemory } from "rate-limiter-flexible";
import { fail } from "./api-response";

/**
 * In-memory rate limiter for login attempts.
 * Max 5 attempts per IP per 15-minute window.
 */
const loginLimiter = new RateLimiterMemory({
    points: 5,         // 5 attempts
    duration: 15 * 60, // per 15 minutes
    blockDuration: 15 * 60, // block for 15 min after exceeding
});

/**
 * Extract client IP from request headers.
 */
export function getClientIp(request) {
    return (
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        "unknown"
    );
}

/**
 * Check rate limit for an IP. Returns null if allowed, or a Response if blocked.
 */
export async function checkLoginRateLimit(request) {
    const ip = getClientIp(request);

    try {
        await loginLimiter.consume(ip);
        return null; // Allowed
    } catch (rateLimiterRes) {
        const retryAfter = Math.ceil(rateLimiterRes.msBeforeNext / 1000);
        return fail(
            `Too many login attempts. Please try again in ${Math.ceil(retryAfter / 60)} minute(s).`,
            429
        );
    }
}
