"use client";

/**
 * Empty state with optional action slot.
 * `Empty` (icon/title/sub) is the legacy alias — same visual, no action.
 */
export function EmptyState({ icon = "📄", title, sub, action }) {
    return (
        <div className="text-center py-12 px-6 text-gray-400">
            <div className="text-4xl mb-2.5" aria-hidden="true">{icon}</div>
            <p className="text-sm font-bold text-gray-700 mb-1 m-0">{title}</p>
            {sub && <p className="text-xs m-0">{sub}</p>}
            {action && <div className="mt-4 flex justify-center">{action}</div>}
        </div>
    );
}

export function Empty({ icon, title, sub }) {
    return <EmptyState icon={icon} title={title} sub={sub} />;
}
