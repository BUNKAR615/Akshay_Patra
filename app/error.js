"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }) {
    useEffect(() => {
        console.error("Global boundary caught an error:", error);
    }, [error]);

    return (
        <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 text-red-400 mb-6">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            </div>
            <h1 className="text-3xl font-bold text-[#003087] mb-3">Something went wrong!</h1>
            <p className="text-[#333333] mb-8 max-w-sm">
                We encountered an unexpected error while processing your request. Please try again.
            </p>
            <button
                onClick={() => reset()}
                className="px-6 py-2.5 bg-[#003087] hover:bg-[#00843D] text-white font-medium rounded-lg transition-colors cursor-pointer"
            >
                Try Again
            </button>
        </div>
    );
}
