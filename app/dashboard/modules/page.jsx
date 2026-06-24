"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MODULES } from "../../../lib/modules";
import { Icon } from "../../../components/ui/Icons";
import { Avatar } from "../../../components/ui";
import { api } from "../../../lib/clientApi";
import { AP } from "../../../components/ui/tokens";
import BrandLogo from "../../../components/ui/BrandLogo";

const TAG_PALETTE = {
    Live: { bg: "rgba(0,48,135,.18)", tx: "#9DBDF0" },
    Stable: { bg: "rgba(0,132,61,.18)", tx: "#84E0B0" },
    New: { bg: "rgba(247,148,29,.18)", tx: "#FBC078" },
};

function greeting() {
    const h = new Date().getHours();
    return h < 12 ? "GOOD MORNING" : h < 17 ? "GOOD AFTERNOON" : "GOOD EVENING";
}

export default function ModuleLauncher() {
    const [user, setUser] = useState(null);
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => {
        let alive = true;
        (async () => {
            try { const d = await api("/api/auth/me"); if (alive) setUser(d.user); } catch {}
        })();
        return () => { alive = false; };
    }, []);

    const name = user?.name?.trim() || "Admin";

    const handleLogout = async () => {
        setSigningOut(true);
        try { await fetch("/api/auth/logout", { method: "POST" }); } catch {}
        window.location.href = "/login";
    };

    return (
        <div
            className="min-h-screen min-h-[100dvh] w-full overflow-y-auto"
            style={{ background: "radial-gradient(1200px 600px at 50% -10%, #0A3FA0 0%, #0D1B3E 55%, #081230 100%)" }}
        >
            {/* Header bar */}
            <header className="flex items-center justify-between px-6 sm:px-11 py-6">
                <div className="flex items-center gap-3">
                    <BrandLogo height={30} />
                    <div className="leading-tight">
                        <p className="text-white/55 text-[11px] font-bold uppercase tracking-[0.14em]">Admin Console</p>
                    </div>
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                    <div style={{ background: "rgba(0,132,61,.18)", borderColor: "rgba(132,224,176,.3)" }} className="hidden sm:flex items-center gap-1.5 border rounded-full px-3 py-1.5">
                        <span style={{ background: "#84E0B0" }} className="w-1.5 h-1.5 rounded-full animate-pulse" />
                        <span className="text-[#84E0B0] text-[11px] font-bold">Q2 2026 · Active</span>
                    </div>
                    <div className="flex items-center gap-2.5 pl-1">
                        <Avatar name={name} size={36} color={AP.orange} />
                        <div className="hidden md:block leading-tight">
                            <p className="text-white text-[13px] font-bold">{name}</p>
                            <p className="text-white/45 text-[10.5px] font-semibold">Administrator</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        disabled={signingOut}
                        title="Sign out"
                        className="flex items-center gap-1.5 border border-white/15 hover:border-white/30 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white rounded-full px-3 py-2 text-[12px] font-bold cursor-pointer transition-colors disabled:opacity-60"
                    >
                        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
                    </button>
                </div>
            </header>

            {/* Center */}
            <div className="px-6 sm:px-11 max-w-[1180px] mx-auto pb-16">
                <div className="pt-10 sm:pt-16 mb-9">
                    <p style={{ color: AP.orange, letterSpacing: ".14em" }} className="text-[13px] font-bold uppercase mb-3">
                        {greeting()}, {name.split(" ")[0].toUpperCase()}
                    </p>
                    <h1 className="text-white font-extrabold text-[32px] sm:text-[40px] tracking-tight leading-none mb-3">
                        Choose a module to begin
                    </h1>
                    <p className="text-white/60 text-[15px] sm:text-base max-w-[560px]">
                        Three independent workspaces — quarterly evaluation, feedback &amp; surveys, and online exams.
                        Pick one to jump into its dashboard.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-[22px]">
                    {MODULES.map((m, i) => {
                        const tag = TAG_PALETTE[m.tag] || TAG_PALETTE.New;
                        return (
                            <Link
                                key={m.id}
                                href={m.defaultRoute}
                                prefetch
                                className="group relative block text-left rounded-[20px] p-7 border transition-all duration-200 hover:-translate-y-1.5 cursor-pointer no-underline animate-[popIn_.4s_ease] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 overflow-hidden"
                                style={{
                                    background: "rgba(255,255,255,.04)",
                                    borderColor: "rgba(255,255,255,.1)",
                                    backdropFilter: "blur(4px)",
                                    animationDelay: `${i * 70}ms`,
                                }}
                            >
                                {/* accent glow on hover */}
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-2xl"
                                    style={{ background: m.accent }}
                                />
                                <div className="relative">
                                    <div className="flex items-start justify-between mb-5">
                                        <span
                                            style={{ background: m.tint, color: m.accent }}
                                            className="w-[54px] h-[54px] rounded-[15px] flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
                                        >
                                            <Icon name={m.icon} size={26} sw={1.9} />
                                        </span>
                                        <span style={{ background: tag.bg, color: tag.tx }} className="text-[10.5px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide">
                                            {m.tag}
                                        </span>
                                    </div>
                                    <h3 className="text-white font-extrabold text-[21px] mb-2">{m.name}</h3>
                                    <p className="text-white/55 text-[13.5px] leading-relaxed mb-6 min-h-[62px]">{m.desc}</p>
                                    <div className="flex items-end justify-between pt-4 border-t border-white/10">
                                        <div>
                                            <p className="text-white font-extrabold text-[22px] leading-none">{m.stat}</p>
                                            <p className="text-white/45 text-[11.5px] mt-1">{m.statLabel}</p>
                                        </div>
                                        <span style={{ color: m.accent }} className="text-[13px] font-bold inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                                            Open <span aria-hidden="true">→</span>
                                        </span>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>

            <style jsx>{`
                @keyframes popIn { from { opacity: 0; transform: scale(.975) translateY(8px); } to { opacity: 1; transform: scale(1) translateY(0); } }
            `}</style>
        </div>
    );
}
