"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import DashboardShell from "../../../components/DashboardShell";
import ConfirmDialog from "../../../components/ConfirmDialog";
import { SkeletonCard, SkeletonStats } from "../../../components/Skeleton";
import UserProfileCard from "../../../components/UserProfileCard";
import { api } from "../../../lib/clientApi";
import { getAutoQuarterName } from "../../../lib/quarterUtils";
import { NAV, DASHBOARD_HOME } from "../../../lib/dashboardNav";
import { canAccessView, firstAllowedView } from "../../../lib/permissions";

// Each ?view= tab is its own lazily-loaded chunk — switching tabs only ever
// downloads the code for the tab being opened.
const viewLoading = () => <SkeletonCard lines={4} />;
const DashboardView = dynamic(() => import("./views/DashboardView"), { ssr: false, loading: viewLoading });
const PipelineView = dynamic(() => import("./views/PipelineView"), { ssr: false, loading: viewLoading });
const BranchesView = dynamic(() => import("./views/BranchesView"), { ssr: false, loading: viewLoading });
const OrgView = dynamic(() => import("./views/OrgView"), { ssr: false, loading: viewLoading });
const QuarterView = dynamic(() => import("./views/QuarterView"), { ssr: false, loading: viewLoading });
const QuestionsView = dynamic(() => import("./views/QuestionsView"), { ssr: false, loading: viewLoading });
const EmployeesView = dynamic(() => import("./views/EmployeesView"), { ssr: false, loading: viewLoading });
const LogsView = dynamic(() => import("./views/LogsView"), { ssr: false, loading: viewLoading });
const ReportsPanel = dynamic(() => import("../../../components/admin/ReportsPanel"), { ssr: false, loading: viewLoading });
const UsersView = dynamic(() => import("./views/UsersView"), { ssr: false, loading: viewLoading });

// Share payload — drops staff on the LOGIN page with the active quarter named.
function buildAdminSharePayload(quarter) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = origin ? `${origin}/login` : "/login";
    const quarterName = quarter?.name ? quarter.name : "the current quarter";
    return {
        title: "Akshaya Patra — Evaluation Portal",
        text: `The ${quarterName} quarter has started. Please complete your evaluation.`,
        url,
    };
}

