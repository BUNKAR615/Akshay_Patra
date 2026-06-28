"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../lib/clientApi";
import { PERMISSION_TREE, branchKey } from "../../../../lib/permissions";
import { Card, Btn, Toggle, SearchInput, Avatar, Badge, Alert, TInput, useToast } from "../../../../components/ui";

/**
 * User Management — ESSL-style expandable access tree.
 *
 * Master (left): searchable user list. Detail (right): the selected user's
 * access tree. Each top-level module has a +/− expander revealing its
 * sub-features (radio None/View/Edit for view-or-edit modules; independent
 * toggles for Branches & Pipeline). A bottom "Is Admin" master toggle grants
 * everything and disables the tree. Saving persists to UserPermission.
 *
 * Only ADMIN reaches this screen (route + page + middleware all gate it); the
 * extra `currentUser` check below is pure defence-in-depth.
 */
export default function UsersView({ currentUser }) {
    const toast = useToast();

    const [users, setUsers] = useState([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [search, setSearch] = useState("");
    // Default to showing only current operators (users who already hold admin-area
    // access) so the page opens on "who has access today". Toggle off to browse
    // every user when granting access to someone new.
    const [operatorsOnly, setOperatorsOnly] = useState(true);

    // Stable "people with special access" roster — fetched independently of the
    // master list's search/filter so the landing roster + stats never change as
    // the admin types in the search box.
    const [operators, setOperators] = useState([]);
    const [operatorsLoading, setOperatorsLoading] = useState(true);

    const [selectedId, setSelectedId] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Editable grant state for the selected user.
    const [grants, setGrants] = useState(() => new Set());
    const [isAdminGrant, setIsAdminGrant] = useState(false);
    const [operatorTitle, setOperatorTitle] = useState("");
    const [baseline, setBaseline] = useState({ isAdmin: false, keys: "", title: "" });
    const [expanded, setExpanded] = useState({});
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState(null); // { type, text }

    // Branches power the per-branch grant matrix (Branches module). Fetched once.
    const [branches, setBranches] = useState([]);
    useEffect(() => {
        api("/api/admin/branches").then((d) => setBranches(d.branches || [])).catch(() => {});
    }, []);

    const isAdminUser = currentUser?.role === "ADMIN" || currentUser?.isAdmin;

    // ── Master list ──
    const loadUsers = async (q = search, opOnly = operatorsOnly) => {
        setUsersLoading(true);
        try {
            const params = new URLSearchParams();
            if (q) params.set("search", q);
            if (opOnly) params.set("operators", "1");
            const qs = params.toString();
            const d = await api(`/api/admin/users${qs ? `?${qs}` : ""}`);
            setUsers(d.users || []);
        } catch (err) {
            console.error("[Users] list failed:", err);
            toast.error(err.message || "Failed to load users");
        }
        setUsersLoading(false);
    };

    useEffect(() => {
        loadUsers(search, operatorsOnly);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, operatorsOnly]);

    // Roster of everyone with special access (admin grant or any key), kept
    // separate from the filterable master list so it's a steady source of truth.
    const loadOperators = async () => {
        setOperatorsLoading(true);
        try {
            const d = await api(`/api/admin/users?operators=1`);
            setOperators(d.users || []);
        } catch (err) {
            console.error("[Users] operators failed:", err);
        }
        setOperatorsLoading(false);
    };
    useEffect(() => {
        loadOperators();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const adminGrantCount = useMemo(() => operators.filter((o) => o.isAdminGrant).length, [operators]);

    // ── Detail ──
    const selectUser = async (id) => {
        setSelectedId(id);
        setSaveMsg(null);
        setDetailLoading(true);
        try {
            const d = await api(`/api/admin/users/${id}/permissions`);
            const keys = d.permissions || [];
            const title = d.operatorTitle || "";
            setSelectedUser(d.user);
            setGrants(new Set(keys));
            setIsAdminGrant(!!d.isAdmin);
            setOperatorTitle(title);
            setBaseline({ isAdmin: !!d.isAdmin, keys: [...keys].sort().join(","), title });
            setExpanded({});
        } catch (err) {
            console.error("[Users] detail failed:", err);
            toast.error(err.message || "Failed to load permissions");
            setSelectedUser(null);
        }
        setDetailLoading(false);
    };

    // ── Grant mutations ──
    const radioValue = (m) => {
        if (grants.has(m.editKey)) return "edit";
        if (grants.has(m.viewKey)) return "view";
        return "none";
    };
    const setRadio = (m, val) => {
        const next = new Set(grants);
        next.delete(m.viewKey);
        next.delete(m.editKey);
        if (val === "view") next.add(m.viewKey);
        else if (val === "edit") next.add(m.editKey); // Edit implies View (lib/permissions IMPLIES)
        setGrants(next);
    };
    const toggleKey = (key) => {
        const next = new Set(grants);
        if (next.has(key)) next.delete(key); else next.add(key);
        setGrants(next);
    };
    const toggleExpand = (id) => setExpanded((p) => ({ ...p, [id]: !p[id] }));

    const dirty = useMemo(() => {
        const keys = [...grants].sort().join(",");
        return isAdminGrant !== baseline.isAdmin || keys !== baseline.keys || operatorTitle.trim() !== baseline.title;
    }, [grants, isAdminGrant, operatorTitle, baseline]);

    const save = async () => {
        if (!selectedId) return;
        setSaving(true);
        setSaveMsg(null);
        try {
            const body = { isAdmin: isAdminGrant, permissions: isAdminGrant ? [] : [...grants], operatorTitle: operatorTitle.trim() };
            const d = await api(`/api/admin/users/${selectedId}/permissions`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const keys = d.permissions || [];
            const title = d.operatorTitle || "";
            setGrants(new Set(keys));
            setIsAdminGrant(!!d.isAdmin);
            setOperatorTitle(title);
            setBaseline({ isAdmin: !!d.isAdmin, keys: [...keys].sort().join(","), title });
            setSaveMsg({ type: "success", text: "Access saved. Page-level changes apply on the user's next sign-in." });
            toast.success("Access saved");
            loadUsers(); // refresh Operator badges in the list
            loadOperators(); // refresh the special-access roster + stats
        } catch (err) {
            setSaveMsg({ type: "error", text: err.message || "Failed to save" });
        }
        setSaving(false);
    };

    if (!isAdminUser) {
        return <Alert type="error" message="Only administrators can manage user access." />;
    }


    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-xl font-bold text-ap-blue">User Management</h2>
                    <p className="text-sm text-gray-500">Grant individual users a slice of admin access. Admins always have full access.</p>
                </div>
                {/* At-a-glance stats for special access */}
                <div className="flex gap-2.5">
                    <div className="rounded-xl border border-ap-border bg-white px-4 py-2 text-center shadow-card">
                        <p className="m-0 text-[20px] font-extrabold leading-none text-ap-blue tabular-nums">{operatorsLoading ? "—" : operators.length}</p>
                        <p className="m-0 mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">Special access</p>
                    </div>
                    <div className="rounded-xl border border-ap-orange/30 bg-ap-orange-50/60 px-4 py-2 text-center shadow-card">
                        <p className="m-0 text-[20px] font-extrabold leading-none text-ap-orange tabular-nums">{operatorsLoading ? "—" : adminGrantCount}</p>
                        <p className="m-0 mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-500">Full admins</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
                {/* ── Master list ── */}
                <Card className="p-3 lg:sticky lg:top-4">
                    <SearchInput value={search} onChange={setSearch} placeholder="Search name or code…" ariaLabel="Search users" className="mb-2.5" />
                    <label className="flex items-center justify-between gap-2 mb-3 px-0.5 cursor-pointer">
                        <span className="text-[12px] font-semibold text-gray-600">
                            Operators only{operatorsOnly ? ` (${users.length})` : ""}
                        </span>
                        <Toggle on={operatorsOnly} onChange={setOperatorsOnly} label="Show operators only" />
                    </label>
                    <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1 space-y-1">
                        {usersLoading ? (
                            <p className="text-sm text-gray-400 py-6 text-center">Loading users…</p>
                        ) : users.length === 0 ? (
                            <p className="text-sm text-gray-400 py-6 text-center">{operatorsOnly ? "No operators yet" : "No users found"}</p>
                        ) : (
                            users.map((u) => {
                                const active = u.id === selectedId;
                                return (
                                    <button
                                        key={u.id}
                                        type="button"
                                        onClick={() => selectUser(u.id)}
                                        className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer border ${active ? "bg-ap-blue-50 border-ap-blue/30" : "bg-white border-transparent hover:bg-gray-50"}`}
                                    >
                                        <Avatar name={u.name} size={32} color={u.isAdminGrant ? "#F7941D" : undefined} />
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-[13px] font-bold text-gray-900 truncate">{u.name}</span>
                                            <span className="block text-[11px] text-gray-400 truncate">
                                                {u.empCode || "—"} · {u.role}
                                                {u.isOperator && !u.isAdminGrant && (u.modules?.length || u.grantCount)
                                                    ? ` · ${u.modules?.length ? `${u.modules.length} module${u.modules.length === 1 ? "" : "s"}` : `${u.grantCount} perm${u.grantCount === 1 ? "" : "s"}`}`
                                                    : ""}
                                            </span>
                                        </span>
                                        {u.isAdminGrant ? (
                                            <Badge label={u.operatorTitle || "Admin"} color="orange" />
                                        ) : u.isOperator ? (
                                            <Badge label={u.operatorTitle || "Operator"} color="blue" />
                                        ) : null}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </Card>

                {/* ── Detail panel ── */}
                <Card className="p-4 sm:p-5">
                    {!selectedId ? (
                        <AccessRoster
                            operators={operators}
                            loading={operatorsLoading}
                            onSelect={selectUser}
                            onBrowseAll={() => setOperatorsOnly(false)}
                        />
                    ) : detailLoading ? (
                        <p className="text-sm text-gray-400 py-10 text-center">Loading access…</p>
                    ) : !selectedUser ? (
                        <Alert type="error" message="Could not load this user's permissions." />
                    ) : (
                        <>
                            {/* User header */}
                            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-ap-border">
                                <Avatar name={selectedUser.name} size={42} />
                                <div className="min-w-0 flex-1">
                                    <p className="m-0 text-base font-extrabold text-gray-900 truncate">{selectedUser.name}</p>
                                    <p className="m-0 text-xs text-gray-400">{selectedUser.empCode || "—"} · {selectedUser.role}</p>
                                </div>
                                {operatorTitle.trim() && (
                                    <Badge label={operatorTitle.trim()} color={isAdminGrant ? "orange" : "blue"} />
                                )}
                            </div>

                            {/* Operator role name — the admin-given "page role" (e.g. HR Admin).
                                Additive: the user keeps their base role's pages and gains
                                whatever is granted below. */}
                            <div className="mb-4">
                                <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-1">Access role name</label>
                                <TInput value={operatorTitle} onChange={(e) => setOperatorTitle(e.target.value)} placeholder="e.g. HR Admin" />
                                <p className="text-[11px] text-gray-400 mt-1">
                                    Shown next to {selectedUser.name?.split(" ")[0] || "the user"} in this list. Their existing
                                    {selectedUser.role ? ` ${selectedUser.role.replace(/_/g, " ").toLowerCase()} ` : " "}
                                    access is kept — this only adds the pages you grant below.
                                </p>
                            </div>

                            {saveMsg && (
                                <div className="mb-4">
                                    <Alert type={saveMsg.type} message={saveMsg.text} onClose={() => setSaveMsg(null)} />
                                </div>
                            )}

                            {/* Access tree */}
                            <div className={`space-y-2 transition-opacity ${isAdminGrant ? "opacity-40 pointer-events-none select-none" : ""}`} aria-disabled={isAdminGrant}>
                                {PERMISSION_TREE.map((m) => (
                                    <ModuleRow
                                        key={m.id}
                                        module={m}
                                        expanded={!!expanded[m.id]}
                                        onToggleExpand={() => toggleExpand(m.id)}
                                        grants={grants}
                                        radioValue={radioValue}
                                        setRadio={setRadio}
                                        toggleKey={toggleKey}
                                        branches={branches}
                                    />
                                ))}
                            </div>

                            {/* Is Admin master override */}
                            <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-ap-orange/30 bg-ap-orange-50/60 px-3.5 py-3">
                                <div>
                                    <p className="m-0 text-[13px] font-bold text-gray-900">Is Admin</p>
                                    <p className="m-0 text-[11px] text-gray-500">Master override — grants full admin access and disables the tree above.</p>
                                </div>
                                <Toggle on={isAdminGrant} onChange={setIsAdminGrant} label="Is Admin" />
                            </div>

                            {/* Footer */}
                            <div className="mt-5 flex items-center justify-end gap-3">
                                {dirty && <span className="text-[12px] text-gray-400">Unsaved changes</span>}
                                <Btn onClick={save} loading={saving} disabled={!dirty}>Save access</Btn>
                            </div>
                        </>
                    )}
                </Card>
            </div>
        </div>
    );
}

/**
 * Landing roster — every user the admin has granted special access to, shown as
 * cards with their access role, what modules they can reach, and a click-to-
 * manage affordance. This is the page's answer to "who has special access?".
 */
function AccessRoster({ operators, loading, onSelect, onBrowseAll }) {
    if (loading) {
        return <p className="text-sm text-gray-400 py-16 text-center">Loading people with special access…</p>;
    }
    if (operators.length === 0) {
        return (
            <div className="py-16 text-center">
                <div className="text-4xl mb-2" aria-hidden="true">🔑</div>
                <p className="text-sm font-bold text-gray-700 mb-1">No one has special access yet</p>
                <p className="text-xs text-gray-400 mb-4">Grant a user a slice of admin access and they’ll appear here.</p>
                <Btn variant="ghost" size="sm" onClick={onBrowseAll}>Browse all users</Btn>
            </div>
        );
    }
    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <div>
                    <p className="m-0 text-base font-extrabold text-gray-900">People with special access</p>
                    <p className="m-0 text-xs text-gray-400">{operators.length} {operators.length === 1 ? "person has" : "people have"} been granted admin-area access. Select anyone to manage it.</p>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {operators.map((u) => (
                    <button
                        key={u.id}
                        type="button"
                        onClick={() => onSelect(u.id)}
                        className="text-left rounded-xl border border-ap-border bg-white p-3 hover:border-ap-blue/40 hover:shadow-card-hover transition-all cursor-pointer flex flex-col gap-2"
                    >
                        <div className="flex items-center gap-2.5 min-w-0">
                            <Avatar name={u.name} size={36} color={u.isAdminGrant ? "#F7941D" : undefined} />
                            <div className="min-w-0 flex-1">
                                <p className="m-0 text-[13px] font-bold text-gray-900 truncate">{u.name}</p>
                                <p className="m-0 text-[11px] text-gray-400 truncate">{u.empCode || "—"} · {u.role}</p>
                            </div>
                            <Badge label={u.operatorTitle || (u.isAdminGrant ? "Full admin" : "Operator")} color={u.isAdminGrant ? "orange" : "blue"} />
                        </div>
                        {/* What they can reach */}
                        <div className="flex flex-wrap gap-1">
                            {u.isAdminGrant ? (
                                <span className="text-[10px] font-bold text-ap-orange bg-ap-orange-50 border border-ap-orange/20 rounded-full px-2 py-0.5">Full admin access</span>
                            ) : (u.modules || []).length === 0 ? (
                                <span className="text-[10px] text-gray-400">{u.grantCount} permission{u.grantCount === 1 ? "" : "s"}</span>
                            ) : (
                                (u.modules || []).map((mod) => (
                                    <span key={mod} className="text-[10px] font-semibold text-gray-600 bg-gray-100 border border-ap-border rounded-full px-2 py-0.5">{mod}</span>
                                ))
                            )}
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}

/** One top-level module row with a +/− expander and its sub-features. */
function ModuleRow({ module: m, expanded, onToggleExpand, grants, radioValue, setRadio, toggleKey, branches }) {
    const summary = moduleSummary(m, grants, radioValue, branches);
    return (
        <div className="border border-ap-border rounded-lg overflow-hidden">
            <button
                type="button"
                onClick={onToggleExpand}
                aria-expanded={expanded}
                className="w-full flex items-center justify-between gap-3 px-3 py-2.5 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
            >
                <span className="flex items-center gap-2.5 min-w-0">
                    <span
                        aria-hidden="true"
                        className="w-[18px] h-[18px] shrink-0 rounded border border-gray-300 flex items-center justify-center text-sm font-bold leading-none text-ap-blue bg-white"
                    >
                        {expanded ? "−" : "+"}
                    </span>
                    <span className="text-[13px] font-bold text-gray-900 truncate">{m.label}</span>
                </span>
                <span className="text-[11px] text-gray-400 shrink-0">{summary}</span>
            </button>

            {expanded && (
                <div className="px-3 pb-3 pt-1 border-t border-ap-border bg-gray-50/40">
                    {m.hint && <p className="text-[11px] text-gray-400 mb-2 mt-1">{m.hint}</p>}
                    {m.kind === "radio" ? (
                        <RadioControl value={radioValue(m)} onChange={(v) => setRadio(m, v)} />
                    ) : m.kind === "branchMatrix" ? (
                        <BranchMatrix module={m} branches={branches} grants={grants} toggleKey={toggleKey} />
                    ) : (
                        <div className="space-y-0.5">
                            {m.options.map((opt) => (
                                <label key={opt.key} className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
                                    <span className="text-[13px] text-gray-700">{opt.label}</span>
                                    <Toggle on={grants.has(opt.key)} onChange={() => toggleKey(opt.key)} label={opt.label} />
                                </label>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

/** None / View / Edit segmented control (mutually exclusive; Edit implies View). */
function RadioControl({ value, onChange }) {
    const opts = [
        { v: "none", label: "None" },
        { v: "view", label: "View" },
        { v: "edit", label: "Edit" },
    ];
    return (
        <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden bg-white">
            {opts.map((o, i) => {
                const active = value === o.v;
                return (
                    <button
                        key={o.v}
                        type="button"
                        onClick={() => onChange(o.v)}
                        aria-pressed={active}
                        className={`px-4 py-1.5 text-[12px] font-bold cursor-pointer transition-colors ${i > 0 ? "border-l border-gray-300" : ""} ${active ? "bg-ap-blue text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}

/** Short right-aligned summary of a module's current grant state. */
function moduleSummary(m, grants, radioValue, branches = []) {
    if (m.kind === "radio") {
        const v = radioValue(m);
        return v === "none" ? "None" : v === "view" ? "View" : "Edit";
    }
    if (m.kind === "branchMatrix") {
        let n = 0;
        for (const b of branches) for (const f of m.features) if (grants.has(branchKey(b.id, f.feature))) n++;
        for (const opt of m.globalOptions) if (grants.has(opt.key)) n++;
        return n === 0 ? "None" : `${n} selected`;
    }
    const n = m.options.filter((o) => grants.has(o.key)).length;
    return n === 0 ? "None" : `${n} selected`;
}

/**
 * Per-branch grant matrix: one row per branch with a toggle for each feature
 * (keys `branch:<id>:<feature>`), plus the global Add/Delete-branch toggles.
 */
function BranchMatrix({ module: m, branches, grants, toggleKey }) {
    return (
        <div className="space-y-3">
            {/* Global branch actions */}
            <div className="space-y-0.5">
                {m.globalOptions.map((opt) => (
                    <label key={opt.key} className="flex items-center justify-between gap-3 py-1.5 cursor-pointer">
                        <span className="text-[13px] text-gray-700">{opt.label}</span>
                        <Toggle on={grants.has(opt.key)} onChange={() => toggleKey(opt.key)} label={opt.label} />
                    </label>
                ))}
            </div>

            {/* Per-branch feature matrix */}
            {branches.length === 0 ? (
                <p className="text-[12px] text-gray-400 py-1">No branches found.</p>
            ) : (
                <div className="space-y-2">
                    {branches.map((b) => {
                        const onCount = m.features.filter((f) => grants.has(branchKey(b.id, f.feature))).length;
                        return (
                            <div key={b.id} className="rounded-lg border border-ap-border bg-white p-2.5">
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[12px] font-bold text-ap-blue truncate">{b.name}</span>
                                    <span className="text-[10px] text-gray-400 shrink-0">{onCount === 0 ? "No access" : `${onCount}/${m.features.length}`}</span>
                                </div>
                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                    {m.features.map((f) => {
                                        const key = branchKey(b.id, f.feature);
                                        return (
                                            <label key={f.feature} className="flex items-center gap-2 py-1 cursor-pointer">
                                                <Toggle on={grants.has(key)} onChange={() => toggleKey(key)} label={`${b.name} ${f.label}`} />
                                                <span className="text-[12px] text-gray-700">{f.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
