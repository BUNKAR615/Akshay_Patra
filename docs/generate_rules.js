const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  VerticalAlign, Header, Footer, PageNumber, LevelFormat, PageBreak
} = require("docx");
const fs = require("fs");

const OUT = "C:\\Users\\Dinesh\\Desktop\\Akshaya_Patra\\docs\\Akshaya_Patra_Rules.docx";

// ── colours
const BLUE  = "1F4E79";
const LBLUE = "D5E8F0";
const DGREY = "2E2E2E";
const LGREY = "F2F2F2";
const WHITE = "FFFFFF";

// ── helpers
function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 320, after: 160 },
    children: [new TextRun({ text, bold: true, font: "Arial", size: 32, color: WHITE })],
    shading: { fill: BLUE, type: ShadingType.CLEAR },
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: "Arial", size: 26, color: BLUE })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 80 },
    children: [new TextRun({ text, bold: true, font: "Arial", size: 22, color: "2E75B6" })],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, font: "Arial", size: 20, ...opts })],
  });
}

function bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 40, after: 40 },
    children: [new TextRun({ text, font: "Arial", size: 20 })],
  });
}

function codeBlock(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: 720 },
    children: [new TextRun({ text, font: "Courier New", size: 18, color: "8B0000" })],
  });
}

function gap() {
  return new Paragraph({ spacing: { before: 0, after: 100 }, children: [] });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// ── table helpers
const CELL_BORDER = {
  top:    { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  left:   { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  right:  { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
};

function cell(text, { fill = WHITE, bold = false, colSpan = 1, width = 2000 } = {}) {
  return new TableCell({
    borders: CELL_BORDER,
    width: { size: width, type: WidthType.DXA },
    shading: { fill, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    columnSpan: colSpan,
    children: [new Paragraph({
      children: [new TextRun({ text: String(text), font: "Arial", size: 18, bold, color: bold && fill === BLUE ? WHITE : DGREY })],
    })],
  });
}

function headerRow(cols, widths) {
  return new TableRow({
    tableHeader: true,
    children: cols.map((c, i) => cell(c, { fill: BLUE, bold: true, width: widths[i] })),
  });
}

function dataRow(cols, widths, shade = WHITE) {
  return new TableRow({
    children: cols.map((c, i) => cell(c, { fill: shade, width: widths[i] })),
  });
}

function makeTable(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    rows: [
      headerRow(headers, widths),
      ...rows.map((r, i) => dataRow(r, widths, i % 2 === 0 ? WHITE : LGREY)),
    ],
  });
}

// ════════════════════════════════════════════════════════════
// CONTENT
// ════════════════════════════════════════════════════════════

const children = [];

// ── TITLE PAGE
children.push(
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 1440, after: 240 },
    children: [new TextRun({ text: "Akshaya Patra", font: "Arial", size: 56, bold: true, color: BLUE })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ text: "Employee Evaluation & Role Assignment", font: "Arial", size: 36, color: DGREY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 480 },
    children: [new TextRun({ text: "Rule Book", font: "Arial", size: 36, bold: true, color: BLUE })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ text: "\"Best Employee of the Quarter\" Platform", font: "Arial", size: 24, italics: true, color: "555555" })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 0 },
    children: [new TextRun({ text: `Generated: ${new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}`, font: "Arial", size: 20, color: "888888" })],
  }),
  pageBreak(),
);

