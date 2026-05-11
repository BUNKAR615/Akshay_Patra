"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateTime, getQuarterCountdownState } from "../lib/quarterCountdown";

function TimeBox({ label, value }) {
    return (
        <div className="min-w-[58px] rounded-lg border border-[#B7D7F2] bg-white px-2.5 py-2 text-center shadow-sm">
            <p className="text-[22px] font-black leading-none text-[#003087] tabular-nums">
                {String(value).padStart(2, "0")}
            </p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#666666]">{label}</p>
        </div>
    );
}

export default function QuarterCountdown({ quarter, className = "", compact = false }) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);

    const state = useMemo(() => getQuarterCountdownState(quarter, now), [quarter, now]);
    if (!state.visible) return null;

    const { days, hours, minutes, seconds } = state.parts;
    const endText = formatDateTime(state.endDate);
    const startText = state.startDate ? formatDateTime(state.startDate) : "";
    const ariaLabel = state.expired
        ? `${quarter.name} quarter end time has passed.`
        : `${quarter.name} quarter ends in ${days} days, ${hours} hours, ${minutes} minutes, and ${seconds} seconds.`;

    return (
        <section
            role="timer"
            aria-label={ariaLabel}
            className={`rounded-xl border shadow-sm ${state.expired ? "border-[#EF9A9A] bg-[#FFEBEE]" : "border-[#90CAF9] bg-[#E3F2FD]"} ${compact ? "p-3" : "p-4 sm:p-5"} ${className}`}
        >
            <div className={`flex ${compact ? "flex-col xl:flex-row xl:items-center" : "flex-col md:flex-row md:items-center"} gap-3 justify-between`}>
                <div className="min-w-0">
                    <p className={`font-black uppercase tracking-wider ${compact ? "text-[10px]" : "text-[11px]"} ${state.expired ? "text-[#D32F2F]" : "text-[#003087]"}`}>
                        {state.expired ? "Quarter end time has passed" : "Quarter ends in"}
                    </p>
                    <p className={`${compact ? "text-sm" : "text-base"} font-bold text-[#1A1A2E]`}>
                        {quarter.name}
                    </p>
                    <p className="text-xs font-medium text-[#333333]">
                        {endText ? `Ends: ${endText}` : "End timing not available"}
                        {startText ? ` | Started: ${startText}` : ""}
                    </p>
                </div>
                <div className="grid grid-cols-4 gap-2">
                    <TimeBox label="Days" value={days} />
                    <TimeBox label="Hours" value={hours} />
                    <TimeBox label="Mins" value={minutes} />
                    <TimeBox label="Secs" value={seconds} />
                </div>
            </div>
        </section>
    );
}
