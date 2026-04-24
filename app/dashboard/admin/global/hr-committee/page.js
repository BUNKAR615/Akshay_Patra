"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DashboardShell from "../../../../../components/DashboardShell";

export default function GlobalHrCommitteePage() {
    const [user, setUser] = useState(null);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const [me, br] = await Promise.all([
                    fetch("/api/auth/me").then(r => r.json()),
                    fetch("/api/admin/branches").then(r => r.json()),
                ]);
                if (me.success) setUser(me.user);
                if (br.success) setBranches(br.data.branches || []);
            } catch { }
            setLoading(false);
        })();
    }, []);

    return (
        <DashboardShell user={user} title="HR & Committee">
            <p className="text-sm text-[#666666] mb-6">
                Pick a branch to manage its HR and Committee assignments.
            </p>
            {loading ? (
                <div className="flex items-center justify-center h-48">
                    <div className="animate-spin h-8 w-8 border-2 border-[#003087] border-t-transparent rounded-full" />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {branches.map((b) => (
                        <Link
                            key={b.id}
                            href={`/dashboard/admin/${b.slug || b.id}/hr-committee`}
                            className="bg-white border border-[#E0E0E0] hover:border-[#003087] hover:shadow-md rounded-xl p-5 transition-all no-underline"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-bold text-[#1A1A2E]">{b.name}</h3>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${b.branchType === "BIG" ? "bg-[#F3E5F5] text-[#6A1B9A] border-[#CE93D8]" : "bg-[#FFF8E1] text-[#F57F17] border-[#FFE082]"}`}>
                                    {b.branchType}
                                </span>
                            </div>
                            {b.location && <p className="text-xs text-[#666666] mb-3">{b.location}</p>}
                            <p className="text-[11px] text-[#003087] font-bold">Manage HR & Committee →</p>
                        </Link>
                    ))}
                </div>
            )}
        </DashboardShell>
    );
}