export default function AdminDashboard() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const viewParam = searchParams.get("view");
    const [user, setUser] = useState(null);
    const [tab, setTabState] = useState(viewParam || "dashboard");
    const [loading, setLoading] = useState(true);

    // Sidebar drives tab via ?view= query param; keep URL in sync when user
    // triggers setTab. We push (not replace) so each view becomes a real history
    // entry — the browser Back button and the topbar breadcrumb both walk back
    // naturally, which is why the old hand-rolled in-app "Back" button is gone.
    const setTab = (id) => {
        setTabState(id);
        const params = new URLSearchParams(Array.from(searchParams.entries()));
        if (id === "dashboard") params.delete("view"); else params.set("view", id);
        const qs = params.toString();
        router.push(`/dashboard/admin${qs ? `?${qs}` : ""}`, { scroll: false });
    };

    // React to URL changes from sidebar clicks.
    useEffect(() => {
        const next = viewParam || "dashboard";
        if (next !== tab) setTabState(next);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [viewParam]);

    // Permission gate: once the user is known, an operator (granted non-admin)
    // who lands on a tab they aren't allowed to open is redirected — to their
    // first granted view, or to their own dashboard if they hold none. ADMIN is
    // all-access so this is a no-op for them. Defence-in-depth: the sidebar
    // already hides the entry and the APIs/middleware still 403.
    useEffect(() => {
        if (!user) return;
        const ctx = { role: user.role, isAdmin: user.isAdmin, permissions: user.permissions };
        if (canAccessView(tab, ctx)) return;
        const dest = firstAllowedView(NAV.ADMIN, ctx);
        if (dest) {
            const qs = dest === "dashboard" ? "" : `?view=${dest}`;
            router.replace(`/dashboard/admin${qs}`, { scroll: false });
        } else {
            router.replace(DASHBOARD_HOME[user.role] || "/login");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, tab]);

    // Confirm dialog for quarter start/close (shared by dashboard + quarter tabs).
    const [confirm, setConfirm] = useState({ open: false, type: null });

    // Quarter archive — list of every quarter + the one currently being viewed.
    const [quarters, setQuarters] = useState([]);
    const [activeQuarterId, setActiveQuarterId] = useState(null);
    const [selectedQuarterId, setSelectedQuarterId] = useState(null);

    // Quarter progress (shared by dashboard / pipeline / quarter tabs).
    const [quarterProgress, setQuarterProgress] = useState(null);
    const [progressLoading, setProgressLoading] = useState(true);

    // Quarter start/close action state.
    const [quarterMsg, setQuarterMsg] = useState({ type: "", text: "" });
    const [quarterLoading, setQuarterLoading] = useState(false);

    // Branches — also feeds the toolbar scope selector and pipeline export.
    const [branches, setBranches] = useState([]);
    const [branchLoading, setBranchLoading] = useState(false);

    // Cross-tab caches (fetched once per session, same as before the split).
    const [orgStructure, setOrgStructure] = useState([]);
    const [orgLoading, setOrgLoading] = useState(false);
    const [questions, setQuestions] = useState([]);

    // Org tab → Employees tab "Add Employee" hand-off.
    const [pendingAddDept, setPendingAddDept] = useState(null);

    // Share menu
    const [shareMenuOpen, setShareMenuOpen] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const d = await api("/api/auth/me");
                setUser(d.user);
                setLoading(false);
            } catch (err) {
                console.error("[Admin] Auth fetch failed:", err);
                // Auth could not be established — send the user to re-login
                // rather than rendering a broken shell.
                if (typeof window !== "undefined") window.location.replace("/login");
            }
        })();
    }, []);

    const fetchQuarters = async () => {
        try {
            const d = await api("/api/admin/quarters/list");
            setQuarters(d.quarters || []);
            setActiveQuarterId(d.activeQuarterId || null);
            // First load only — don't clobber a user-picked archived quarter.
            setSelectedQuarterId((prev) => prev || d.activeQuarterId || d.quarters?.[0]?.id || null);
        } catch {
            setQuarters([]);
            setActiveQuarterId(null);
        }
    };

    const fetchProgress = async (quarterId) => {
        setProgressLoading(true);
        try {
            const qs = quarterId ? `?quarterId=${encodeURIComponent(quarterId)}` : "";
            const d = await api(`/api/admin/quarter-progress${qs}`);
            setQuarterProgress(d);
        } catch {
            setQuarterProgress(null);
        }
        setProgressLoading(false);
    };

    const fetchBranches = async () => {
        setBranchLoading(true);
        try { const data = await api("/api/admin/branches"); setBranches(data.branches || []); }
        catch (e) { console.error("[Admin] fetchBranches failed:", e); }
        finally { setBranchLoading(false); }
    };

    const fetchOrg = async () => {
        setOrgLoading(true);
        try {
            const d = await api("/api/admin/departments/all-assignments");
            setOrgStructure(d.departments);
        } catch (err) { console.error("[Admin] fetchOrg failed:", err); }
        setOrgLoading(false);
    };

    const fetchQuestions = async () => {
        try {
            const d = await api("/api/admin/questions");
            setQuestions(d.questions);
        } catch (err) { console.error("[Admin] fetchQuestions failed:", err); }
    };

    // Always load branches on mount so the Global/Branch dropdown is populated.
    useEffect(() => { fetchBranches(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    // Lazily seed shared caches when a tab that needs them opens.
    useEffect(() => {
        if ((tab === "dashboard" || tab === "pipeline" || tab === "quarter") && quarters.length === 0) {
            fetchQuarters();
        }
        if (tab === "org" && orgStructure.length === 0) fetchOrg();
        if (tab === "questions" && questions.length === 0) fetchQuestions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab]);

    // Re-fetch progress whenever a quarter-dependent tab is visible and the
    // selected quarter changes (including first resolution from the list).
    useEffect(() => {
        if (!selectedQuarterId) return;
        if (tab === "dashboard" || tab === "pipeline" || tab === "quarter") {
            fetchProgress(selectedQuarterId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, selectedQuarterId]);

    // ── Quarter actions (invoked from DashboardView / QuarterView via props) ──
    const requestStartQuarter = (payload) => {
        setQuarterMsg({ type: "", text: "" });
        setConfirm({ open: true, type: "start", autoMode: false, payload });
    };
    const requestStartQuarterAuto = () => {
        setConfirm({ open: true, type: "start", autoMode: true });
    };
    const requestCloseQuarter = () => {
        setConfirm({ open: true, type: "close" });
    };

    const startQuarter = async () => {
        const isAuto = confirm.autoMode;
        const payload = confirm.payload;
        setConfirm({ open: false, type: null });
        setQuarterLoading(true); setQuarterMsg({ type: "", text: "" });
        try {
            let body;
            if (isAuto) {
                const now = new Date();
                const month = now.getMonth();
                const year = now.getFullYear();
                const qNum = month < 3 ? 4 : month < 6 ? 1 : month < 9 ? 2 : 3;
                const fyYear = qNum >= 1 && qNum <= 3 ? year : year - 1;
                body = {
                    quarterName: `Q${qNum}-${fyYear}`,
                    dateRange: {
                        startDate: now.toISOString().split('T')[0],
                        endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                    },
                    questionCount: 15,
                    questionSelectionMode: "AUTO"
                };
            } else {
                body = {
                    quarterName: payload.quarterName,
                    dateRange: { startDate: payload.startDate, endDate: payload.endDate },
                    questionCount: payload.questionCount,
                    questionSelectionMode: payload.quarterMode
                };
            }
            const d = await api("/api/admin/quarters/start", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            setQuarterMsg({ type: "success", text: d.message });
            setQuarterProgress(null);
            // Snap selection to the new active quarter and re-load the list.
            setSelectedQuarterId(null);
            await fetchQuarters();
        } catch (e) { setQuarterMsg({ type: "error", text: e.message }); }
        setQuarterLoading(false);
    };

    const closeQuarter = async () => {
        setConfirm({ open: false, type: null });
        setQuarterLoading(true); setQuarterMsg({ type: "", text: "" });
        try {
            const d = await api("/api/admin/quarters/close", { method: "POST" });
            setQuarterMsg({ type: "success", text: d.message });
            setQuarterProgress(null);
            // Keep selectedQuarterId pointing at the just-closed quarter so the
            // admin can see the archived view immediately.
            await fetchQuarters();
        } catch (e) { setQuarterMsg({ type: "error", text: e.message }); }
        setQuarterLoading(false);
    };

    // ── Share ──
    const openShareFallback = () => {
        setShareCopied(false);
        setShareMenuOpen(true);
    };

    const handleShare = async () => {
        const payload = buildAdminSharePayload(quarterProgress?.quarter);
        setShareCopied(false);

        if (typeof navigator !== "undefined" && navigator.share && payload.url) {
            try {
                await navigator.share(payload);
                setShareMenuOpen(false);
                return;
            } catch (err) {
                if (err?.name === "AbortError") return;
            }
        }

        openShareFallback();
    };

    const copyShareLink = async () => {
        const payload = buildAdminSharePayload(quarterProgress?.quarter);
        if (!payload.url) return;
        try {
            await navigator.clipboard.writeText(payload.url);
            setShareCopied(true);
        } catch {
            window.prompt("Copy this admin dashboard link", payload.url);
        }
    };

    const sharePayload = buildAdminSharePayload(quarterProgress?.quarter);
    const encodedShareText = encodeURIComponent(`${sharePayload.text}\n${sharePayload.url}`);
    const encodedShareSubject = encodeURIComponent(sharePayload.title);
    const encodedShareBody = encodeURIComponent(`${sharePayload.text}\n\n${sharePayload.url}`);

    if (loading) {
        return <DashboardShell user={user} title={user?.operatorTitle || "HR Admin"}><div className="space-y-4"><SkeletonStats count={4} /><SkeletonCard lines={4} /><SkeletonCard lines={3} /></div></DashboardShell>;
    }

    return (
        <DashboardShell user={user} title={user?.operatorTitle || "HR Admin"}>
            {/* Profile + scope/share toolbar live only on the command-center
                (dashboard) view. Sub-views have their own headers + breadcrumbs,
                so repeating these on every tab was pure clutter; the old in-app
                "Back" button is gone now that tab nav uses router.push (browser
                back + the topbar breadcrumb both walk back naturally). */}
            {tab === "dashboard" && (
            <>
            <UserProfileCard user={user} roles={user?.departmentRoles?.map(dr => dr.role)} />

            {/* Branch scope selector + share portal link */}
            <div className="mb-5 bg-white border border-ap-border rounded-card shadow-card px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3 flex-wrap">
                <span className="hidden sm:flex w-9 h-9 rounded-lg bg-ap-blue-50 text-ap-blue items-center justify-center shrink-0" aria-hidden="true">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                </span>
                <div className="min-w-0">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">Viewing</label>
                    <select
                        value=""
                        onChange={(e) => { if (e.target.value) router.push(`/dashboard/admin/${e.target.value}`); }}
                        className="border border-ap-border rounded-lg px-3 py-1.5 text-sm font-semibold text-ap-blue bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-ap-blue/20 max-w-full"
                    >
                        <option value="">Global — all branches</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.slug}>{b.name}{b.location ? ` — ${b.location}` : ""}</option>
                        ))}
                    </select>
                </div>
                <div className="relative ml-auto">
                    <button
                        type="button"
                        onClick={handleShare}
                        aria-haspopup="menu"
                        aria-expanded={shareMenuOpen}
                        className="min-h-[40px] px-3 py-2 bg-white border border-gray-300 rounded-lg text-ap-blue font-bold text-sm hover:bg-gray-50 transition-colors cursor-pointer inline-flex items-center gap-2"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.59 13.51l6.83 3.98M15.41 6.51 8.59 10.49M21 5a3 3 0 11-6 0 3 3 0 016 0zM9 12a3 3 0 11-6 0 3 3 0 016 0zm12 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Share
                    </button>
                    {shareMenuOpen && (
                        <div role="menu" className="absolute left-0 sm:left-auto sm:right-0 z-30 mt-2 w-64 rounded-xl border border-ap-border bg-white p-2 shadow-pop">
                            <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">Share admin link</p>
                            <a role="menuitem" href={`https://wa.me/?text=${encodedShareText}`} target="_blank" rel="noopener noreferrer" className="block rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-[#E8F5E9]">WhatsApp</a>
                            <a role="menuitem" href={`https://mail.google.com/mail/?view=cm&fs=1&su=${encodedShareSubject}&body=${encodedShareBody}`} target="_blank" rel="noopener noreferrer" className="block rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-ap-blue-50">Gmail</a>
                            <a role="menuitem" href={`mailto:?subject=${encodedShareSubject}&body=${encodedShareBody}`} className="block rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50">Email app</a>
                            <button type="button" role="menuitem" onClick={copyShareLink} className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-[#FFF8E1] cursor-pointer">{shareCopied ? "Link copied" : "Copy link"}</button>
                            <button type="button" onClick={() => setShareMenuOpen(false)} className="mt-1 w-full rounded-lg px-3 py-2 text-sm font-bold text-gray-500 hover:bg-gray-50 cursor-pointer">Close</button>
                        </div>
                    )}
                </div>
            </div>
            </>
            )}

            {/* ═══════ Lazily-loaded tab views ═══════ */}
            {tab === "dashboard" && (
                <DashboardView
                    quarterProgress={quarterProgress}
                    progressLoading={progressLoading}
                    quarters={quarters}
                    selectedQuarterId={selectedQuarterId}
                    setSelectedQuarterId={setSelectedQuarterId}
                    activeQuarterId={activeQuarterId}
                    quarterLoading={quarterLoading}
                    quarterMsg={quarterMsg}
                    onRequestClose={requestCloseQuarter}
                    onRequestStartAuto={requestStartQuarterAuto}
                    onRefresh={fetchProgress}
                    onNavigate={setTab}
                />
            )}
            {tab === "reports" && <ReportsPanel />}
            {tab === "pipeline" && (
                <PipelineView
                    quarterProgress={quarterProgress}
                    progressLoading={progressLoading}
                    branches={branches}
                    selectedQuarterId={selectedQuarterId}
                />
            )}
            {tab === "branches" && (
                <BranchesView
                    branches={branches}
                    branchLoading={branchLoading}
                    refetchBranches={fetchBranches}
                    onOpenBranch={(slug) => router.push(`/dashboard/admin/${slug}`)}
                />
            )}
            {tab === "org" && (
                <OrgView
                    orgStructure={orgStructure}
                    orgLoading={orgLoading}
                    fetchOrg={fetchOrg}
                    onRequestAddEmployee={(deptName) => { setPendingAddDept(deptName); setTab("employees"); }}
                />
            )}
            {tab === "quarter" && (
                <QuarterView
                    quarterProgress={quarterProgress}
                    quarterMsg={quarterMsg}
                    quarterLoading={quarterLoading}
                    onRequestStart={requestStartQuarter}
                    onRequestClose={requestCloseQuarter}
                />
            )}
            {tab === "questions" && (
                <QuestionsView
                    questions={questions}
                    setQuestions={setQuestions}
                    fetchQuestions={fetchQuestions}
                />
            )}
            {tab === "employees" && (
                <EmployeesView
                    key={`employees-${searchParams.get("search") || ""}`}
                    user={user}
                    initialSearch={searchParams.get("search") || ""}
                    pendingAddDept={pendingAddDept}
                    onConsumePendingAdd={() => setPendingAddDept(null)}
                />
            )}
            {tab === "logs" && <LogsView />}
            {tab === "users" && <UsersView currentUser={user} />}

            {/* Confirmation Dialogs — quarter start/close */}
            <ConfirmDialog
                open={confirm.open && confirm.type === "start"}
                title={`Start ${confirm.autoMode ? getAutoQuarterName() : confirm.payload?.quarterName || ""} Evaluation?`}
                message={`This will:\n\n✓ Lock 15 random self-assessment questions\n✓ Lock 5 supervisor, 4 branch manager, 3 cluster manager questions\n✓ Allow all employees to submit assessments\n✓ Cannot be undone until quarter is closed\n\nQuarter "${confirm.autoMode ? getAutoQuarterName() : confirm.payload?.quarterName || ""}" will begin immediately.`}
                confirmLabel="Yes, Start Quarter"
                variant="warning"
                loading={quarterLoading}
                onConfirm={startQuarter}
                onCancel={() => setConfirm({ open: false, type: null })}
            />
            <ConfirmDialog
                open={confirm.open && confirm.type === "close"}
                title="Close Active Quarter?"
                message="This will finalize all scores and cannot be undone. No further evaluations can be submitted after closing."
                confirmLabel="Close Quarter"
                variant="danger"
                loading={quarterLoading}
                onConfirm={closeQuarter}
                onCancel={() => setConfirm({ open: false, type: null })}
            />
        </DashboardShell>
    );
}