// ── SECTION 1: OVERVIEW
children.push(heading1("1. Overview"));
children.push(body("This document covers all rules governing the Akshaya Patra \"Best Employee of the Quarter\" platform — from role assignment to the 4-stage evaluation pipeline. All rules are derived from the application source code."));
children.push(gap());
children.push(heading3("Core Building Blocks"));
children.push(makeTable(
  ["Concept", "Values", "Notes"],
  [
    ["Role Types", "EMPLOYEE, HOD, SUPERVISOR, BRANCH_MANAGER, CLUSTER_MANAGER, HR, COMMITTEE, ADMIN", "8 roles total"],
    ["Branch Type", "SMALL, BIG", "BIG branches = Jaipur, Nathdwara"],
    ["Collar Type", "WHITE_COLLAR, BLUE_COLLAR", "Affects evaluation track in BIG branches"],
    ["Quarter Status", "ACTIVE, CLOSED", "Only one ACTIVE quarter at a time"],
    ["Evaluation Pipeline", "Stage 1 -> Stage 2 -> Stage 3 -> Stage 4 -> Committee Result", "Per quarter, per branch"],
  ],
  [2400, 4160, 2800],
));
children.push(gap());
children.push(body("The whole system runs per quarter, per branch. There are two code paths: the branch-level flow (current/active) and a department-level flow (legacy/deprecated, kept only for historical data). All rules below describe the active branch-level flow."));

// ── SECTION 2: ROLES
children.push(pageBreak());
children.push(heading1("2. Roles — Smallest to Biggest"));
children.push(makeTable(
  ["#", "Role", "What They Are", "Assigned By", "Notes"],
  [
    ["1", "Employee", "Default account. Completes Stage 1 self-assessment.", "Bulk upload / Admin", "All staff start here"],
    ["2", "HOD (Head of Dept)", "White-collar employee who evaluates blue-collar staff at Stage 2.", "Branch Manager", "BIG branches only; additive — keeps employee identity"],
    ["3", "Supervisor", "DEPRECATED — old department-level evaluator.", "—", "Kept for historical data only"],
    ["4", "Branch Manager (BM)", "Runs one branch; evaluates Stage 2 (white-collar / all); nominates HODs.", "Admin", "One per branch; one branch per BM"],
    ["5", "Cluster Manager (CM)", "Evaluates Stage 3; can oversee multiple branches.", "Admin", "One CM per branch; CM can serve many branches"],
    ["6", "HR", "Evaluates Stage 4 (attendance / punctuality).", "Admin", "Maximum 3 per branch; may serve multiple branches"],
    ["7", "Committee", "Global oversight body that views final winners.", "Admin", "Maximum 3 members globally"],
    ["8", "Admin", "Full control: quarters, questions, branches, all assignments.", "—", "No branch scope restriction"],
  ],
  [400, 1600, 2800, 1500, 3060],
));

// ── SECTION 3: LOGIN & PASSWORDS
children.push(pageBreak());
children.push(heading1("3. Login & Password Rules"));

children.push(heading2("3.1 Default Passwords"));
children.push(makeTable(
  ["Account Type", "Password Format"],
  [
    ["Employee", "empCode (verbatim). Example: empCode \"EMP001\" -> password \"EMP001\""],
    ["Staff (BM / CM / HR / Committee / Admin)", "Firstname_## — Capitalized first name + last 2 digits of empCode (left-padded to 2 digits). Examples: \"Ramesh Kumar\" + BM001 -> \"Ramesh_01\"; \"Amit\" + HR9 -> \"Amit_09\". Fallback to empCode if name has no letters or empCode has no digits."],
  ],
  [2800, 6560],
));

children.push(gap());
children.push(heading2("3.2 Dual-Login (Two Passwords on One Account)"));
children.push(makeTable(
  ["Account Type", "Primary Password (empCode)", "Secondary Password (Firstname_##)"],
  [
    ["HOD", "Employee dashboard (main branch)", "HOD dashboard — only works if they have an active-quarter HodAssignment"],
    ["Dual-login Staff\n(BM/CM/HR/Committee who is also a dept employee)", "Employee dashboard (main branch)", "Their staff dashboard — preserves main branch identity"],
  ],
  [2500, 3000, 3860],
));

