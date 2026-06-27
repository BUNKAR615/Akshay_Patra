"use client";

import { useEffect, useState } from "react";
import { api } from "../../../../lib/clientApi";
import { branchKey, BRANCH_FEATURES } from "../../../../lib/permissions";
import ConfirmDialog from "../../../../components/ConfirmDialog";

/**
 * Branch management tab. The branches list itself lives in page.js (it also
 * feeds the toolbar scope selector and the pipeline export) — this view gets
 * it via props and triggers a refetch on mount, same as the old tab-entry fetch.
 */
export default function BranchesView({ branches, branchLoading, refetchBranches, onOpenBranch, can = () => true }) {
    const [branchMsg, setBranchMsg] = useState({ type: "", text: "" });
    const [newBranch, setNewBranch] = useState({ name: "", location: "", branchType: "SMALL" });
    const [editBranch, setEditBranch] = useState(null);

    // Branch sheet import (full replacement)
    const [importFile, setImportFile] = useState(null);
    const [importBranchName, setImportBranchName] = useState("");
    const [importLoading, setImportLoading] = useState(false);
    const [importResult, setImportResult] = useState(null);
    const [importMsg, setImportMsg] = useState({ type: "", text: "" });
    const [confirmImport, setConfirmImport] = useState(false);

    useEffect(() => { refetchBranches(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    const handleCreateBranch = async () => {
        setBranchMsg({ type: "", text: "" });
        try {
            await api("/api/admin/branches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newBranch) });
            setBranchMsg({ type: "success", text: "Branch created" });
            setNewBranch({ name: "", location: "", branchType: "SMALL" });
            refetchBranches();
        } catch (e) { setBranchMsg({ type: "error", text: e.message }); }
    };

    const handleUpdateBranch = async (id, updates) => {
        try {
            await api("/api/admin/branches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...updates }) });
            setBranchMsg({ type: "success", text: "Branch updated" });
            setEditBranch(null);
            refetchBranches();
        } catch (e) { setBranchMsg({ type: "error", text: e.message }); }
    };

    const runBranchImport = async () => {
        setConfirmImport(false);
        setImportLoading(true);
        setImportMsg({ type: "", text: "" });
        setImportResult(null);
        try {
            const fd = new FormData();
            fd.append("file", importFile);
            if (importBranchName) fd.append("branchName", importBranchName);
            const res = await fetch("/api/admin/branches/import", { method: "POST", body: fd });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.message || "Import failed");
            setImportResult(json.data);
            const b = json.data.branches || [];
            setImportMsg({
                type: "success",
                text: `Imported ${b.length} branch(es): ${b.reduce((s, x) => s + x.employeesImported, 0)} employees, ${b.reduce((s, x) => s + x.archivedEmployees.length, 0)} archived.`,
            });
            setImportFile(null);
            setImportBranchName("");
            refetchBranches();
        } catch (err) {
            setImportMsg({ type: "error", text: err.message || "Import failed" });
        }
        setImportLoading(false);
    };

    return (
        <div className="space-y-6">
            <h2 className="text-xl font-bold text-ap-blue">Branch Management</h2>
            {branchMsg.text && <div className={`p-3 rounded-lg text-sm font-medium ${branchMsg.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{branchMsg.text}</div>}

            {/* Add Branch */}
            {can("branches.add") && (
            <div className="bg-white border border-ap-border rounded-card p-4 space-y-3 shadow-card">
                <h3 className="font-bold text-ap-blue">Add New Branch</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <input value={newBranch.name} onChange={e => setNewBranch(p => ({ ...p, name: e.target.value }))} placeholder="Branch Name" className="border rounded-lg px-3 py-2 text-sm" />
                    <input value={newBranch.location} onChange={e => setNewBranch(p => ({ ...p, location: e.target.value }))} placeholder="Location" className="border rounded-lg px-3 py-2 text-sm" />
                    <select value={newBranch.branchType} onChange={e => setNewBranch(p => ({ ...p, branchType: e.target.value }))} className="border rounded-lg px-3 py-2 text-sm">
                        <option value="SMALL">Small Branch</option>
                        <option value="BIG">Big Branch</option>
                    </select>
                    <button onClick={handleCreateBranch} className="bg-ap-blue text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-ap-blue-700 cursor-pointer">Create Branch</button>
                </div>
            </div>
            )}

            {/* Replace Branch Data — full sheet import */}
            {can("branches.add") && (
            <div className="bg-white border border-[#EF9A9A] rounded-card p-4 space-y-3">
                <h3 className="font-bold text-[#D32F2F]">Replace Branch Data (Import Sheet)</h3>
                <p className="text-xs text-gray-500">
                    Uploads an employee Excel workbook and <strong>completely replaces</strong> all
                    employees and departments for each branch it covers. Old employees not in the
                    sheet are archived; old departments are removed. Multi-branch files (with a
                    Location column) are split automatically — leave the branch blank. For a
                    single-branch file (e.g. the Jaipur department-tab file) select the target branch.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null); setImportMsg({ type: "", text: "" }); }}
                        className="border rounded-lg px-3 py-2 text-sm"
                    />
                    <select
                        value={importBranchName}
                        onChange={(e) => setImportBranchName(e.target.value)}
                        className="border rounded-lg px-3 py-2 text-sm"
                    >
                        <option value="">Branch from file (multi-branch)</option>
                        {branches.map((b) => (
                            <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                    </select>
                    <button
                        onClick={() => setConfirmImport(true)}
                        disabled={!importFile || importLoading}
                        className="bg-[#D32F2F] text-white rounded-lg px-4 py-2 text-sm font-bold hover:bg-[#B71C1C] disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {importLoading ? "Importing…" : "Replace Branch Data"}
                    </button>
                </div>
                {importMsg.text && (
                    <div className={`p-3 rounded-lg text-sm font-medium ${importMsg.type === "error" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{importMsg.text}</div>
                )}
                {importResult && (
                    <div className="border border-ap-border rounded-lg overflow-hidden">
                        <div className="overflow-x-auto">
                        <table className="w-full text-xs min-w-[460px]">
                            <thead className="bg-gray-50 text-gray-700">
                                <tr>
                                    <th className="text-left px-3 py-2 font-bold">Branch</th>
                                    <th className="text-right px-3 py-2 font-bold">Employees Imported</th>
                                    <th className="text-right px-3 py-2 font-bold">Departments</th>
                                    <th className="text-right px-3 py-2 font-bold">Archived (replaced)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {importResult.branches.map((b) => (
                                    <tr key={b.branch.id} className="border-t border-ap-border">
                                        <td className="px-3 py-2 font-bold text-ap-blue">{b.branch.name}{b.branchCreated ? " (new)" : ""}</td>
                                        <td className="px-3 py-2 text-right">{b.employeesImported}</td>
                                        <td className="px-3 py-2 text-right">{b.departmentsCreated.length}</td>
                                        <td className="px-3 py-2 text-right">{b.archivedEmployees.length}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                        {(importResult.errors?.length > 0 || importResult.skipped?.length > 0) && (
                            <div className="px-3 py-2 text-[11px] text-gray-500 bg-gray-50 border-t border-ap-border">
                                {importResult.skipped?.length || 0} row(s) skipped, {importResult.errors?.length || 0} error(s), {importResult.duplicatesInFile || 0} duplicate(s) in file.
                            </div>
                        )}
                    </div>
                )}
            </div>
            )}

            {/* Branch List — operators see only branches they hold any access to. */}
            {branchLoading ? <div className="text-center py-8 text-gray-500">Loading...</div> : (
                <div className="grid gap-4">
                    {branches.filter(b => BRANCH_FEATURES.some(f => can(branchKey(b.id, f)))).map(branch => (
                        <div
                            key={branch.id}
                            onClick={() => onOpenBranch(branch.slug || branch.id)}
                            className="bg-white border border-ap-border rounded-card p-4 hover:shadow-card-hover hover:border-ap-blue transition-all cursor-pointer"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-3 h-3 rounded-full ${branch.branchType === "BIG" ? "bg-orange-500" : "bg-green-500"}`} />
                                    <div>
                                        <h4 className="font-bold text-ap-blue">{branch.name}</h4>
                                        <p className="text-xs text-gray-500">{branch.location} &bull; {branch.branchType} branch &bull; {branch._count?.departments || 0} departments</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                    <span className={`px-2 py-1 rounded text-xs font-bold ${branch.branchType === "BIG" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>{branch.branchType}</span>
                                    {!can("branches.add") ? null : editBranch?.id === branch.id ? (
                                        <div className="flex items-center gap-2">
                                            <select value={editBranch.branchType} onChange={e => setEditBranch(p => ({ ...p, branchType: e.target.value }))} className="border rounded px-2 py-1 text-xs">
                                                <option value="SMALL">Small</option>
                                                <option value="BIG">Big</option>
                                            </select>
                                            <button onClick={() => handleUpdateBranch(branch.id, { branchType: editBranch.branchType })} className="text-xs px-2 py-1 bg-blue-600 text-white rounded cursor-pointer">Save</button>
                                            <button onClick={() => setEditBranch(null)} className="text-xs px-2 py-1 bg-gray-300 rounded cursor-pointer">Cancel</button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setEditBranch({ id: branch.id, branchType: branch.branchType })} className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded cursor-pointer">Edit Type</button>
                                    )}
                                </div>
                            </div>
                            {branch.departments?.length > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {branch.departments.map(d => (
                                        <span key={d.id} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] rounded-full font-medium">{d.name}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <ConfirmDialog
                open={confirmImport}
                title="Replace Branch Data?"
                message={`This will REPLACE all employees and departments for ${importBranchName ? `the "${importBranchName}" branch` : "every branch in the uploaded file"}.\n\n✓ The sheet becomes the source of truth\n✓ Employees not in the sheet are archived and removed\n✓ Departments not in the sheet are deleted\n✓ A branch named in the sheet but missing is created\n\nThis cannot be undone.`}
                confirmLabel="Yes, Replace Data"
                variant="danger"
                loading={importLoading}
                onConfirm={runBranchImport}
                onCancel={() => setConfirmImport(false)}
            />
        </div>
    );
}
