"use client";

import Link from "next/link";

export default function NotFound() {
    return (
        <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-6 text-center">
            <div className="w-20 h-20 text-[#CCCCCC] mb-6">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            </div>
            <h1 className="text-4xl font-bold text-[#003087] mb-2">404</h1>
            <h2 className="text-2xl font-semibold text-[#333333] mb-4">Page Not Found</h2>
            <p className="text-[#333333] max-w-md mb-8">
                The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
            </p>
            <Link
                href="/"
                className="px-6 py-2.5 bg-[#003087] hover:bg-[#00843D] text-white font-medium rounded-lg transition-colors inline-block"
            >
                Return to Dashboard
            </Link>
        </div>
    );
}
