// ── Shared helpers for the admin Reports tab ──
// Extracted from ReportsPanel.jsx so every report section reuses them.

// Resilient fetch (mirrors the admin dashboard's retry behavior).
export async function api(url, { retries = 4 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
        let res;
        try { res = await fetch(url); }
        catch (e) {
            lastErr = e;
            if (attempt < retries - 1) { await new Promise(r => setTimeout(r, 500 * (attempt + 1))); continue; }
            throw e;
        }
        let json = null;
        try { json = await res.json(); } catch { json = null; }
        if (res.status === 503 && attempt < retries - 1) {
            lastErr = new Error((json && json.message) || "Service starting up");
            await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
            continue;
        }
        if (!res.ok || !json || !json.success) {
            const err = new Error((json && json.message) || "Request failed");
            err.status = res.status;
            throw err;
        }
        return json.data;
    }
    throw lastErr || new Error("Request failed");
}

// ── Formatters ──
export const fmtScore = (v) => {
    if (v === null || v === undefined) return "";
    const n = Number(v);
    if (Number.isNaN(n)) return "";
    return Math.round(n * 100) / 100;
};
export const fmtDate = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};
export const collarLabel = (ct) => ct === "WHITE_COLLAR" ? "White Collar" : ct === "BLUE_COLLAR" ? "Blue Collar" : "—";
export const stageLabel = (n) => ["Not Started", "Stage 1 · Self", "Stage 2 · BM/HOD", "Stage 3 · CM", "Stage 4 · HR", "Winner"][n] || `Stage ${n}`;

// Best available score for an employee row (highest stage reached).
export function rowScore(e) {
    return e.stage4?.shortlistCombinedScore ?? e.stage4?.hrEval?.combinedScore ??
        e.stage3?.shortlistCombinedScore ?? e.stage3?.cmEval?.finalScore ??
        e.stage2?.shortlistCombinedScore ?? e.stage2?.bmEval?.combinedScore ?? e.stage2?.hodEval?.combinedScore ??
        e.stage1?.normalizedScore ?? null;
}

// Latest submission date across all stages (for the date-range filter).
export function rowLatestDate(e) {
    const ds = [
        e.stage1?.submittedAt, e.stage2?.bmEval?.submittedAt, e.stage2?.hodEval?.submittedAt,
        e.stage3?.cmEval?.submittedAt, e.stage4?.hrEval?.submittedAt,
    ].filter(Boolean).map(d => new Date(d).getTime()).filter(t => !Number.isNaN(t));
    return ds.length ? new Date(Math.max(...ds)) : null;
}

export function rowEvaluatorCodes(e) {
    return [
        e.stage2?.bmEval?.evaluatorEmpCode, e.stage2?.hodEval?.evaluatorEmpCode,
        e.stage3?.cmEval?.evaluatorEmpCode, e.stage4?.hrEval?.evaluatorEmpCode,
    ].filter(Boolean);
}

// The per-stage score shown for an employee at a given stage (1-4).
export function stageScore(e, stage) {
    if (stage === 1) return e.stage1?.normalizedScore ?? null;
    if (stage === 2) return e.stage2?.shortlistCombinedScore ?? e.stage2?.bmEval?.combinedScore ?? e.stage2?.hodEval?.combinedScore ?? null;
    if (stage === 3) return e.stage3?.shortlistCombinedScore ?? e.stage3?.cmEval?.finalScore ?? null;
    if (stage === 4) return e.stage4?.shortlistCombinedScore ?? e.stage4?.hrEval?.combinedScore ?? null;
    return null;
}

// Whether an employee has an evaluation recorded at a given stage (1-4).
export function evaluatedAtStage(e, stage) {
    if (stage === 1) return !!e.stage1?.submitted;
    if (stage === 2) return !!(e.stage2?.bmEval || e.stage2?.hodEval);
    if (stage === 3) return !!e.stage3?.cmEval;
    if (stage === 4) return !!e.stage4?.hrEval;
    return false;
}