children.push(gap());
children.push(heading2("3.3 Multi-Role / Multi-Branch Login Rules"));
children.push(bullet("If a user can act as more than one role (e.g. a BM who is also Committee, or Admin + HOD), login returns a \"Continue as...\" picker with a short-lived 5-minute roleSelectToken."));
children.push(bullet("The same Firstname_## password unlocks every offered role."));
children.push(bullet("For CM / HR / Committee with multiple branch assignments, login offers a branch picker. The assignment table — NOT User.branchId — is the source of truth (prevents multi-branch data leaks)."));
children.push(bullet("Access token lifespan: 8 hours. Refresh token: 7 days. Logout blacklists the token."));
children.push(bullet("Login rate limiting is DISABLED (users share office/NAT IPs). IP is still logged for audit purposes."));
children.push(bullet("Transient DB / cold-start errors return HTTP 503 \"Service is starting up\" — not a generic 500."));

// ── SECTION 4: ROLE ASSIGNMENT RULES
children.push(pageBreak());
children.push(heading1("4. Role Assignment Rules"));

children.push(heading2("4.1 Global Governance Rules"));
children.push(makeTable(
  ["Rule", "Description", "Applies To"],
  [
    ["Rule A — One Active Evaluator Role", "A person may hold only ONE of: Branch Manager, Cluster Manager, or HR at a time. COMMITTEE is EXCLUDED from this rule — it may coexist with an evaluator role.", "BM, CM, HR assignments"],
    ["Rule D — HR Cap per Branch", "A branch may have at most 3 HR personnel. Re-assigning an existing HR of the same branch is always allowed.", "HR assignment"],
    ["Rule E — Committee Cap", "The committee may have at most 3 members globally. Re-assigning an existing member is always allowed.", "Committee assignment"],
  ],
  [2500, 5000, 1860],
));

children.push(gap());
children.push(heading2("4.2 Branch Manager (BM)"));
children.push(bullet("One BM per branch AND one branch per BM (enforced at both application and database levels with unique indexes)."));
children.push(bullet("Exact rejection messages: \"This branch already has a Branch Manager assigned.\" / \"This user is already assigned as Branch Manager in another branch.\""));
children.push(bullet("Subject to Rule A — cannot also hold CM or HR role."));
children.push(bullet("On assign (atomic transaction): role -> BRANCH_MANAGER; branchId set; employee/HOD anchors cleared (departmentId, passwordHod, collarType nulled); password reset to Firstname_##."));
children.push(bullet("On remove: demoted to EMPLOYEE — or to COMMITTEE if they are a dual-role committee member."));

children.push(gap());
children.push(heading2("4.3 Cluster Manager (CM)"));
children.push(bullet("One CM per branch; but a single CM may serve MANY branches."));
children.push(bullet("Subject to Rule A."));
children.push(bullet("On assign: role -> CLUSTER_MANAGER; password reset to Firstname_##; departmentId / branchId / passwordHod / collarType nulled. User.branchId is intentionally NOT written — ClusterManagerBranchAssignment is the single source of truth."));
children.push(bullet("On remove from all branches: demoted to EMPLOYEE (or COMMITTEE if dual-role)."));

children.push(gap());
children.push(heading2("4.4 HR"));
children.push(bullet("Maximum 3 HR per branch (Rule D). An HR may serve multiple branches. Subject to Rule A."));
children.push(body("Two assignment shapes:", { bold: true }));
children.push(bullet("Shape 1 — Existing Employee -> HR: Keep their main branch and department. Set up dual-login (empCode -> employee dashboard, Firstname_## -> HR dashboard). Their evaluation stays owned by their main branch."));
children.push(bullet("Shape 2 — Pure Staff -> HR: Detach-on-promote (anchors nulled); Firstname_## becomes the primary password."));

children.push(gap());
children.push(heading2("4.5 HOD (Head of Department)"));
children.push(bullet("Assigned by the Branch Manager only, and only available in BIG branches."));
children.push(bullet("Candidate MUST be WHITE_COLLAR (checked via User.collarType) and must belong to the BM's branch."));
children.push(bullet("The target department must belong to that same branch."));
children.push(bullet("Additive promotion ONLY: only an EMPLOYEE is flipped to HOD. Any higher-privilege role (Admin / BM / CM / HR / Committee / Supervisor) is PRESERVED. HOD nomination must never demote a higher role."));
children.push(bullet("Gets a passwordHod (Firstname_##) if missing."));
children.push(bullet("Blue-collar employees are linked to a specific HOD per-employee via EmployeeHodAssignment (falls back to department-level HodAssignment for older data)."));

