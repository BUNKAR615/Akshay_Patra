import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { sanitize } from "./sanitize";

/**
 * Consistent API response helpers.
 *
 * Success: { success: true, data: ... }
 * Error:   { success: false, message: "..." }
 */

export function ok(data, status = 200) {
    return NextResponse.json({ success: true, data }, { status });
}

export function created(data) {
    return ok(data, 201);
}

export function fail(message, status = 400) {
    return NextResponse.json({ success: false, message }, { status });
}

export function unauthorized(message = "Authentication required") {
    return fail(message, 401);
}

export function forbidden(message = "Insufficient permissions") {
    return fail(message, 403);
}

export function notFound(message = "Resource not found") {
    return fail(message, 404);
}

export function conflict(message) {
    return fail(message, 409);
}

export function serverError(message = "Internal server error") {
    return fail(message, 500);
}

/**
 * Validates a request body against a Zod schema.
 * Sanitizes all string inputs before validation to prevent XSS.
 * Returns { data } on success or { error: NextResponse } on failure.
 */
export async function validateBody(request, schema) {
    try {
        const rawBody = await request.json();
        const body = sanitize(rawBody); // Strip HTML/XSS from all strings
        const data = schema.parse(body);
        return { data };
    } catch (err) {
        if (err instanceof ZodError) {
            const messages = err.errors.map(
                (e) => `${e.path.join(".")}: ${e.message}`
            );
            return {
                error: fail(`Validation failed: ${messages.join("; ")}`, 400),
            };
        }
        return { error: fail("Invalid JSON body", 400) };
    }
}

/**
 * Wraps a route handler with try/catch for consistent error handling.
 */
export function withErrorHandler(handler) {
    return async (request, context) => {
        try {
            return await handler(request, context);
        } catch (error) {
            console.error("Unhandled API error:", error);
            return serverError();
        }
    };
}