// ── Stage cascade helpers (reached → completed → passed) ──
// "reached" = entered that stage's evaluation pool. Cascades: passing one
// stage is what makes an employee appear in the next stage's totals.
//   S1 reached = everyone · S2 reached = passed S1 · S3 reached = passed S2 ·
//   S4 reached = passed S3 · Final reached = passed S4.
export function reachedStage(e, stage) {
    if (stage === 1) return true;
    if (stage === 2) return !!e.stage1?.shortlisted;
    if (stage === 3) return !!e.stage2?.shortlisted;
    if (stage === 4) return !!e.stage3?.shortlisted;
    if (stage === "final") return !!e.stage4?.shortlisted;
    return false;
}
// "completed" = an evaluation record exists at that stage (or winner picked for Final).
export function completedStage(e, stage) {
    if (stage === "final") return !!e.isWinner;
    return evaluatedAtStage(e, stage);
}
// "passed/cleared" = shortlisted out of that stage into the next (winner for Final).
export function passedStage(e, stage) {
    if (stage === 1) return !!e.stage1?.shortlisted;
    if (stage === 2) return !!e.stage2?.shortlisted;
    if (stage === 3) return !!e.stage3?.shortlisted;
    if (stage === 4) return !!e.stage4?.shortlisted;
    if (stage === "final") return !!e.isWinner;
    return false;
}

// Whether an employee was evaluated by a given evaluator ROLE (BM/HOD/CM/HR).
export function evaluatedByRole(e, role) {
    if (role === "BM") return !!e.stage2?.bmEval;
    if (role === "HOD") return !!e.stage2?.hodEval;
    if (role === "CM") return !!e.stage3?.cmEval;
    if (role === "HR") return !!e.stage4?.hrEval;
    return false;
}

// Human evaluation status for an employee (for the employee-list report).
export function evalStatus(e) {
    if (e.isWinner) return "Winner";
    const cs = e.currentStage || 0;
    if (cs === 0) return "Not Started";
    if (cs >= 4 && e.stage4?.hrEval) return "Stage 4 Done";
    return `In Progress (Stage ${cs})`;
}

// ── Active-filter human summary (for export metadata + PDF header) ──
export function activeFilterSummary(f) {
    const parts = [];
    if (f.search) parts.push(`employee="${f.search}"`);
    if (f.branch) parts.push(`branch=${f.branch}`);
    if (f.department) parts.push(`dept=${f.department}`);
    if (f.collar) parts.push(`category=${collarLabel(f.collar)}`);
    if (f.stage) parts.push(`stage=${f.stage}`);
    if (f.evaluatorRole) parts.push(`evaluator=${f.evaluatorRole}`);
    return parts.join(", ");
}

// Theme palette for charts.
export const CHART_COLORS = ["#003087", "#00843D", "#F7941D", "#6C3FB0", "#C0392B", "#1E88A8", "#9B7B0A", "#3C6E47", "#B0436A", "#5A6B8C"];
export const STAGE_COLORS = { 1: "#003087", 2: "#00843D", 3: "#F7941D", 4: "#6C3FB0" };

// The 5-point Likert scale used by every questionnaire stage (self / BM / HOD / CM).
// Mirrors components/TimedEvaluationForm.js so the answer sheet shows the same options.
export const LIKERT_OPTIONS = [
    { value: -2, label: "Strongly Disagree", labelHindi: "पूर्णतः असहमत", color: "#D32F2F" },
    { value: -1, label: "Disagree", labelHindi: "असहमत", color: "#F57C00" },
    { value: 0, label: "Neutral", labelHindi: "तटस्थ", color: "#616161" },
    { value: 1, label: "Agree", labelHindi: "सहमत", color: "#388E3C" },
    { value: 2, label: "Strongly Agree", labelHindi: "पूर्णतः सहमत", color: "#1B5E20" },
];
export const likertOption = (score) => LIKERT_OPTIONS.find(o => o.value === score) || null;
