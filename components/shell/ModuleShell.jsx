"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/clientApi";
import { getModule } from "../../lib/modules";
import ModuleRail from "./ModuleRail";
import ModuleSidebar from "./ModuleSidebar";
import ModuleTopBar from "./ModuleTopBar";

/**
 * 3-pane module shell: [ Module Rail 94px ][ Internal Sidebar 248px ]
 * [ Main: TopBar 60px + scrollable content ]. Admin-only — the existing
 * DashboardShell is untouched and still drives /dashboard/admin.
 *
 * @param {string} moduleId    - id from lib/modules.js (e.g. "exam", "fs")
 * @param {string} crumb       - current view label for the breadcrumb
 * @param {string} activeNavId - id of the active internal-sidebar item
 */
export default function ModuleShell({ moduleId, crumb, activeNavId, children }) {
    const mod = getModule(moduleId);
    const [user, setUser] = useState(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const d = await api("/api/auth/me");
                if (alive) setUser(d.user);
            } catch {
                /* sidebar footer falls back to "Admin" while unauthenticated/loading */
            }
        })();
        return () => { alive = false; };
    }, []);

    return (
        <div className="flex h-screen min-h-[100dvh] bg-ap-bg overflow-hidden">
            <ModuleRail activeId={moduleId} />
            <ModuleSidebar module={mod} activeNavId={activeNavId} user={user} />
            <div className="flex-1 flex flex-col min-w-0">
                <ModuleTopBar module={mod} crumb={crumb} />
                <main className="flex-1 overflow-y-auto p-5 sm:p-7 lg:p-8 min-w-0">{children}</main>
            </div>
        </div>
    );
}
