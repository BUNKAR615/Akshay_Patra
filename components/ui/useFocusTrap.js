"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Counter-based body scroll lock — multiple overlays (modal inside drawer,
// mobile sidebar + dialog) can coexist without one unlocking the other early.
let lockCount = 0;
export function lockBodyScroll() {
    lockCount += 1;
    document.body.classList.add("no-scroll");
}
export function unlockBodyScroll() {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) document.body.classList.remove("no-scroll");
}

/**
 * Focus trap for modals/drawers. While `active`:
 * - focuses the container (or its first focusable element),
 * - cycles Tab/Shift+Tab inside the container,
 * - calls `onEscape` on Esc,
 * - restores focus to the previously focused element on close.
 *
 * Returns a ref to attach to the overlay container.
 */
export function useFocusTrap(active, onEscape) {
    const containerRef = useRef(null);
    const escapeRef = useRef(onEscape);
    escapeRef.current = onEscape;

    useEffect(() => {
        if (!active) return;
        const container = containerRef.current;
        if (!container) return;

        const previouslyFocused = document.activeElement;
        const first = container.querySelector(FOCUSABLE);
        (first || container).focus({ preventScroll: true });

        const onKeyDown = (e) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                escapeRef.current?.();
                return;
            }
            if (e.key !== "Tab") return;
            const focusables = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
                (el) => el.offsetParent !== null || el === document.activeElement
            );
            if (focusables.length === 0) {
                e.preventDefault();
                return;
            }
            const firstEl = focusables[0];
            const lastEl = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            } else if (!e.shiftKey && document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        };

        document.addEventListener("keydown", onKeyDown, true);
        return () => {
            document.removeEventListener("keydown", onKeyDown, true);
            if (previouslyFocused && typeof previouslyFocused.focus === "function") {
                previouslyFocused.focus({ preventScroll: true });
            }
        };
    }, [active]);

    return containerRef;
}
