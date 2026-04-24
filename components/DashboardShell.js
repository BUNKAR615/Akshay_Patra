"use client";

import { useEffect, useState } from "react";
import Sidebar from "./shell/Sidebar";
import TopBar from "./shell/TopBar";

const LS_KEY = "ap.sidebar.collapsed";

export default function DashboardShell({ user, currentQuarter, title, children }) {
    const [collapsed, setCollapsed] = useState(false);

    // Hydrate sidebar collapsed state from localStorage on mount.
    useEffect(() => {
        try {
            const v = localStorage.getItem(LS_KEY);
            if (v === "1") setCollapsed(true);
        } catch {}
    }, []);

    const toggle = () => {
        setCollapsed((prev) => {
            const next = !prev;
            try { localStorage.setItem(LS_KEY, next ? "1" : "0"); } catch {}
            return next;
        });
    };

    const role = user?.role || "ADMIN";

    return (
        <div className="flex min-h-screen bg-[#F4F6FA]">
            <Sidebar user={user} role={role} collapsed={collapsed} onToggle={toggle} />
            <div className="flex-1 flex flex-col min-w-0">
                <TopBar onToggle={toggle} currentQuarter={currentQuarter} />
                <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
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
