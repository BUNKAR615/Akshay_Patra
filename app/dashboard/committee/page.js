"use client";

import { useState, useEffect } from "react";
import DashboardShell from "../../../components/DashboardShell";

const BLUE = "#1565C0";
const BLUE_LIGHT = "#E3F2FD";
const BLUE_BORDER = "#90CAF9";

async function api(url) {
    const res = await fetch(url);
    const json = await res.json();
    if (!res.ok) {
        if (res.status === 401) {
            window.location.replace("/login");
            return new Promise(() => {});
        }
        throw new Error(json.message || "Something went wrong.");
    }
    if (!json.success) throw new Error(json.message || "Something went wrong.");
    return json.data;
}

function PdfLink({ url, label }) {
    if (!url) return <span className="text-[13px] text-[#999999]">--</span>;
    return (
        <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] font-bold px-3 py-1.5 rounded-lg border transition-colors"
            style={{ color: BLUE, borderColor: BLUE_BORDER, backgroundColor: BLUE_LIGHT }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "#BBDEFB"; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = BLUE_LIGHT; }}
        >
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {label}
        </a>
    );
}

function SmallBranchTable({ employees }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead>
                    <tr className="border-b-2" style={{ borderColor: BLUE_BORDER }}>
                        {["Name", "Emp Code", "Self-Assessment", "Branch Manager", "Cluster Manager", "Attendance", "Punctuality"].map((h) => (
                            <th
                                key={h}
                                className="px-4 py-3 text-[12px] font-bold uppercase tracking-wider whitespace-nowrap"
                                style={{ color: BLUE }}
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E0E0]">
                    {employees.map((emp, i) => (
                        <tr key={i} className="hover:bg-[#FAFAFA] transition-colors">
                            <td className="px-4 py-3">
                                <p className="text-[14px] font-bold text-[#1A1A2E]">{emp.name}</p>
                                {emp.designation && (
                                    <p className="text-[12px] text-[#666666]">{emp.designation}</p>
                                )}
                            </td>
                            <td className="px-4 py-3 text-[14px] text-[#333333] font-medium">{emp.empCode}</td>
                            <td className="px-4 py-3">
                                <span className="text-[14px] font-bold text-[#333333]">
                                    {emp.selfAssessmentScore != null ? emp.selfAssessmentScore : "--"}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                <span className="text-[14px] font-bold text-[#333333]">
                                    {emp.branchManagerScore != null ? emp.branchManagerScore : "--"}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                <span className="text-[14px] font-bold text-[#333333]">
                                    {emp.clusterManagerScore != null ? emp.clusterManagerScore : "--"}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                <PdfLink url={emp.attendancePdfUrl} label="Attendance" />
                            </td>
                            <td className="px-4 py-3">
                                <PdfLink url={emp.punctualityPdfUrl} label="Punctuality" />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function BigBranchTable({ employees }) {
    return (
        <div className="overflow-x-auto">
            <table className="w-full text-left">
                <thead>
                    <tr className="border-b-2" style={{ borderColor: BLUE_BORDER }}>
                        {["Name", "Emp Code", "Collar Type", "Attendance", "Punctuality"].map((h) => (
                            <th
                                key={h}
                                className="px-4 py-3 text-[12px] font-bold uppercase tracking-wider whitespace-nowrap"
                                style={{ color: BLUE }}
                            >
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-[#E0E0E0]">
                    {employees.map((emp, i) => (
                        <tr key={i} className="hover:bg-[#FAFAFA] transition-colors">
                            <td className="px-4 py-3">
                                <p className="text-[14px] font-bold text-[#1A1A2E]">{emp.name}</p>
                                {emp.designation && (
                                    <p className="text-[12px] text-[#666666]">{emp.designation}</p>
                                )}
                            </td>
                            <td className="px-4 py-3 text-[14px] text-[#333333] font-medium">{emp.empCode}</td>
                            <td className="px-4 py-3">
                                <span
                                    className="text-[12px] font-bold px-2.5 py-1 rounded-full border"
                                    style={{
                                        color: emp.collarType === "BLUE" ? "#1565C0" : "#6A1B9A",
                                        backgroundColor: emp.collarType === "BLUE" ? "#E3F2FD" : "#F3E5F5",
                                        borderColor: emp.collarType === "BLUE" ? "#90CAF9" : "#CE93D8",
                                    }}
                                >
                                    {emp.collarType || "--"}
                                </span>
                            </td>
                            <td className="px-4 py-3">
                                <PdfLink url={emp.attendancePdfUrl} label="Attendance" />
                            </td>
                            <td className="px-4 py-3">
                                <PdfLink url={emp.punctualityPdfUrl} label="Punctuality" />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function CommitteeDashboard() {
    const [user, setUser] = useState(null);
    const [currentQuarterName, setCurrentQuarterName] = useState("");
    const [quarter, setQuarter] = useState(null);
    const [byBranch, setByBranch] = useState({});
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        (async () => {
            const [meResult, resultsResult] = await Promise.allSettled([
                api("/api/auth/me"),
                api("/api/committee/results"),
            ]);

            if (meResult.status === "fulfilled") {
                setUser(meResult.value.user);
                setCurrentQuarterName(meResult.value.currentQuarter);
            }
            if (resultsResult.status === "fulfilled") {
                const data = resultsResult.value;
                setQuarter(data.quarter);
                setByBranch(data.byBranch || {});
                setTotal(data.total || 0);
            } else {
                setError(resultsResult.reason?.message || "Unable to load committee results.");
            }
            setLoading(false);
        })();
    }, []);

    const branchNames = Object.keys(byBranch).sort();

    return (
        <DashboardShell user={user} currentQuarter={currentQuarterName} title="Committee Dashboard">
            {/* Loading */}
            {loading && (
                <div className="space-y-4">
                    {[1, 2].map((n) => (
                        <div key={n} className="bg-white border border-[#E0E0E0] rounded-xl p-6 animate-pulse">
                            <div className="h-5 bg-[#E0E0E0] rounded w-48 mb-4" />
                            <div className="h-4 bg-[#E0E0E0] rounded w-full mb-2" />
                            <div className="h-4 bg-[#E0E0E0] rounded w-3/4" />
                        </div>
                    ))}
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <div className="mb-6 p-4 bg-[#FFEBEE] border-l-4 border-[#D32F2F] rounded-r-lg shadow-sm">
                    <p className="text-[#D32F2F] text-[14px] font-bold">{error}</p>
                </div>
            )}

            {!loading && !error && (
                <div className="space-y-8">
                    {/* Quarter Header */}
                    {quarter && (
                        <div
                            className="bg-white border shadow-sm rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                            style={{ borderColor: BLUE_BORDER }}
                        >
                            <div>
                                <p className="text-[13px] font-bold uppercase tracking-wider" style={{ color: "#666666" }}>
                                    Quarter
                                </p>
                                <p className="text-[20px] font-bold" style={{ color: BLUE }}>
                                    {quarter.name}
                                </p>
                            </div>
                            <div className="flex items-center gap-4">
                                <span
                                    className="text-[13px] px-4 py-1.5 rounded-full border font-bold"
                                    style={{
                                        backgroundColor: quarter.status === "ACTIVE" ? "#E8F5E9" : "#F5F5F5",
                                        color: quarter.status === "ACTIVE" ? "#1B5E20" : "#666666",
                                        borderColor: quarter.status === "ACTIVE" ? "#A5D6A7" : "#CCCCCC",
                                    }}
                                >
                                    {quarter.status}
                                </span>
                                <span
                                    className="text-[13px] px-4 py-1.5 rounded-full border font-bold"
                                    style={{ backgroundColor: BLUE_LIGHT, color: BLUE, borderColor: BLUE_BORDER }}
                                >
                                    {total} {total === 1 ? "Nominee" : "Nominees"}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* No results */}
                    {branchNames.length === 0 && (
                        <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-2xl p-12 text-center">
                            <svg className="w-12 h-12 mx-auto mb-4 opacity-40" style={{ color: BLUE }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <h3 className="text-[20px] font-bold text-[#333333] mb-2">No Results Available</h3>
                            <p className="text-[#666666] text-[15px] font-medium max-w-md mx-auto">
                                Best employee nominations have not been finalized for this quarter yet.
                            </p>
                        </div>
                    )}

                    {/* Branch-wise results */}
                    {branchNames.map((branchName) => {
                        const employees = byBranch[branchName];
                        const branchType = employees[0]?.branchType;
                        const isSmall = branchType === "SMALL";

                        return (
                            <div
                                key={branchName}
                                className="bg-white border shadow-sm rounded-xl overflow-hidden"
                                style={{ borderColor: "#E0E0E0" }}
                            >
                                {/* Branch header */}
                                <div
                                    className="px-6 py-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                                    style={{ backgroundColor: BLUE_LIGHT, borderColor: BLUE_BORDER }}
                                >
                                    <div className="flex items-center gap-3">
                                        <svg className="w-5 h-5 shrink-0" style={{ color: BLUE }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                        <h3 className="text-[17px] font-bold" style={{ color: BLUE }}>
                                            {branchName}
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span
                                            className="text-[12px] font-bold px-3 py-1 rounded-full border"
                                            style={{
                                                backgroundColor: isSmall ? "#FFF8E1" : "#F3E5F5",
                                                color: isSmall ? "#F57F17" : "#6A1B9A",
                                                borderColor: isSmall ? "#FFE082" : "#CE93D8",
                                            }}
                                        >
                                            {branchType} Branch
                                        </span>
                                        <span className="text-[12px] font-bold text-[#666666]">
                                            {employees.length} {employees.length === 1 ? "nominee" : "nominees"}
                                        </span>
                                    </div>
                                </div>

                                {/* Table */}
                                {isSmall ? (
                                    <SmallBranchTable employees={employees} />
                                ) : (
                                    <BigBranchTable employees={employees} />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </DashboardShell>
    );
}
