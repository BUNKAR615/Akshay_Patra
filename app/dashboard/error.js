"use client";

import { useEffect } from "react";

/**
 * Dashboard-scoped error boundary.
 *
 * Catches render-time crashes inside any /dashboard/* page (e.g. a `.map` on
 * an undefined API field) so one broken response can never blank the whole
 * app. The user can retry in place or return to login — no browser-cache
 * clear is required.
 */
export default function DashboardError({ error, reset }) {
    useEffect(() => {
        console.error("Dashboard boundary caught an error:", error);
    }, [error]);

    return (
        <div className="min-h-[60vh] bg-[#F5F5F5] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 text-red-400 mb-5">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#003087] mb-3">This page hit a problem</h1>
            <p className="text-[#333333] mb-8 max-w-sm">
                Something went wrong while loading this view. You can try again — if
                it keeps happening, sign in again.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
                <button
                    onClick={() => reset()}
                    className="px-6 py-2.5 bg-[#003087] hover:bg-[#00843D] text-white font-medium rounded-lg transition-colors cursor-pointer"
                >
                    Try Again
                </button>
                <a
                    href="/login"
                    className="px-6 py-2.5 bg-white border border-[#E0E0E0] text-[#333333] font-medium rounded-lg hover:bg-[#F9FAFB] transition-colors"
                >
                    Back to Login
                </a>
            </div>
        </div>
    );
}
