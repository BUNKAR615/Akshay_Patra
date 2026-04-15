"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "../../../../components/DashboardShell";
import { SkeletonCard } from "../../../../components/Skeleton";

async function api(url, opts) {
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) { window.location.replace("/login"); return new Promise(() => {}); }
        throw new Error(json.message || "Request failed");
    }
    if (!json.success) throw new Error(json.message || "Request failed");
    return json.data;
}

export default function BranchSelectorPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [currentQuarter, setCurrentQuarter] = useState("");
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Create branch form
    const [showCreate, setShowCreate] = useState(false);
    const [newBranch, setNewBranch] = useState({ name: "", location: "", branchType: "SMALL" });
    const [creating, setCreating] = useState(false);
    const [msg, setMsg] = useState({ text: "", type: "" });

    useEffect(() => {
        (async () => {
            try {
                const [meData, branchData] = await Promise.all([
                    api("/api/auth/me"),
                    api("/api/admin/branches"),
                ]);
                setUser(meData.user);
                setCurrentQuarter(meData.currentQuarter || "");
                setBranches(branchData.branches || []);
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const handleCreate = async () => {
        if (!newBranch.name.trim() || !newBranch.location.trim()) {
            setMsg({ text: "Name and location are required", type: "error" });
            return;
        }
        setCreating(true);
        try {
            await api("/api/admin/branches", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newBranch),
            });
            setNewBranch({ name: "", location: "", branchType: "SMALL" });
            setShowCreate(false);
            setMsg({ text: "Branch created successfully!", type: "success" });
            const data = await api("/api/admin/branches");
            setBranches(data.branches || []);
        } catch (e) {
            setMsg({ text: e.message, type: "error" });
        } finally {
            setCreating(false);
        }
    };

    if (loading) {
        return (
            <DashboardShell user={user} currentQuarter={currentQuarter} title="Admin Dashboard">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <SkeletonCard lines={3} /><SkeletonCard lines={3} /><SkeletonCard lines={3} />
                </div>
            </DashboardShell>
        );
    }

    return (
        <DashboardShell user={user} currentQuarter={currentQuarter} title="Admin Dashboard">
            {error && (
                <div className="mb-6 p-4 bg-[#FFEBEE] border-l-4 border-[#D32F2F] rounded-r-lg">
                    <p className="text-[#D32F2F] text-sm font-bold">⚠ {error}</p>
                </div>
            )}

            {msg.text && (
                <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${msg.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {msg.text}
                </div>
            )}

            {/* Header row */}
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[#003087]">Branches ({branches.length})</h2>
                <div className="flex gap-2">
                    <button
                        onClick={() => router.push("/dashboard/admin/global/quarter")}
                        className="px-4 py-2 bg-white border border-[#CCCCCC] rounded-lg text-sm font-bold text-[#333333] hover:bg-[#F5F5F5] cursor-pointer"
                    >
                        Quarter Management
                    </button>
                    <button
                        onClick={() => setShowCreate(!showCreate)}
                        className="px-4 py-2 bg-[#003087] text-white rounded-lg text-sm font-bold hover:bg-[#002266] cursor-pointer"
                    >
                        {showCreate ? "Cancel" : "+ Add Branch"}
                    </button>
                </div>
            </div>

            {/* Create branch form */}
            {showCreate && (
                <div className="bg-white border border-[#E0E0E0] rounded-xl p-4 mb-6 space-y-3">
                    <h3 className="font-bold text-[#003087]">Add New Branch</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <input value={newBranch.name} onChange={e => setNewBranch(p => ({ ...p, name: e.target.value }))} placeholder="Branch Name" className="border rounded-lg px-3 py-2 text-sm" />
                        <input value={newBranch.location} onChange={e => setNewBranch(p => ({ ...p, location: e.target.value }))} placeholder="Location" className="border rounded-lg px-3 py-2 text-sm" />
                        <select value={newBranch.branchType} onChange={e => setNewBranch(p => ({ ...p, branchType: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                            <option value="SMALL">Small Branch</option>
                            <option value="BIG">Big Branch</option>
                        </select>
                        <button onClick={handleCreate} disabled={creating} className="bg-[#003087] text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-[#002266] cursor-pointer disabled:opacity-50">
                            {creating ? "Creating..." : "Create Branch"}
                        </button>
                    </div>
                </div>
            )}

            {/* Branch grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {branches.map(branch => (
                    <div
                        key={branch.id}
                        onClick={() => router.push(`/dashboard/admin/${branch.id}`)}
                        className="bg-white border border-[#E0E0E0] rounded-xl p-5 hover:shadow-md hover:border-[#003087] transition-all cursor-pointer group"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${branch.branchType === "BIG" ? "bg-orange-500" : "bg-green-500"}`} />
                                <h3 className="font-bold text-[#003087] group-hover:underline">{branch.name}</h3>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${branch.branchType === "BIG" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                                {branch.branchType}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">{branch.location}</p>

                        <div className="grid grid-cols-2 gap-2 text-center">
                            <div className="bg-[#F5F5F5] rounded-lg p-2">
                                <p className="text-[18px] font-black text-[#003087]">{branch.employeeCount || 0}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Employees</p>
                            </div>
                            <div className="bg-[#F5F5F5] rounded-lg p-2">
                                <p className="text-[18px] font-black text-[#003087]">{branch.departmentCount || 0}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase">Departments</p>
                            </div>
                        </div>

                        {(branch.bmCount > 0 || branch.cmCount > 0) && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {branch.bmCount > 0 && (
                                    <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] rounded-full font-bold">{branch.bmCount} BM</span>
                                )}
                                {branch.cmCount > 0 && (
                                    <span className="px-2 py-0.5 bg-orange-50 text-orange-700 text-[10px] rounded-full font-bold">{branch.cmCount} CM</span>
                                )}
                            </div>
                        )}

                        {branch.departments?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {branch.departments.slice(0, 5).map(d => (
                                    <span key={d.id} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] rounded-full font-medium">{d.name}</span>
                                ))}
                                {branch.departments.length > 5 && (
                                    <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[9px] rounded-full font-medium">+{branch.departments.length - 5} more</span>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {branches.length === 0 && !loading && (
                <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-xl p-12 text-center">
                    <span className="text-4xl block mb-4 opacity-50">🏢</span>
                    <h3 className="text-lg font-bold text-[#333333] mb-2">No Branches Yet</h3>
                    <p className="text-[#666666] text-sm">Create your first branch to get started.</p>
                </div>
            )}
        </DashboardShell>
    );
}
