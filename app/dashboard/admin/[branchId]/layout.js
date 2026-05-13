"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import DashboardShell from "../../../../components/DashboardShell";
import BranchSideNav from "../../../../components/admin/BranchSideNav";
import { SkeletonCard } from "../../../../components/Skeleton";
import { DASHBOARD_HOME } from "../../../../lib/dashboardNav";

async function api(url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) { window.location.replace("/login"); return new Promise(() => {}); }
        throw new Error(json.message || "Request failed");
    }
    if (!json.success) throw new Error(json.message || "Request failed");
    return json.data;
}

export default function BranchLayout({ children }) {
    const { branchId } = useParams();
    const [user, setUser] = useState(null);
    const [currentQuarter, setCurrentQuarter] = useState("");
    const [branchName, setBranchName] = useState("");
    const [branchType, setBranchType] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const me = await api("/api/auth/me");
                // Hard role gate. Middleware should already block non-admins
                // from this URL prefix, but keep the explicit guard so this
                // page does not depend on a single layer.
                if (me?.user?.role !== "ADMIN") {
                    const home = DASHBOARD_HOME[me?.user?.role] || "/login";
                    window.location.replace(home);
                    return;
                }
                const summary = await api(`/api/admin/branches/${branchId}/summary`);
                setUser(me.user);
                setCurrentQuarter(me.currentQuarter || "");
                setBranchName(summary.branch.name);
                setBranchType(summary.branch.branchType);
            } catch { /* child page will show errors */ }
            setLoading(false);
        })();
    }, [branchId]);

    if (loading) {
        return (
            <DashboardShell user={user} currentQuarter={currentQuarter} title="Admin Dashboard">
                <SkeletonCard lines={4} />
            </DashboardShell>
        );
    }

    return (
        <DashboardShell user={user} currentQuarter={currentQuarter} title="Admin Dashboard">
            <div className="flex flex-col lg:flex-row gap-6">
                <BranchSideNav branchId={branchId} branchName={branchName} branchType={branchType} />
                <div className="flex-1 min-w-0">
                    {children}
                </div>
            </div>
        </DashboardShell>
    );
}
