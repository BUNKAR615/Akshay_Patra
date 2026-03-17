"use client";

/**
 * Skeleton loader components for use while data is loading.
 */

/** Rectangular skeleton block */
export function SkeletonBlock({ className = "" }) {
    return (
        <div className={`bg-[#E0E0E0] rounded-lg animate-pulse ${className}`} />
    );
}

/** Skeleton card matching dashboard card style */
export function SkeletonCard({ lines = 3 }) {
    return (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-6 space-y-4">
            <SkeletonBlock className="h-4 w-1/3" />
            {Array.from({ length: lines }).map((_, i) => (
                <SkeletonBlock key={i} className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
            ))}
        </div>
    );
}

/** Skeleton table rows */
export function SkeletonTable({ rows = 5, cols = 4 }) {
    return (
        <div className="bg-white border border-[#E0E0E0] rounded-xl overflow-hidden">
            <div className="p-4 border-b border-[#E0E0E0]">
                <SkeletonBlock className="h-4 w-40" />
            </div>
            <div className="divide-y divide-[#E0E0E0]">
                {Array.from({ length: rows }).map((_, r) => (
                    <div key={r} className="flex items-center gap-4 px-4 py-3">
                        {Array.from({ length: cols }).map((_, c) => (
                            <SkeletonBlock key={c} className={`h-3 flex-1 ${c === 0 ? "max-w-[150px]" : ""}`} />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Full-page spinner */
export function PageSpinner() {
    return (
        <div className="flex items-center justify-center h-64">
            <div className="relative">
                <div className="animate-spin h-10 w-10 border-2 border-[#003087]/30 border-t-[#003087] rounded-full" />
                <div className="animate-spin h-10 w-10 border-2 border-[#F7941D]/30 border-b-[#F7941D] rounded-full absolute inset-0" style={{ animationDirection: "reverse", animationDuration: "1.5s" }} />
            </div>
        </div>
    );
}

/** Stats row skeleton */
export function SkeletonStats({ count = 4 }) {
    return (
        <div className={`grid grid-cols-2 sm:grid-cols-${count} gap-4`}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="bg-white border border-[#E0E0E0] rounded-xl p-4 text-center space-y-2">
                    <SkeletonBlock className="h-3 w-16 mx-auto" />
                    <SkeletonBlock className="h-7 w-12 mx-auto" />
                </div>
            ))}
        </div>
    );
}
