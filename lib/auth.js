import jwt from "jsonwebtoken";

/**
 * Read JWT_SECRET lazily from process.env (NOT at module top-level).
 * Next.js may not have env vars ready when the module is first imported.
 */
function getSecret() {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not defined in environment variables");
    return secret;
}

function getRefreshSecret() {
    return getSecret() + "_refresh";
}

const getExpiresIn = () => process.env.JWT_EXPIRES_IN || "8h";

/**
 * Signs an access token (short-lived, 1h default).
 */
export function signToken(payload) {
    return jwt.sign(payload, getSecret(), { expiresIn: getExpiresIn() });
}

/**
 * Signs a refresh token (long-lived, 7 days).
 */
export function signRefreshToken(payload) {
    return jwt.sign(payload, getRefreshSecret(), { expiresIn: "7d" });
}

/**
 * Verifies an access token.
 */
export function verifyToken(token) {
    return jwt.verify(token, getSecret());
}

/**
 * Verifies a refresh token.
 */
export function verifyRefreshToken(token) {
    return jwt.verify(token, getRefreshSecret());
}

/**
 * Extracts the Bearer token from an Authorization header value.
 */
export function extractBearerToken(authHeader) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    return authHeader.slice(7);
}

/**
 * Get token expiry as a Date object.
 */
export function getTokenExpiry(token) {
    try {
        const decoded = jwt.decode(token);
        if (decoded?.exp) return new Date(decoded.exp * 1000);
    } catch { }
    return new Date(Date.now() + 8 * 60 * 60 * 1000); // fallback 8h
}
