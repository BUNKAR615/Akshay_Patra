"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Honour the sidebar submenu deep-links. When the `?section=` query param is
 * present, scroll the element `#${prefix}-${section}` into view and give it a
 * brief highlight ring. The flash uses inline styles so no global CSS is
 * required.
 *
 * @param {string} prefix  id prefix for the view (e.g. "pipeline", "quarter").
 * @param {Array}  deps    extra deps (e.g. data-loaded flags) so the scroll
 *                         retries once the target section has rendered.
 * @returns {string|null}  the current `section` value, for views that also
 *                         switch internal tabs off it.
 */
export function useScrollToSection(prefix, deps = []) {
    const searchParams = useSearchParams();
    const section = searchParams.get("section");
    useEffect(() => {
        if (!section) return;
        const id = `${prefix}-${section}`;
        const t = setTimeout(() => {
            const el = document.getElementById(id);
            if (!el) return;
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            const prevShadow = el.style.boxShadow;
            const prevRadius = el.style.borderRadius;
            el.style.transition = "box-shadow .3s ease";
            el.style.boxShadow = "0 0 0 3px rgba(245,124,0,0.45)";
            if (!prevRadius) el.style.borderRadius = "12px";
            setTimeout(() => { el.style.boxShadow = prevShadow; el.style.borderRadius = prevRadius; }, 1600);
        }, 80);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [section, prefix, ...deps]);
    return section;
}