children.push(gap());
children.push(heading2("4.6 Committee"));
children.push(bullet("GLOBAL: one assignment applies to EVERY branch simultaneously. Adding a member assigns them to all branches; removing deletes from all branches. The branchId in the API URL is only for admin scoping."));
children.push(bullet("Maximum 3 members globally (Rule E)."));
children.push(bullet("Eligibility: only ROLE-HOLDERS may join (Supervisor, HOD, BM, CM, HR, Admin, or existing Committee). NORMAL EMPLOYEES ARE NOT ELIGIBLE and will be blocked with an error."));
children.push(body("Rule A is intentionally NOT applied to committee:", { bold: true }));
children.push(bullet("Case 1 — Electing an Evaluator (BM/CM/HR): Keeps their role, password, and all anchors. Committee is purely additive. They pick which role to act as at login (dual-role)."));
children.push(bullet("Case 2 — Electing a Non-Evaluator (plain Employee, HOD, Supervisor, Admin): Converted to pure COMMITTEE member (role flipped, anchors nulled, password reset to Firstname_##)."));

// ── SECTION 5: EVALUATION STAGES
children.push(pageBreak());
children.push(heading1("5. How an Employee is Evaluated — Stage by Stage"));

children.push(heading2("5.0 Score Normalization Formula"));
children.push(body("Each question is scored on a 5-point scale: -2, -1, 0, 1, or 2."));
children.push(codeBlock("normalized_score (0-100)  =  rawScore / (questionCount x 2)  x  100"));
children.push(body("This formula applies to self-assessments, BM/HOD, CM, and HR evaluations alike."));

children.push(gap());
children.push(heading2("5.1 Stage 1 — Self Assessment"));
children.push(bullet("Employees answer their own per-employee randomized question set (category-balanced, minimum 2 questions per category, assigned at quarter start)."));
children.push(bullet("Only EMPLOYEE role may submit. One submission per quarter — duplicate is rejected (HTTP 409)."));
children.push(bullet("Branch Stage-1 Shortlist = top 50% of the branch's employees by self-score (cutoff configurable per branch/quarter via BranchEvalConfig, default 50%). Minimum 1 person always advances."));
children.push(bullet("Ranking: highest normalizedScore first. TIE-BREAK = faster completion time wins."));
children.push(bullet("FREEZE RULE: once any BM or HOD evaluation exists for the branch+quarter, the Stage-1 list is LOCKED. Late self-assessments still record a score but cannot change the shortlist."));

children.push(gap());
children.push(heading2("5.2 Stage 2 — BM / HOD Evaluation"));
children.push(makeTable(
  ["Branch Type", "Evaluated By", "Who Gets Evaluated"],
  [
    ["BIG branch — White-collar", "Branch Manager", "White-collar employees in Stage-1 shortlist"],
    ["BIG branch — Blue-collar", "HOD (assigned by BM)", "Blue-collar employees in Stage-1 shortlist. BM is blocked from evaluating BC and told to assign an HOD."],
    ["SMALL branch", "Branch Manager", "ALL Stage-1 shortlisted employees (both collar types)"],
  ],
  [2200, 2200, 4960],
));
children.push(gap());
children.push(body("Weighting formula (calculateBranchStage2Score):", { bold: true }));
children.push(codeBlock("Self contribution      =  (selfNormalized / 100)  x  60"));
children.push(codeBlock("Evaluator contribution =  (evaluatorNormalized / 100)  x  40"));
children.push(codeBlock("Combined score         =  Self + Evaluator   (max 100)"));

