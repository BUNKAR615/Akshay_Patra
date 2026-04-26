/**
 * Default-password rules used by every account-creating route.
 *
 *  - EMPLOYEE                            → password = empCode (verbatim)
 *  - BM / CM / HR / COMMITTEE / ADMIN    → password = `${Firstname}_${last 2 digits of empCode}`
 *
 *      "Ramesh Kumar"  + empCode "BM001" → "Ramesh_01"
 *      "priya"         + empCode "CM12"  → "Priya_12"
 *      "Amit Verma"    + empCode "HR9"   → "Amit_09"   (left-padded to 2)
 *
 * If the name has no alphabetic characters or the empCode has no digits,
 * we fall back to the empCode so the user is never left with an empty
 * password. The output is always trimmed of surrounding whitespace.
 */

const STAFF_ROLES = new Set([
    "BRANCH_MANAGER",
    "CLUSTER_MANAGER",
    "HR",
    "COMMITTEE",
    "ADMIN",
]);

/**
 * Capitalize the first character of the first whitespace-delimited token in
 * `name` and strip non-alphabetic characters from it (so "  ramesh!  kumar"
 * → "Ramesh"). Returns "" if no usable token is found.
 */
function firstName(name) {
    if (!name) return "";
    const first = String(name).trim().split(/\s+/)[0] || "";
    const cleaned = first.replace(/[^A-Za-z]/g, "");
    if (!cleaned) return "";
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}

/**
 * Last two digits of the empCode, left-padded to 2. Returns "" if the
 * empCode contains no digits at all.
 */
function lastTwoDigits(empCode) {
    if (!empCode) return "";
    const digits = String(empCode).replace(/\D/g, "");
    if (!digits) return "";
    return digits.slice(-2).padStart(2, "0");
}

/**
 * Build the default plaintext password for a brand-new account.
 *
 * @param {object} args
 * @param {string} args.role     — e.g. "EMPLOYEE", "BRANCH_MANAGER", "HR"
 * @param {string} args.empCode  — employee code
 * @param {string} [args.name]   — full name (only used for staff roles)
 * @returns {string}
 */
export function defaultPasswordFor({ role, empCode, name }) {
    const code = String(empCode || "").trim();
    if (!code) return "";

    if (!STAFF_ROLES.has(role)) {
        // EMPLOYEE (and any other non-staff role) → empCode
        return code;
    }

    const fn = firstName(name);
    const tail = lastTwoDigits(code);

    if (!fn || !tail) {
        // Not enough info to follow the rule — fall back to empCode so the
        // account is still loggable-in. The admin can reset it via the
        // reset-password endpoint.
        return code;
    }
    return `${fn}_${tail}`;
}

export default defaultPasswordFor;
