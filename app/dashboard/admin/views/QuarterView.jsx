"use client";

import { useState } from "react";
import QuarterCountdown from "../../../../components/QuarterCountdown";
import StageControlPanel from "../../../../components/admin/StageControlPanel";

/**
 * Quarter management tab. Form state lives here; the confirmed start/close
 * actions (and their ConfirmDialogs) stay in page.js so the API flow and
 * quarter list refresh are unchanged.
 */
export default function QuarterView({ quarterProgress, quarterMsg, quarterLoading, onRequestStart, onRequestClose, can = () => true }) {
    const [quarterName, setQuarterName] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [questionCount, setQuestionCount] = useState(15);
    // AUTO: system picks a random balanced set. MANUAL: lock exactly the
    // questions marked "In quarter" on the Questions tab.
    const [quarterMode, setQuarterMode] = useState("AUTO");
    const [localErr, setLocalErr] = useState("");

    const requestStart = () => {
        if (!quarterName || !startDate || !endDate) return;
        if (new Date(endDate) <= new Date(startDate)) {
            setLocalErr("End date must be after start date.");
            return;
        }
        setLocalErr("");
        onRequestStart({ quarterName, startDate, endDate, questionCount: Number(questionCount) || 15, quarterMode });
    };

    const msg = localErr ? { type: "error", text: localErr } : quarterMsg;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-xl font-bold text-ap-blue">Quarter Management</h2>
                <p className="text-sm text-gray-500">Start a new evaluation quarter or close the active one.</p>
            </div>
            {msg.text && (
                <div className={`p-3 rounded-lg text-sm border ${msg.type === "success" ? "bg-ap-blue-50 border-[#90CAF9] text-ap-blue" : "bg-[#FFEBEE] border-[#EF9A9A] text-[#D32F2F]"}`}>{msg.text}</div>
            )}
            <QuarterCountdown quarter={quarterProgress?.quarter} />
            {quarterProgress?.quarter?.questionSelectionMode && (
                <div className="bg-ap-blue-50 border border-[#90CAF9] rounded-lg px-4 py-2.5 text-[13px] text-gray-700">
                    Question selection mode for <span className="font-bold">{quarterProgress.quarter.name}</span>:{" "}
                    <span className="font-bold text-ap-blue">{quarterProgress.quarter.questionSelectionMode === "MANUAL" ? "Manual" : "Automatic"}</span>
                </div>
            )}
            {can("quarter.pause") && <StageControlPanel quarter={quarterProgress?.quarter} />}
            {can("quarter.start") && (
            <div className="bg-white border border-ap-border shadow-card rounded-card p-6">
                <h3 className="text-lg font-semibold text-ap-blue mb-4">Start New Quarter</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm text-gray-700 mb-1 font-medium">Quarter Name</label>
                        <input type="text" value={quarterName} onChange={(e) => setQuarterName(e.target.value)} placeholder="Q1-2025" className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1 font-medium">Question Count per Level</label>
                        <input type="number" value={questionCount} onChange={(e) => setQuestionCount(parseInt(e.target.value))} min={10} max={25} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1 font-medium">Start Date</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue" />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-700 mb-1 font-medium">End Date</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-ap-blue" />
                    </div>
                </div>
                <div className="mb-4">
                    <label className="block text-sm text-gray-700 mb-1.5 font-medium">Question Selection Mode</label>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { v: "AUTO", label: "Automatic", desc: "System picks a random, category-balanced set" },
                            { v: "MANUAL", label: "Manual", desc: "Lock exactly the questions marked “In quarter”" },
                        ].map((m) => (
                            <button
                                key={m.v}
                                type="button"
                                onClick={() => setQuarterMode(m.v)}
                                className={`text-left px-4 py-2.5 rounded-lg border transition-colors cursor-pointer ${quarterMode === m.v ? "bg-ap-blue border-ap-blue text-white" : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                            >
                                <span className="block text-[14px] font-bold">{m.label}</span>
                                <span className={`block text-[11px] ${quarterMode === m.v ? "text-white/80" : "text-gray-500"}`}>{m.desc}</span>
                            </button>
                        ))}
                    </div>
                    {quarterMode === "MANUAL" && (
                        <p className="text-[12px] text-gray-500 mt-2">
                            Manual mode locks every question marked &ldquo;In quarter&rdquo; on the Questions tab. The &ldquo;Question Count per Level&rdquo; value above is ignored.
                        </p>
                    )}
                </div>
                <button onClick={requestStart} disabled={quarterLoading || !quarterName || !startDate || !endDate} className="min-h-[44px] min-w-[120px] px-6 py-2.5 bg-ap-blue hover:bg-ap-green text-[14px] text-white font-bold rounded-lg disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed cursor-pointer transition-all">
                    {quarterLoading ? "Starting..." : "Start Quarter"}
                </button>
            </div>
            )}
            {can("quarter.close") && (
            <div className="bg-white border border-ap-border shadow-card rounded-card p-6">
                <h3 className="text-lg font-semibold text-ap-blue mb-2">Close Active Quarter</h3>
                <p className="text-gray-700 text-sm mb-4">No scores can be modified after closing.</p>
                <button onClick={onRequestClose} disabled={quarterLoading} className="min-h-[44px] min-w-[120px] text-[14px] px-6 py-2.5 bg-ap-blue text-white border border-ap-blue hover:bg-ap-green rounded-lg font-bold disabled:bg-gray-300 disabled:text-gray-500 cursor-pointer transition-colors shadow-sm">
                    {quarterLoading ? "Closing..." : "Close Current Quarter"}
                </button>
            </div>
            )}
        </div>
    );
}
