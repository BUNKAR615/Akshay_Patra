"use client";

import Link from "next/link";

/**
 * Standard page header: breadcrumbs → title/subtitle ← actions, optional KPI slot.
 * `Header` (title/subtitle/actions) remains the legacy alias.
 */
export function PageHeader({ title, subtitle, actions, breadcrumbs, kpis }) {
    return (
        <div className="mb-5">
            {breadcrumbs?.length > 0 && (
                <nav aria-label="Breadcrumb" className="mb-2">
                    <ol className="flex items-center gap-1.5 text-xs text-gray-400 m-0 p-0 list-none flex-wrap">
                        {breadcrumbs.map((bc, i) => {
                            const last = i === breadcrumbs.length - 1;
                            return (
                                <li key={i} className="flex items-center gap-1.5">
                                    {bc.href && !last ? (
                                        <Link href={bc.href} className="text-gray-500 hover:text-ap-blue font-semibold no-underline">
                                            {bc.label}
                                        </Link>
                                    ) : (
                                        <span aria-current={last ? "page" : undefined} className={last ? "text-gray-700 font-bold" : "font-semibold"}>
                                            {bc.label}
                                        </span>
                                    )}
                                    {!last && <span aria-hidden="true">/</span>}
                                </li>
                            );
                        })}
                    </ol>
                </nav>
            )}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-[21px] font-extrabold text-gray-900 m-0 tracking-tight">{title}</h1>
                    {subtitle && <p className="text-[13px] text-gray-500 mt-1 m-0">{subtitle}</p>}
                </div>
                {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
            </div>
            {kpis && <div className="mt-4">{kpis}</div>}
        </div>
    );
}

export function Header({ title, subtitle, actions }) {
    return <PageHeader title={title} subtitle={subtitle} actions={actions} />;
}
