/**
 * Server-side input sanitizer.
 * Strips HTML tags and dangerous characters from string inputs.
 * Used on all API route string inputs to prevent XSS.
 */

/**
 * Strip HTML tags from a string.
 */
function stripTags(str) {
    return str
        .replace(/<[^>]*>/g, "")          // Remove HTML tags
        .replace(/&lt;/gi, "<")           // Decode common entities for re-strip
        .replace(/&gt;/gi, ">")
        .replace(/<[^>]*>/g, "")          // Second pass after decoding
        .replace(/javascript:/gi, "")     // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, "")       // Remove inline event handlers
        .replace(/data:\s*text\/html/gi, ""); // Remove data:text/html
}

/**
 * Deep-sanitize an object, array, or string.
 * Recursively walks through all values and sanitizes strings.
 * Numbers, booleans, and null are passed through unchanged.
 *
 * @param {any} input
 * @returns {any} sanitized input
 */
export function sanitize(input) {
    if (input === null || input === undefined) return input;

    if (typeof input === "string") {
        return stripTags(input).trim();
    }

    if (Array.isArray(input)) {
        return input.map(sanitize);
    }

    if (typeof input === "object") {
        const result = {};
        for (const [key, value] of Object.entries(input)) {
            result[key] = sanitize(value);
        }
        return result;
    }

    // Numbers, booleans, etc. — pass through
    return input;
}

/**
 * Sanitize specific fields in an object.
 * @param {object} obj
 * @param {string[]} fields - field names to sanitize
 * @returns {object}
 */
export function sanitizeFields(obj, fields) {
    const result = { ...obj };
    for (const field of fields) {
        if (typeof result[field] === "string") {
            result[field] = sanitize(result[field]);
        }
    }
    return result;
}
