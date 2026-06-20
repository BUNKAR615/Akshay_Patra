// Bucket a free-text designation into a coarse "role" facet for the exam
// audience employee picker. Mirrors the roleOf() mapping from the design
// prototype so the picker's Role filter matches the intended UX. Kept separate
// from the Role enum (which is about evaluation scope, not job function).

export function roleBucket(designation) {
    const d = (designation || "").toLowerCase();
    if (!d) return "Staff";
    if (d.includes("regional manager")) return "Regional Manager";
    if (d.includes("manager") || d.includes("agm")) return "Manager";
    if (d.includes("supervis")) return "Supervisor";
    if (d.includes("cook") || d.includes("vessel")) return "Cook";
    if (d.includes("driver")) return "Driver";
    if (d.includes("helper")) return "Helper";
    if (/electric|plumber|welder|fitter|operator/.test(d)) return "Technician";
    if (d.includes("security")) return "Security";
    if (d.includes("officer")) return "Officer";
    if (d.includes("executive")) return "Executive";
    return "Staff";
}

export function initialsOf(name) {
    return (name || "")
        .split(" ")
        .filter(Boolean)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

// Stable avatar palette — index derived from a string so the same employee
// always gets the same colour without storing it.
export const AVATAR_COLORS = [
    ["#EEF3FB", "#003087"],
    ["#EBF7F1", "#006B32"],
    ["#FEF4E8", "#C2410C"],
    ["#F3EFFE", "#6D28D9"],
    ["#EFF6FF", "#0369A1"],
    ["#FFF1F2", "#BE123C"],
];

export function avatarColors(seed) {
    const sum = String(seed || "")
        .split("")
        .reduce((a, c) => a + c.charCodeAt(0), 0);
    return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