children.push(gap());
children.push(body("Stage 2 Shortlist Limits — who advances to Stage 3:", { bold: true }));
children.push(makeTable(
  ["Branch / Track", "Limit (default)", "Notes"],
  [
    ["BIG — White-collar", "Top 3", "Configurable via BranchEvalConfig"],
    ["BIG — Blue-collar", "Top 10", "Configurable via BranchEvalConfig"],
    ["SMALL (all collars)", "Top 10", "Configurable via BranchEvalConfig"],
  ],
  [2800, 2000, 4560],
));

children.push(gap());
children.push(heading2("5.3 Stage 3 — Cluster Manager Evaluation"));
children.push(bullet("The branch's one CM evaluates the Stage-2 pool. CM must be assigned to that branch."));
children.push(bullet("Answers validated against the locked Cluster-Manager question set (separate from the BM question bank)."));
children.push(bullet("Multiple CM evaluations of the same employee are AVERAGED together."));
children.push(bullet("Only CM-evaluated employees are eligible to advance to Stage 4."));
children.push(gap());
children.push(body("Weighting formula (calculateBranchStage3Score):", { bold: true }));
children.push(codeBlock("Self contribution       =  (selfNormalized / 100)  x  40"));
children.push(codeBlock("Evaluator contribution  =  (evaluatorNormalized / 100)  x  30"));
children.push(codeBlock("CM contribution         =  (cmNormalized / 100)  x  30"));
children.push(codeBlock("Combined score          =  Self + Evaluator + CM   (max 100)"));

children.push(gap());
children.push(body("Stage 3 Shortlist Limits — who advances to Stage 4:", { bold: true }));
children.push(makeTable(
  ["Branch / Track", "Limit (default)", "Notes"],
  [
    ["BIG — White-collar", "Top 2", "Configurable via BranchEvalConfig"],
    ["BIG — Blue-collar", "Top 5", "Configurable via BranchEvalConfig"],
    ["SMALL (all collars)", "Top 5", "Configurable via BranchEvalConfig"],
  ],
  [2800, 2000, 4560],
));

children.push(gap());
children.push(heading2("5.4 Stage 4 — HR Evaluation"));
children.push(bullet("HR (assigned to the branch) evaluates the Stage-3 pool. Admin bypasses the branch-scope check."));
children.push(bullet("HR SCORE = Attendance % (0-100, clamped). HR also records: working hours, reference sheet URL, attendance PDFs, punctuality PDFs, and notes."));
children.push(bullet("One HR evaluation per employee per quarter."));
children.push(gap());
children.push(body("Final weighting formula (calculateBranchFinalScore):", { bold: true }));
children.push(codeBlock("Self contribution       =  (selfNormalized / 100)  x  30"));
children.push(codeBlock("Evaluator contribution  =  (evaluatorNormalized / 100)  x  25"));
children.push(codeBlock("CM contribution         =  (cmNormalized / 100)  x  25"));
children.push(codeBlock("HR contribution         =  (hrNormalized / 100)  x  20"));
children.push(codeBlock("Final score             =  Self + Evaluator + CM + HR   (max 100)"));

children.push(gap());
children.push(body("Stage 4 — Branch Best Employees (terminal stage):", { bold: true }));
children.push(makeTable(
  ["Branch Type", "Winners Selected", "Details"],
  [
    ["BIG branch", "1 White-collar + 3 Blue-collar = 4 total", "Ranked by finalScore within each collar track"],
    ["SMALL branch", "Top 3 overall", "Ranked by finalScore across all collar types"],
  ],
  [2200, 3000, 4160],
));

children.push(gap());
children.push(heading2("5.5 Committee / Final Result View"));
children.push(bullet("Committee members and Admins view final winners per branch."));
children.push(bullet("Score breakdown displayed with weights: Stage 1 (Self) 30% / Stage 2 (Evaluator) 25% / Stage 3 (CM) 25% / Stage 4 (HR) 20%."));
children.push(bullet("Branch scope for Committee is determined by CommitteeBranchAssignment — NOT User.branchId."));
children.push(bullet("Total mode: Committee sees all their assigned branches; Admin sees every branch that has results."));

