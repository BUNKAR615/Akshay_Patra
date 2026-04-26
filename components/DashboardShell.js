"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./shell/Sidebar";
import TopBar from "./shell/TopBar";

const LS_KEY = "ap.sidebar.collapsed";
const MOBILE_BREAKPOINT = 768; // tailwind md

export default function DashboardShell({ user, currentQuarter, title, children }) {
    // Desktop: sidebar can be expanded (~234px) or collapsed-icon (~64px).
    // Mobile: sidebar is hidden by default and slides in over the page as a
    // drawer with a translucent backdrop. These two states are tracked
    // separately so neither breaks the other.
    const [collapsed, setCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const pathname = usePathname();

    // Detect mobile-vs-desktop and keep it in sync as the user resizes /
    // rotates the device. We use matchMedia rather than a resize listener so
    // we only re-render at the breakpoint crossover, not every pixel of drag.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
        const apply = () => setIsMobile(mq.matches);
        apply();
        // Safari < 14 only supports addListener / removeListener.
        if (mq.addEventListener) mq.addEventListener("change", apply);
        else mq.addListener(apply);
        return () => {
            if (mq.removeEventListener) mq.removeEventListener("change", apply);
            else mq.removeListener(apply);
        };
    }, []);

    // Hydrate desktop collapsed state from localStorage on mount.
    useEffect(() => {
        try {
            const v = localStorage.getItem(LS_KEY);
            if (v === "1") setCollapsed(true);
        } catch {}
    }, []);

    // Auto-close the drawer on route change so navigation feels native.
    useEffect(() => {
        setDrawerOpen(false);
    }, [pathname]);

    // Body scroll-lock while drawer is open (iOS-safe via no-scroll class).
    useEffect(() => {
        if (typeof document === "undefined") return;
        if (drawerOpen) document.body.classList.add("no-scroll");
        else document.body.classList.remove("no-scroll");
        return () => document.body.classList.remove("no-scroll");
    }, [drawerOpen]);

    // Close drawer on Esc keypress for keyboard users.
    useEffect(() => {
        if (!drawerOpen) return;
        const onKey = (e) => { if (e.key === "Escape") setDrawerOpen(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [drawerOpen]);

    const toggle = () => {
        if (isMobile) {
            setDrawerOpen((prev) => !prev);
            return;
        }
        setCollapsed((prev) => {
            const next = !prev;
            try { localStorage.setItem(LS_KEY, next ? "1" : "0"); } catch {}
            return next;
        });
    };

    const role = user?.role || "ADMIN";

    return (
        <div className="flex min-h-screen min-h-[100dvh] bg-[#F4F6FA]">
            <Sidebar
                user={user}
                role={role}
                collapsed={collapsed}
                onToggle={toggle}
                isMobile={isMobile}
                drawerOpen={drawerOpen}
                onDrawerClose={() => setDrawerOpen(false)}
            />
            <div className="flex-1 flex flex-col min-w-0">
                <TopBar onToggle={toggle} currentQuarter={currentQuarter} />
                <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 pb-safe">
                    {title && (
                        <h1 className="text-[20px] md:text-[24px] font-extrabold text-gray-900 mb-5 md:mb-6 tracking-tight">
                            {title}
                        </h1>
                    )}
                    <div className="max-w-full">{children}</div>
                </main>
            </div>
        </div>
    );
}
