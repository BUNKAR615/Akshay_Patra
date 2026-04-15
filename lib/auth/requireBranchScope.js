import { forbidden } from "../api-response";

/**
 * requireBranchScope — for branch-scoped routes.
 *
 * Admin: branchId comes from the [branchId] URL segment (or query param).
 * BM/CM/HR/Committee: branchId is whatever the token says.
 *
 * Returns `{ branchId, error }`. When `error` is non-null it is a NextResponse
 * that the caller should return directly (typically a 403).
 *
 * Usage inside a route handler wrapped with withRole(["ADMIN"]):
 *
 *   const { branchId, error } = requireBranchScope(user, params);
 *   if (error) return error;
 *
 * For BM/CM/HR/Committee, pass the same object shape and the helper reads
 * `user.branchId` (set by middleware from the token).
 */
export function requireBranchScope(user, params) {
    // Admin: always trust the URL segment
    if (user.role === "ADMIN") {
        const branchId = params?.branchId;
        if (!branchId) {
            return { branchId: null, error: forbidden("Branch scope required") };
        }
        return { branchId, error: null };
    }

    // Everyone else: must have branchId in token
    if (!user.branchId) {
        return { branchId: null, error: forbidden("No branch scope assigned to this user") };
    }

    // If the route has a [branchId] segment, it must match the user's scope
    if (params?.branchId && params.branchId !== user.branchId) {
        return { branchId: null, error: forbidden("You are not authorized for this branch") };
    }

    return { branchId: user.branchId, error: null };
}
