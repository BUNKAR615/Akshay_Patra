"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const ACCENT = "#F7941D";
const GREEN = "#00843D";

const FIELDS = [
    { key: "name", label: "Full name", placeholder: "e.g. Anita Desai", always: true },
    { key: "empCode", label: "Employee code", placeholder: "e.g. AP-44213", req: "empCodeRequired" },
    { key: "email", label: "Email", placeholder: "you@akshayapatra.org", type: "email", req: "emailRequired" },
    { key: "mobile", label: "Mobile number", placeholder: "10-digit mobile", req: "mobileRequired" },
    { key: "department", label: "Department", placeholder: "e.g. Kitchen Operations" },
    { key: "branch", label: "Branch", placeholder: "e.g. Hyderabad" },
    { key: "designation", label: "Designation", placeholder: "e.g. Supervisor" },
];

export default function ExternalRegisterPage() {
    const { id } = useParams();
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState(null);
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: "", empCode: "", email: "", mobile: "", department: "", branch: "", designation: "" });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [done, setDone] = useState(null); // { autoApproved }

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`/api/exam/${id}/register`);
                const json = await res.json();
                if (json?.success) { setMeta(json.data.exam); setOpen(json.data.registrationOpen); }
            } catch { /* ignore */ }
            finally { setLoading(false); }
        })();
    }, [id]);

    const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); if (error) setError(""); };

    const submit = async (e) => {
        e.preventDefault();
        setError(""); setSubmitting(true);
        try {
            const res = await fetch(`/api/exam/${id}/register`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
            });
            const json = await res.json();
            if (!res.ok || !json.success) { setError(json.message || "Could not register. Please try again."); return; }
            setDone({ autoApproved: json.data.autoApproved });
        } catch { setError("Network error. Please try again."); }
        finally { setSubmitting(false); }
    };

    return (
        <div className="min-h-screen min-h-[100dvh] flex flex-col" style={{ background: "radial-gradient(1100px 520px at 50% -10%, #0A3FA0 0%, #0D1B3E 55%, #081230 100%)" }}>
            <header className="flex items-center gap-2.5 px-5 sm:px-8 py-5">
                <div style={{ background: ACCENT }} className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0">
                    <svg width="18" height="18" fill="none" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <div className="leading-tight"><p className="text-white font-extrabold text-[14px]">Akshaya Patra</p><p className="text-white/45 text-[10px] font-bold uppercase tracking-[0.14em]">Exam Registration</p></div>
            </header>

            <div className="flex-1 flex items-center justify-center px-5 py-8">
                <div className="w-full max-w-[560px]" style={{ animation: "apFadeUp .45s ease" }}>
                    {loading ? (
                        <Card><div className="py-10 text-center text-ap-text-muted text-[14px]">Loading…</div></Card>
                    ) : !meta ? (
                        <StateCard tone="error" title="Exam not found" body="This registration link is invalid or has expired." />
                    ) : done ? (
                        <StateCard
                            tone="success"
                            title={done.autoApproved ? "You're registered!" : "Registration received"}
                            body={done.autoApproved
                                ? "Your registration is confirmed. You'll receive exam access details shortly."
                                : "Thanks for registering. An administrator will review and approve your request, after which you'll receive access details."}
                        />
                    ) : !open ? (
                        <StateCard tone="closed" title="Registration is closed" body={`"${meta.title}" is not open for external registration right now. Please check with your administrator.`} />
                    ) : (
                        <Card>
                            <span style={{ background: "#FEF4E8", color: "#C2410C" }} className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide mb-4">Register to participate</span>
                            <h1 className="text-[24px] font-extrabold text-ap-text leading-tight tracking-tight">{meta.title}</h1>
                            {meta.description && <p className="text-[14px] text-ap-text-muted mt-2 leading-relaxed">{meta.description}</p>}

                            <form onSubmit={submit} className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                {FIELDS.map((f) => {
                                    const required = f.always || (f.req && meta[f.req]);
                                    const full = f.key === "name";
                                    return (
                                        <div key={f.key} className={`flex flex-col gap-1.5 ${full ? "sm:col-span-2" : ""}`}>
                                            <label className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">{f.label}{required && <span className="text-red-600 ml-0.5">*</span>}</label>
                                            <input
                                                type={f.type || "text"} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)}
                                                placeholder={f.placeholder} required={!!required}
                                                className="w-full border-[1.5px] border-gray-300 focus:border-ap-orange rounded-[10px] px-3 py-2.5 text-[14px] outline-none transition"
                                            />
                                        </div>
                                    );
                                })}

                                {error && (
                                    <div className="sm:col-span-2 bg-red-50 border border-red-200 text-red-700 text-[13px] font-semibold rounded-lg px-4 py-2.5">{error}</div>
                                )}

                                <button type="submit" disabled={submitting} style={{ background: ACCENT, boxShadow: "0 8px 22px rgba(247,148,29,.3)" }} className="sm:col-span-2 text-white font-extrabold text-[15px] rounded-[12px] py-3.5 mt-1 cursor-pointer transition-transform hover:-translate-y-0.5 disabled:opacity-60">
                                    {submitting ? "Submitting…" : "Register"}
                                </button>
                            </form>
                        </Card>
                    )}
                    <p className="text-center text-white/40 text-[12px] mt-5">Akshaya Patra Foundation · “Education, Not Hunger”</p>
                </div>
            </div>

            <style jsx global>{`@keyframes apFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
    );
}

function Card({ children }) {
    return <div className="bg-white rounded-[22px] p-7 sm:p-9 shadow-2xl">{children}</div>;
}

function StateCard({ tone, title, body }) {
    const tones = {
        success: { bg: "#EBF7F1", stroke: GREEN, icon: <path d="M20 6L9 17l-5-5" stroke={GREEN} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> },
        closed: { bg: "#FEF4E8", stroke: "#C2410C", icon: <path d="M18 8h1a4 4 0 010 8h-1M6 8a4 4 0 100 8M6 8h12M12 12v6" stroke="#C2410C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> },
        error: { bg: "#FEF2F2", stroke: "#DC2626", icon: <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> },
    };
    const t = tones[tone] || tones.success;
    return (
        <Card>
            <div className="text-center">
                <div style={{ background: t.bg }} className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5">
                    <svg width="30" height="30" fill="none" viewBox="0 0 24 24">{t.icon}</svg>
                </div>
                <h1 className="text-[22px] font-extrabold text-ap-text tracking-tight">{title}</h1>
                <p className="text-[14px] text-ap-text-muted mt-2 leading-relaxed">{body}</p>
            </div>
        </Card>
    );
}
