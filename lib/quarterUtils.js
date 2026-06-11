// Quarter / formatting helpers shared by admin dashboard views.

// Auto-generate quarter name based on current month / financial year
export function getAutoQuarterName() {
    const now = new Date();
    const month = now.getMonth(); // 0-11
    const year = now.getFullYear();
    const qNum = month < 3 ? 4 : month < 6 ? 1 : month < 9 ? 2 : 3;
    const fyYear = qNum >= 1 && qNum <= 3 ? year : year - 1;
    return `Q${qNum}-${fyYear}`;
}

// Date-only formatter for exports.
export function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
}

// Score formatter — round to 2dp, preserve null/undefined as blank.
export function fmtScore(v) {
    if (v === null || v === undefined) return "";
    const n = Number(v);
    if (Number.isNaN(n)) return "";
    return Math.round(n * 100) / 100;
}
