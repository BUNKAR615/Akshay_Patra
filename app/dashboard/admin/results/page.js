"use client";

import { useState, useEffect } from "react";
import DashboardShell from "../../../../components/DashboardShell";
import Link from "next/link";

export default function AdminResultsPage() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [data, setData] = useState(null);

    useEffect(() => {
        const fetchResults = async () => {
            try {
                const [meRes, resultsRes] = await Promise.all([
                    fetch("/api/auth/me"),
                    fetch("/api/admin/results")
                ]);

                const meJson = await meRes.json();
                if (meRes.status === 401) {
                    window.location.replace("/login");
                    return;
                }
                if (!meJson.success) throw new Error(meJson.message);
                setUser(meJson.data.user);

                const resultsJson = await resultsRes.json();
                if (!resultsRes.ok || !resultsJson.success) {
                    throw new Error(resultsJson.message || "Failed to load results");
                }
                
                setData(resultsJson.data);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchResults();
    }, []);

    if (loading) {
        return (
            <DashboardShell user={user} title="Final Results">
                <div className="flex items-center justify-center h-64">
                    <div className="animate-spin h-10 w-10 border-4 border-[#003087] border-t-transparent rounded-full" />
                </div>
            </DashboardShell>
        );
    }

    if (error) {
        return (
            <DashboardShell user={user} title="Final Results">
                <div className="bg-white p-6 rounded-xl border border-[#E0E0E0] shadow-sm max-w-2xl text-center mx-auto mt-8">
                    <span className="text-4xl block mb-4">🔒</span>
                    <h2 className="text-xl font-bold text-[#D32F2F] mb-2">Access Restricted</h2>
                    <p className="text-[#666666] mb-6">{error}</p>
                    <Link href="/dashboard/admin" className="px-6 py-2 bg-[#003087] text-white rounded-lg font-bold hover:bg-[#00843D] transition-colors inline-block">
                        Return to Dashboard
                    </Link>
                </div>
            </DashboardShell>
        );
    }

    return (
        <DashboardShell user={user} currentQuarter={data?.quarter?.name} title="Comprehensive Final Results">
            
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-black text-[#003087]">Score Breakdown</h1>
                    <p className="text-[#666666]">Complete evaluation results for {data?.quarter?.name}</p>
                </div>
                <Link href="/dashboard/admin" className="px-5 py-2 border-2 border-[#E0E0E0] rounded-lg text-[#333333] font-bold hover:bg-[#F5F5F5] transition-colors">
                    Back to Summary
                </Link>
            </div>

            {data?.departments?.length === 0 ? (
                <div className="bg-white p-12 rounded-xl border border-[#E0E0E0] text-center shadow-sm">
                    <p className="text-[#666666]">No employees were evaluated in this quarter.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {data.departments.map(dept => (
                        <div key={dept.id} className="bg-white border rounded-xl shadow-sm overflow-hidden border-[#A5D6A7]">
                            <div className="bg-[#E8F5E9] px-6 py-4 border-b border-[#A5D6A7] flex justify-between items-center">
                                <h2 className="text-[18px] font-black text-[#1B5E20]">Department: {dept.name}</h2>
                                <span className="text-[13px] font-bold text-[#1B5E20] bg-white px-3 py-1 rounded-full border border-[#A5D6A7]">
                                    {dept.employees.length} Evaluated
                                </span>
                            </div>
                            
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-[#F5F5F5] text-[13px] font-bold text-[#666666] uppercase tracking-wider border-b border-[#E0E0E0]">
                                            <th className="px-6 py-3 border-r border-[#E0E0E0]">Employee</th>
                                            <th className="px-4 py-3 border-r border-[#E0E0E0] text-center">Self</th>
                                            <th className="px-4 py-3 border-r border-[#E0E0E0] text-center">Sup</th>
                                            <th className="px-4 py-3 border-r border-[#E0E0E0] text-center">BM</th>
                                            <th className="px-4 py-3 border-r border-[#E0E0E0] text-center">CM</th>
                                            <th className="px-4 py-3 text-center bg-[#FFF8E1] text-[#F57C00]">Final</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#E0E0E0]">
                                        {dept.employees.map((emp, idx) => (
                                            <tr key={emp.id} className="hover:bg-[#F9F9F9] transition-colors">
                                                <td className="px-6 py-3 border-r border-[#E0E0E0] font-bold text-[#333333]">
                                                    {emp.name}
                                                </td>
                                                <td className="px-4 py-3 border-r border-[#E0E0E0] text-center font-medium text-[#666666]">
                                                    {emp.self !== null ? emp.self.toFixed(1) : '-'}
                                                </td>
                                                <td className="px-4 py-3 border-r border-[#E0E0E0] text-center font-medium text-[#666666]">
                                                    {emp.sup !== null ? emp.sup.toFixed(1) : '-'}
                                                </td>
                                                <td className="px-4 py-3 border-r border-[#E0E0E0] text-center font-medium text-[#666666]">
                                                    {emp.bm !== null ? emp.bm.toFixed(1) : '-'}
                                                </td>
                                                <td className="px-4 py-3 border-r border-[#E0E0E0] text-center font-medium text-[#666666]">
                                                    {emp.cm !== null ? emp.cm.toFixed(1) : '-'}
                                                </td>
                                                <td className="px-4 py-3 text-center bg-[#FFF8E1]/30 font-black text-[#F57C00]">
                                                    {emp.final !== null ? emp.final.toFixed(2) : '-'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    {dept.winner && (
                                        <tfoot>
                                            <tr className="bg-[#FFF8E1] border-t-2 border-[#FFE082]">
                                                <td colSpan={5} className="px-6 py-4 border-r border-[#FFE082]">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-2xl drop-shadow-sm">🏆</span>
                                                        <div>
                                                            <span className="text-[12px] font-bold text-[#F57C00] uppercase tracking-wider block leading-none mb-1">Winner</span>
                                                            <span className="text-[18px] font-black text-[#B71C1C] leading-none">{dept.winner.name}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-center">
                                                    <span className="text-[20px] font-black text-[#00843D]">{dept.winner.finalScore.toFixed(2)}</span>
                                                </td>
                                            </tr>
                                        </tfoot>
                                    )}
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </DashboardShell>
    );
}
