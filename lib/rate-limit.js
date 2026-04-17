/**
 * In-process rate limiter.
 *
 * Keyed counter with a rolling window and a lockout period. State lives in a
 * module-level Map, so it is per-process only — acceptable for login throttling
 * on a single-instance deploy. If the app is ever scaled horizontally, swap
 * this for a Redis-backed implementation behind the same interface.
 *
 * Design notes:
 *   - We keep "first attempt timestamp" per key so the window is true-rolling,
 *     not fixed. After `windowMs` with no new attempt, the counter resets.
 *   - A locked key stays locked until `lockedUntil`, regardless of new attempts.
 *   - A periodic sweeper drops stale entries so the Map does not grow forever.
 *     The sweeper is globalThis-guarded so Next's dev HMR does not start many.
 */

const DEFAULTS = {
    maxAttempts: 8,
    windowMs: 15 * 60 * 1000,   // 15 min
    lockoutMs: 15 * 60 * 1000,  // 15 min
};

/** @type {Map<string, { count: number, firstAt: number, lockedUntil: number }>} */
const store = new Map();

/**
 * Record an attempt against `key` and decide whether it is allowed.
 * Call this BEFORE doing the protected work (e.g. bcrypt compare).
 * On success, call `clear(key)` to reset the counter.
 *
 * @returns {{ allowed: boolean, retryAfterMs: number }}
 */
export function checkAndRecord(key, opts = {}) {
    const { maxAttempts, windowMs, lockoutMs } = { ...DEFAULTS, ...opts };
    const now = Date.now();
    const entry = store.get(key);

    // Still within an active lockout
    if (entry && entry.lockedUntil > now) {
        return { allowed: false, retryAfterMs: entry.lockedUntil - now };
    }

    // No entry, or the window has expired — start fresh
    if (!entry || now - entry.firstAt > windowMs) {
        store.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
        return { allowed: true, retryAfterMs: 0 };
    }

    // Within window — increment
    entry.count += 1;
    if (entry.count > maxAttempts) {
        entry.lockedUntil = now + lockoutMs;
        return { allowed: false, retryAfterMs: lockoutMs };
    }
    return { allowed: true, retryAfterMs: 0 };
}

/** Reset a key after a successful operation. */
export function clear(key) {
    store.delete(key);
}

/** Testing / observability only. */
export function _peek(key) {
    return store.get(key) || null;
}

// Sweep stale entries roughly every 5 minutes.
// Guarded so Next's dev HMR does not stack timers across hot reloads.
if (typeof globalThis !== "undefined" && !globalThis.__apRateLimitSweeperStarted) {
    globalThis.__apRateLimitSweeperStarted = true;
    const SWEEP_MS = 5 * 60 * 1000;
    const STALE_MS = 30 * 60 * 1000;
    setInterval(() => {
        const cutoff = Date.now() - STALE_MS;
        for (const [key, entry] of store) {
            if (entry.lockedUntil < Date.now() && entry.firstAt < cutoff) {
                store.delete(key);
            }
        }
    }, SWEEP_MS).unref?.();
}
