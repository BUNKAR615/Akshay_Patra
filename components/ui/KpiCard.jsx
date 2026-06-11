"use client";

import { AP } from "./tokens";
import { SkeletonBlock } from "../Skeleton";

/**
 * KPI stat card. Supersedes `Stat` (which stays as a thin wrapper).
 * delta: { value: "+12%", dir: "up"|"down"|"flat" }
 */
export function KpiCard({ label, value, sub, color = AP.blue, icon, delta, onClick, loading }) {
    const Tag = onClick ? "button" : "div";
    const deltaColor = delta?.dir === "up" ? "text-ap-green" : delta?.dir === "down" ? "text-red-600" : "text-gray-400";
    const deltaArrow = delta?.dir === "up" ? "▲" : delta?.dir === "down" ? "▼" : "—";
    return (
        <Tag
            type={onClick ? "button" : undefined}
            onClick={onClick}
            className={`bg-white border border-ap-border rounded-card px-5 py-4 flex flex-col gap-1.5 text-left shadow-card w-full ${onClick ? "cursor-pointer hover:shadow-card-hover hover:border-ap-border-strong transition-all" : ""}`}
        >
            <div className="flex justify-between items-start">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider m-0">{label}</p>
                {icon && <span style={{ color, opacity: 0.6 }} aria-hidden="true">{icon}</span>}
            </div>
            {loading ? (
                <SkeletonBlock className="h-8 w-20" />
            ) : (
                <p style={{ color }} className="text-[28px] font-extrabold m-0 leading-tight">{value}</p>
            )}
            {(sub || delta) && (
                <p className="text-xs text-gray-400 m-0 font-medium flex items-center gap-1.5">
                    {delta && (
                        <span className={`font-bold ${deltaColor}`}>
                            <span aria-hidden="true">{deltaArrow}</span> {delta.value}
                        </span>
                    )}
                    {sub}
                </p>
            )}
        </Tag>
    );
}
