const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

function toDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function splitDuration(ms) {
    const safeMs = Math.max(0, Math.floor(ms));
    const days = Math.floor(safeMs / DAY_MS);
    const hours = Math.floor((safeMs % DAY_MS) / HOUR_MS);
    const minutes = Math.floor((safeMs % HOUR_MS) / MINUTE_MS);
    const seconds = Math.floor((safeMs % MINUTE_MS) / SECOND_MS);
    return { days, hours, minutes, seconds };
}

export function getQuarterCountdownState(quarter, nowInput = Date.now()) {
    const endDate = toDate(quarter?.endDate);
    if (!quarter || !endDate || quarter.status !== "ACTIVE") {
        return { visible: false, reason: "inactive" };
    }

    const startDate = toDate(quarter.startDate);
    const nowDate = nowInput instanceof Date || typeof nowInput === "string" ? toDate(nowInput) : null;
    const nowMs = nowDate ? nowDate.getTime() : Number(nowInput);
    if (!Number.isFinite(nowMs)) {
        return { visible: false, reason: "invalid-now" };
    }

    const remainingMs = endDate.getTime() - nowMs;
    if (remainingMs <= 0) {
        return {
            visible: true,
            expired: true,
            remainingMs: 0,
            parts: splitDuration(0),
            startDate,
            endDate,
        };
    }

    return {
        visible: true,
        expired: false,
        remainingMs,
        parts: splitDuration(remainingMs),
        startDate,
        endDate,
    };
}

export function formatDateTime(value) {
    const date = toDate(value);
    if (!date) return "";
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}
