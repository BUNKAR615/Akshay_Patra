"use client";

import Link from "next/link";
import { NAV, DASHBOARD_HOME, parseHref } from "../../lib/dashboardNav";

function titleCase(slug) {
    return slug
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Derive breadcrumb trail from the role's nav config + current URL.
 * Returns [] on the role's home (no crumbs needed there).
 */
export function deriveBreadcrumbs(role, pathname, view) {
    const home = DASHBOARD_HOME[role];
    if (!home || !pathname) return [];

    const crumbs = [{ label: "Dashboard", href: home }];
    const groups = NAV[role] || [];
    const all = groups.flatMap((g) => g.items);

    // ?view= tab on the role home → "Dashboard / {Tab label}"
    if (pathname === home) {
        if (!view) return [];
        const item = all.find((i) => parseHref(i.href).view === view && parseHref(i.href).path === home);
        crumbs.push({ label: item?.label || titleCase(view) });
        return crumbs;
    }

    // Nested route → walk segments below the home path.
    const rest = pathname.startsWith(home) ? pathname.slice(home.length) : pathname;
    const segments = rest.split("/").filter(Boolean);
    let acc = home;
    segments.forEach((seg, i) => {
        acc += `/${seg}`;
        const navHit = all.find((it) => parseHref(it.href).path === acc);
        const last = i === segments.length - 1;
        // Opaque ids (branchId etc.) get a generic label; pages can override
        // via the DashboardShell `breadcrumbs` prop for real names.
        const label = navHit?.label || (/^[a-z0-9]{16,}$/i.test(seg) ? "Branch" : titleCase(seg));
        crumbs.push(last ? { label } : { label, href: acc });
    });
    return crumbs;
}

export default function Breadcrumbs({ items }) {
    if (!items?.length) return null;
    return (
        <nav aria-label="Breadcrumb" className="hidden md:block min-w-0">
            <ol className="flex items-center gap-1.5 text-xs text-gray-400 m-0 p-0 list-none">
                {items.map((bc, i) => {
                    const last = i === items.length - 1;
                    return (
                        <li key={i} className="flex items-center gap-1.5 min-w-0">
                            {bc.href && !last ? (
                                <Link href={bc.href} className="text-gray-500 hover:text-ap-blue font-semibold no-underline whitespace-nowrap">
                                    {bc.label}
                                </Link>
                            ) : (
                                <span aria-current={last ? "page" : undefined} className={`whitespace-nowrap truncate ${last ? "text-gray-800 font-bold" : "font-semibold"}`}>
                                    {bc.label}
                                </span>
                            )}
                            {!last && <span aria-hidden="true" className="text-gray-300">/</span>}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