// ── SECTION 6: SCORING WEIGHTS SUMMARY
children.push(pageBreak());
children.push(heading1("6. Scoring Weights Summary"));

children.push(heading2("6.1 Active Branch-Level Flow (Current)"));
children.push(makeTable(
  ["Stage", "Self Weight", "Evaluator (BM/HOD)", "CM Weight", "HR Weight"],
  [
    ["Stage 2 — BM/HOD evaluates", "60%", "40%", "—", "—"],
    ["Stage 3 — CM evaluates", "40%", "30%", "30%", "—"],
    ["Stage 4 / Final Score — HR evaluates", "30%", "25%", "25%", "20%"],
  ],
  [2800, 1600, 1700, 1500, 1760],
));

children.push(gap());
children.push(heading2("6.2 Legacy Department Flow (Deprecated — historical data only)"));
children.push(makeTable(
  ["Stage", "Self", "Supervisor", "BM", "CM"],
  [
    ["Stage 2 (Supervisor)", "65%", "35%", "—", "—"],
    ["Stage 3 (BM)", "55%", "30%", "15%", "—"],
    ["Final (CM)", "45%", "30%", "15%", "10%"],
  ],
  [2800, 1600, 1600, 1500, 1860],
));

// ── SECTION 7: GOVERNANCE — PARTIAL PROMOTION & LOCKING
children.push(pageBreak());
children.push(heading1("7. Governance — Partial Promotion & Round-Locking"));

children.push(heading2("Rule 1 — Partial Promotion"));
children.push(body("A stage no longer waits for EVERY target to be evaluated. On each submission, the next-stage shortlist is REBUILT from evaluations done so far (top-N per track), pruning anyone who dropped out. Employees proceed as evaluations come in — there is no \"all-or-nothing\" gate."));

children.push(gap());
children.push(heading2("Rule 2 — Round-Locking"));
children.push(body("A round FREEZES the moment the next round starts evaluating that branch (i.e., when the first evaluation of the next stage is submitted)."));
children.push(gap());
children.push(makeTable(
  ["Round Locked", "Locked When", "Effect"],
  [
    ["Stage 2 shortlist", "CM submits the first Stage-3 evaluation for the branch", "No BM/HOD evaluation can reshuffle the Stage-2 list"],
    ["Stage 3 shortlist", "HR submits the first Stage-4 evaluation for the branch", "No CM evaluation can reshuffle the Stage-3 list"],
    ["Stage 4 / Best Employee", "Terminal — always reflects current HR evaluations", "No locking needed; always up to date"],
  ],
  [2500, 3500, 3360],
));

// ── SECTION 8: QUARTER RULES
children.push(pageBreak());
children.push(heading1("8. Quarter Rules"));

children.push(heading2("8.1 Quarter Lifecycle"));
children.push(bullet("Only ONE active quarter at a time. Starting a new quarter fails if one is already active (\"Close it first.\")."));
children.push(bullet("Quarter name must be unique."));
children.push(bullet("End date must be strictly after start date."));
children.push(bullet("At quarter start, a defensive HOD-state reset clears stale HodAssignment / EmployeeHodAssignment / role-mapping rows from previously-closed quarters."));
children.push(bullet("Admin is WARNED at quarter start about branches with no BM assigned — Stage 2 will be blocked in those branches."));

children.push(gap());
children.push(heading2("8.2 Question Selection Modes"));
children.push(makeTable(
  ["Mode", "How Questions Are Selected", "Notes"],
  [
    ["AUTO", "System picks a random, category-balanced subset (minimum 2 questions per category for SELF). Default counts: SELF = admin-set, BM = 15, CM = 10.", "Randomized per quarter; different every time"],
    ["MANUAL", "Exactly the questions the admin marked as \"included\" on the Questions page. Every included question is locked; every employee gets the full SELF set.", "No random subsetting; admin has full control"],
  ],
  [1400, 5400, 2560],
));

