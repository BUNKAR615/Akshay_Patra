import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

/**
 * Next.js Middleware — JWT authentication via cookie OR Authorization header
 *
 * Uses `jose` library (Edge Runtime compatible) instead of `jsonwebtoken`
 * which only works in Node.js runtime.
 */

const PUBLIC_API_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/auth/refresh", "/api/auth/test", "/api/health"];
const PUBLIC_PAGE_PATHS = ["/login", "/"];

function isPublicApi(pathname) {
    return PUBLIC_API_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPublicPage(pathname) {
    return PUBLIC_PAGE_PATHS.includes(pathname);
}

// Role → allowed dashboard path mapping
const ROLE_PATHS = {
    EMPLOYEE: "/dashboard/employee",
    SUPERVISOR: "/dashboard/supervisor",
    BRANCH_MANAGER: "/dashboard/branch-manager",
    CLUSTER_MANAGER: "/dashboard/cluster-manager",
    ADMIN: "/dashboard/admin",
};

/**
 * Verify JWT using jose (works in Edge Runtime).
 * Returns the decoded payload or null if invalid.
 */
async function verifyJwt(token) {
    try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
            console.error("[MIDDLEWARE] JWT_SECRET not set");
            return null;
        }
        const key = new TextEncoder().encode(secret);
        const { payload } = await jwtVerify(token, key);
        return payload;
    } catch (err) {
        console.error("[MIDDLEWARE] JWT verify failed:", err.code || err.message);
        return null;
    }
}

function extractBearerToken(authHeader) {
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    return authHeader.slice(7);
}

export async function middleware(request) {
    const { pathname } = request.nextUrl;

    // ── Static assets / Next internals — skip ──
    if (pathname.startsWith("/_next") || pathname.startsWith("/favicon") || pathname.includes(".")) {
        return NextResponse.next();
    }

    // ── API routes ──
    if (pathname.startsWith("/api")) {
        if (isPublicApi(pathname)) return NextResponse.next();

        // Try Authorization header first, then cookie
        const authHeader = request.headers.get("authorization");
        let token = extractBearerToken(authHeader);
        if (!token) {
            token = request.cookies.get("token")?.value;
        }

        if (!token) {
            return NextResponse.json(
                { success: false, message: "Authentication required" },
                { status: 401 }
            );
        }

        const decoded = await verifyJwt(token);
        if (!decoded) {
            return NextResponse.json(
                { success: false, message: "Invalid or expired token" },
                { status: 401 }
            );
        }

        const requestHeaders = new Headers(request.headers);
        requestHeaders.set("x-user-id", decoded.userId);
        requestHeaders.set("x-user-role", decoded.role);
        requestHeaders.set("x-user-department-id", decoded.departmentId || "");
        return NextResponse.next({ request: { headers: requestHeaders } });
    }

    // ── Page routes ──
    if (isPublicPage(pathname)) {
        // If user has a token and hits /login, redirect to their dashboard
        const token = request.cookies.get("token")?.value;
        if (token) {
            const decoded = await verifyJwt(token);
            if (decoded && ROLE_PATHS[decoded.role]) {
                return NextResponse.redirect(new URL(ROLE_PATHS[decoded.role], request.url));
            }
        }
        return NextResponse.next();
    }

    // Dashboard pages — require valid cookie
    if (pathname.startsWith("/dashboard")) {
        const token = request.cookies.get("token")?.value;

        if (!token) {
            return NextResponse.redirect(new URL("/login?error=Session expired, please login again", request.url));
        }

        const decoded = await verifyJwt(token);

        if (!decoded) {
            const response = NextResponse.redirect(new URL("/login?error=Session expired, please login again", request.url));
            response.cookies.delete("token");
            response.cookies.delete("refreshToken");
            return response;
        }

        // Check role-based access
        const allowedPath = ROLE_PATHS[decoded.role];
        if (allowedPath && !pathname.startsWith(allowedPath)) {
            // Redirect to the new unauthorized page instead of their home dashboard
            return NextResponse.redirect(new URL("/unauthorized", request.url));
        }

        // Apply cache-control headers to prevent back-button viewing after logout
        const response = NextResponse.next();
        response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        response.headers.set("Pragma", "no-cache");
        response.headers.set("Expires", "0");
        return response;
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
