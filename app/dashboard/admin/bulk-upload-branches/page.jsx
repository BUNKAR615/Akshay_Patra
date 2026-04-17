"use client";

import { useState } from "react";

/**
 * Admin UI for POST /api/admin/branches/bulk-upload — the branch-bootstrap
 * importer. Distinct from /api/admin/employees/bulk-upload (which adds
 * employees to an existing org and is already wired from the main admin page).
 *
 * Expected Excel columns (case-insensitive, see the API route for detail):
 *   role, empCode, name, department, branch, branchType, collar, designation, mobile, password
 */
export default function BulkUploadBranchesPage() {
    const [file, setFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState(null);
    const [result, setResult] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) {
            setMsg({ type: "error", text: "Pick an Excel file first." });
            return;
        }
        setSubmitting(true);
        setMsg(null);
        setResult(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/admin/branches/bulk-upload", {
                method: "POST",
                body: fd,
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.message || "Upload failed");
            }
            setResult(json.data);
            setMsg({ type: "success", text: "Upload processed." });
        } catch (err) {
            setMsg({ type: "error", text: err.message || "Upload failed" });
        }
        setSubmitting(false);
    };

    return (
        <div className="max-w-2xl mx-auto p-6 space-y-4">
            <h1 className="text-xl font-bold text-[#003087]">Bulk upload — branches & people</h1>
            <p className="text-sm text-[#666]">
                Uploads a single Excel sheet that bootstraps branches, cluster managers, branch managers, departments,
                and employees in one transaction. For adding employees to an existing branch, use the main admin
                dashboard's bulk-upload instead.
            </p>

            <div className="bg-[#F5F5F5] border border-[#E0E0E0] rounded-lg p-3 text-xs text-[#555]">
                <div className="font-bold mb-1">Required columns (case-insensitive)</div>
                <code className="block whitespace-pre-wrap">
                    role, empCode, name, department, branch, branchType, collar, designation, mobile, password
                </code>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
                <input
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="block text-sm"
                />
                <button
                    type="submit"
                    disabled={submitting || !file}
                    className="px-4 py-2 bg-[#F57C00] text-white rounded-lg text-sm font-bold disabled:opacity-50"
                >
                    {submitting ? "Uploading…" : "Upload"}
                </button>
            </form>

            {msg && (
                <div className={`p-3 rounded-lg text-sm ${msg.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {msg.text}
                </div>
            )}

            {result && (
                <pre className="p-3 bg-white border border-[#E0E0E0] rounded-lg text-xs overflow-auto">
                    {JSON.stringify(result, null, 2)}
                </pre>
            )}
        </div>
    );
}