children.push(gap());
children.push(heading2("8.3 Additional Question Rules"));
children.push(bullet("HOD evaluators REUSE the Branch Manager question bank. There is no separate HOD question level."));
children.push(bullet("Questions are LOCKED into the quarter (QuarterQuestion table) at start and cannot be changed."));
children.push(bullet("Each employee is assigned a randomized order of their question set at quarter start (EmployeeQuarterQuestions table)."));
children.push(bullet("Single-employee departments get an AUTOMATIC WINNER declared at quarter start with no evaluation needed."));

children.push(gap());
children.push(heading2("8.4 Question Categories (7 total)"));
children.push(makeTable(
  ["Category", "Category", "Category"],
  [
    ["ATTENDANCE", "DISCIPLINE", "PRODUCTIVITY"],
    ["TEAMWORK", "INITIATIVE", "COMMUNICATION"],
    ["INTEGRITY", "", ""],
  ],
  [3120, 3120, 3120],
));

// ── SECTION 9: CROSS-CUTTING GUARANTEES
children.push(pageBreak());
children.push(heading1("9. Cross-Cutting System Guarantees"));

children.push(makeTable(
  ["Guarantee", "Description"],
  [
    ["Branch scope is assignment-table-authoritative", "For CM / HR / Committee, branch scope is always read from assignment tables — never from User.branchId. Prevents multi-branch data leaks."],
    ["Idempotent re-assigns", "Re-saving the same (user, branch) pair is a no-op (not an error). Safe to call multiple times."],
    ["Detach-on-promote", "Promoting a user to a staff role nulls their employee anchors (departmentId, collarType, etc.) so a later bulk upload cannot silently demote them back."],
    ["Dual-role safety on removal", "Removing an evaluator role from a dual-role user falls back to COMMITTEE (not EMPLOYEE) if they are still a committee member."],
    ["Audit logging", "Logins (success and failure), every assignment including REJECTIONS with reason code, evaluations, quarter starts, and auto-winners are all written to the AuditLog table."],
    ["Legacy cache is non-blocking", "The legacy Department.branchManagerId / DepartmentRoleMapping cache is synced AFTER the authoritative write commits in a separate connection. A cache failure can never roll back or error an assignment."],
    ["Concurrency protection", "All critical assignments use database-level unique constraints + atomic transactions + P2002 (unique-violation) handling for concurrent admin actions."],
  ],
  [3000, 6360],
));

children.push(gap());
children.push(gap());
children.push(new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 480, after: 0 },
  children: [new TextRun({ text: "— End of Rule Book —", font: "Arial", size: 20, italics: true, color: "888888" })],
}));

// ════════════════════════════════════════════════════════════
// DOCUMENT
// ════════════════════════════════════════════════════════════

const doc = new Document({
  styles: {
    default: {
      document: { run: { font: "Arial", size: 20 } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: WHITE },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0, shading: { fill: BLUE, type: ShadingType.CLEAR } },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: BLUE },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 },
      },
      {
        id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 22, bold: true, font: "Arial", color: "2E75B6" },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 1 } },
          children: [new TextRun({ text: "Akshaya Patra — Employee Evaluation Rule Book", font: "Arial", size: 16, color: "888888" })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { style: BorderStyle.SINGLE, size: 6, color: BLUE, space: 1 } },
          children: [
            new TextRun({ text: "Page ", font: "Arial", size: 16, color: "888888" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "888888" }),
            new TextRun({ text: " of ", font: "Arial", size: 16, color: "888888" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16, color: "888888" }),
          ],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUT, buffer);
  console.log("SUCCESS: " + OUT + " (" + Math.round(buffer.length / 1024) + " KB)");
}).catch((err) => {
  console.error("ERROR:", err.message);
  process.exit(1);
});
