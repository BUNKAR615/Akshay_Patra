"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Debounced search input with clear button.
 * `onChange(value)` fires after `delay` ms of inactivity (and immediately on clear).
 */
export function SearchInput({ value = "", onChange, delay = 300, placeholder = "Search…", ariaLabel, className = "", autoFocus }) {
    const [inner, setInner] = useState(value);
    const timer = useRef(null);

    // Sync external resets (e.g. "clear filters" button in the page).
    useEffect(() => setInner(value), [value]);

    useEffect(() => () => clearTimeout(timer.current), []);

    const emit = (v) => {
        setInner(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onChange?.(v), delay);
    };

    return (
        <div className={`relative ${className}`}>
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" aria-hidden="true">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8" />
                    <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
            </span>
            <input
                type="search"
                value={inner}
                onChange={(e) => emit(e.target.value)}
                placeholder={placeholder}
                aria-label={ariaLabel || placeholder}
                autoFocus={autoFocus}
                className="w-full border-[1.5px] border-gray-300 focus:border-ap-blue rounded-lg pl-9 pr-8 py-2 text-[13px] bg-white text-gray-900 outline-none transition-colors [&::-webkit-search-cancel-button]:hidden"
            />
            {inner && (
                <button
                    type="button"
                    onClick={() => { clearTimeout(timer.current); setInner(""); onChange?.(""); }}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-gray-400 hover:text-gray-600 p-1 flex"
                >
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24">
                        <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </button>
            )}
        </div>
    );
}
