# CODEX HANDOFF — Akshaya Patra Employee Evaluation Platform

> Generated from actual source code exploration. Nothing is guessed.
> Mark anything you cannot verify as **needs verification** before acting on it.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Map](#2-architecture-map)
3. [Business Rules](#3-business-rules)
4. [Current System State](#4-current-system-state)
5. [File-by-File Map](#5-file-by-file-map)
6. [Commands and Setup](#6-commands-and-setup)
7. [Data Model Explanation](#7-data-model-explanation)
8. [Known Pitfalls](#8-known-pitfalls)
9. [Codex Working Guide](#9-codex-working-guide)
10. [Open Questions / Unknowns](#10-open-questions--unknowns)

---

## 1. Project Overview

### What the app is

**Akshaya Patra Employee Evaluation Platform** is a multi-stage, role-based
employee performance evaluation system built for the Akshaya Patra Foundation
(currently piloting for the Jaipur branch). It manages a quarterly cycle in
which employees are assessed from self-assessment through multiple evaluator
stages, resulting in a "Best Employee" designation per branch per collar type.

The system is a full-stack Next.js 14 application with a PostgreSQL database.
It is actively used in production; real employee data (287+ employees) exists
in the database.

---

### Main User Roles

| Role | Description |
|------|-------------|
| `ADMIN` | System administrator. Global access. Can manage branches, employees, quarters, questions, assign evaluators. |
| `BRANCH_MANAGER` (BM) | Manages one branch. Evaluates Stage-1 shortlisted employees (WC on BIG branches; all on SMALL). Assigns HODs. |
| `HOD` | Head of Department. Evaluates blue-collar Stage-1 shortlisted employees on BIG branches only. A HOD is a white-collar EMPLOYEE with a secondary password. |
| `CLUSTER_MANAGER` (CM) | Evaluates Stage-2 shortlisted employees (Stage 3). Oversees one or more branches. |
| `HR` | Evaluates Stage-3 shortlisted employees (Stage 4) using attendance/punctuality data. Oversees one or more branches. |
| `COMMITTEE` | Final review committee. Views Stage-4 results and declares Best Employee. Oversees one or more branches. |
| `EMPLOYEE` | Regular employee. Submits self-assessment (Stage 1). |
| `SUPERVISOR` | **DEPRECATED.** Legacy role; kept in enum for historical data. No active routes use it. |

---

### Major Workflows

#### 1. Login
- All users authenticate with `empCode` + `password`.
- EMPLOYEE and ADMIN: single-step → JWT issued directly.
- CM / HR / COMMITTEE with multiple branch assignments: two-step → stage-1
  `branchSelectToken` → user picks branch → full JWT issued.
- EMPLOYEE who is also an active HOD: can login with primary password
  (empCode, gets EMPLOYEE role) OR secondary password (`Firstname_##`, gets HOD role).
- ADMIN who is also an HOD: two-step role picker → user picks ADMIN or HOD.

#### 2. Quarter Lifecycle
```
Admin: POST /api/admin/quarters/start
  → validates question bank
  → assigns per-employee randomized SELF questions
  → declares auto-winners for single-employee departments
  → sends notifications to all employees
  → Quarter.status = ACTIVE

[Evaluation stages run while ACTIVE]

Admin: POST /api/admin/quarters/close
  → Quarter.status = CLOSED
  → results become visible
```

#### 3. Evaluation Pipeline

```
Stage 1 — Self-Assessment (EMPLOYEE)
  Employee submits answers → normalizedScore stored in SelfAssessment
  Top 50% (by normalizedScore) → BranchShortlistStage1
  (cutoff overridable via BranchEvalConfig.stage1CutoffPct)

Stage 2 — Evaluator Assessment
  BIG branch, WHITE_COLLAR:  BM evaluates  → top  3 → BranchShortlistStage2
  BIG branch, BLUE_COLLAR:   HOD evaluates → top 10 → BranchShortlistStage2
  SMALL branch (all collars): BM evaluates  → top 10 → BranchShortlistStage2
  Score = 60% self + 40% evaluator

Stage 3 — Cluster Manager (CM)
  CM evaluates Stage-2 shortlist → top 5 → BranchShortlistStage3
  Score = previous combined score + CM contribution

Stage 4 — HR Evaluation
  HR uploads attendance/punctuality data → top 3 → BranchShortlistStage4
  Score = previous combined + HR score

Final — Committee
  Committee views BranchShortlistStage4, declares BranchBestEmployee
  (no evaluation form; manual review via dashboard)
```

#### 4. Big Branch vs Small Branch

| Feature | BIG branch | SMALL branch |
|---------|-----------|--------------|
| HOD assignment | Required for blue-collar eval | Not available |
| Blue-collar Stage-2 evaluator | HOD | BM |
| White-collar Stage-2 limit | Top 3 | Top 10 |
| Blue-collar Stage-2 limit | Top 10 | Top 10 |
| Detection | `Branch.branchType === "BIG"` | `Branch.branchType === "SMALL"` |

---

## 2. Architecture Map

### Folder Structure

```
Akshaya_Patra/
├── app/                        Next.js App Router — pages + API routes
│   ├── api/                    API route handlers
│   │   ├── auth/               login, logout, refresh, me, select-branch, select-role
│   │   ├── admin/              branches, employees, quarters, questions, results, audit
│   │   ├── branch-manager/     departments, evaluate, hod/*, stats, questions
│   │   ├── hod/                evaluate, shortlist, questions
│   │   ├── cluster-manager/    departments, evaluate, shortlist, questions
│   │   ├── hr/                 evaluate, shortlist, upload
│   │   ├── committee/          results
│   │   ├── assessment/         questions, submit
│   │   ├── employee/           current-status, history, status
│   │   ├── notifications/      list, read, read-all
│   │   └── user/               profile
│   ├── dashboard/
│   │   ├── admin/
│   │   │   ├── page.js                        Admin overview
│   │   │   ├── [branchId]/
│   │   │   │   ├── page.js                    Branch detail
│   │   │   │   ├── layout.js                  Branch-scoped layout
│   │   │   │   ├── employees/page.js
│   │   │   │   ├── departments/page.js
│   │   │   │   ├── questions/page.js
│   │   │   │   ├── audit/page.js
│   │   │   │   ├── org/page.js
│   │   │   │   ├── hr-committee/page.js
│   │   │   │   ├── employees-removed/page.js
│   │   │   │   └── employees-history/page.js
│   │   │   ├── global/
│   │   │   │   ├── quarter/page.js
│   │   │   │   └── hr-committee/page.js
│   │   │   └── branches/page.js
│   │   ├── branch-manager/page.js
│   │   ├── hod/page.js
│   │   ├── cluster-manager/page.js
│   │   ├── hr/page.js
│   │   ├── committee/page.js
│   │   └── employee/page.js
│   ├── login/                  Login page
│   ├── unauthorized/page.js    403 page
│   ├── error.js                Global error boundary
│   ├── not-found.js            404 page
│   └── loading.js              Root loading skeleton
├── components/
│   ├── DashboardShell.js       Main layout (sidebar + topbar + content)
│   ├── EvaluationForm.js       Generic evaluation form component
│   ├── TimedEvaluationForm.js  Time-limited evaluation form
│   ├── NotificationBell.js     Notification icon + unread count
│   ├── ConfirmDialog.js        Confirmation modal
│   ├── Skeleton.js             Loading skeletons
│   ├── UserProfileCard.js      Profile display card
│   ├── shell/
│   │   ├── Sidebar.jsx         Role-aware collapsible sidebar
│   │   └── TopBar.jsx          Top bar (quarter name, logout)
│   ├── admin/
│   │   └── BranchSideNav.jsx   Secondary nav for admin branch views
│   └── ui/
│       ├── Icons.jsx           All icon components
│       ├── index.jsx           Stat, Alert, Button, Card exports
│       └── tokens.js           Design tokens (colors, spacing, typography)
├── lib/
│   ├── auth.ts                 JWT sign/verify utilities (jose HS256)
│   ├── withRole.js             RBAC higher-order function (wraps route handlers)
│   ├── api-response.js         HTTP response helpers (ok, fail, unauthorized, …)
│   ├── validators.js           Zod schemas for all request bodies
│   ├── sanitize.js             XSS/injection sanitization (applied in validateBody)
│   ├── rate-limit.js           In-memory sliding-window rate limiter
│   ├── http.js                 getClientIp, withDbRetry (exponential backoff)
│   ├── prisma.ts               Prisma singleton client
│   ├── scoreCalculator.ts      Score normalization + stage weighting formulas
│   ├── branchRules.ts          Stage-wise shortlist limits per branch type
│   ├── department-rules.js     Small-department auto-winner cases (4 cases)
│   ├── shortlistManager.ts     Stage-transition shortlist update functions
│   ├── questionAssigner.js     Per-employee randomized question assignment
│   ├── notifications.js        createNotification, notifyAllEmployees
│   ├── dashboardNav.js         Role-aware sidebar nav structure
│   ├── resolveBranch.js        Resolve branch by ID or slug
│   └── auth/
│       ├── requireBranchScope.js     Branch access guard for URL routes
│       ├── resolveScopeBranch.js     Verify JWT branchId against assignment tables
│       ├── defaultPassword.js        Generate default plain-text passwords
│       ├── applyStaffPassword.js     Hash and apply staff default password
│       ├── bmAssignment.js           BM uniqueness validation + atomic assignment
│       └── bulkUploadDemotionGuard.js  Detect role-holder conflicts in upload
├── prisma/
│   ├── schema.prisma           25 models, 7 enums, 11 migrations applied
│   ├── seed.ts                 Seed script (requires ALLOW_FULL_SEED=1 env var)
│   ├── migrations/             11 sequential migration files
│   └── seed-data/
│       ├── employees1-4.ts     287 employee records (split across 4 files)
│       ├── departments.ts      16 department definitions
│       ├── roleMappings.ts     39 role assignment records
│       └── questions.ts        Question bank (SELF, BRANCH_MANAGER, CLUSTER_MANAGER levels)
├── scripts/
│   ├── run-bulk-uploads.js     CLI: import employees from Excel per branch
│   └── sync-question-bank.js  CLI: idempotent sync of question bank from seed file
├── public/
│   ├── hero.png
│   └── logo.png
├── middleware.ts               JWT verification + header injection (runs on all requests)
├── next.config.js              Security headers, image optimization config
├── .env.example                Template for required environment variables
└── package.json                Dependencies + npm scripts
```

---

### Auth Pipeline

```
Incoming Request
    │
    ▼
middleware.ts
    ├─ Is PUBLIC_PATH? (login, /api/auth/*, /api/health) → pass through
    ├─ Is static asset? → pass through
    ├─ Extract JWT from cookie or Authorization header
    ├─ jose.jwtVerify() with JWT_SECRET
    ├─ On FAIL → 401 JSON (API) or redirect /login (pages)
    └─ On SUCCESS → inject headers:
         x-user-id, x-user-role, x-user-empcode,
         x-user-branch-id, x-user-branch-type,
         x-user-department-id, x-user-department-ids
    │
    ▼
Route Handler
    │
    ▼
withRole(allowedRoles, handler)          [lib/withRole.js]
    ├─ Read x-user-role header
    ├─ Role not in allowedRoles → 403
    └─ Pass user context {userId, role, empCode, branchId, branchType,
                          departmentId, departmentIds} to handler
    │
    ▼
requireBranchScope() or resolveScopeBranch()   [lib/auth/]
    ├─ ADMIN: branchId from URL [branchId] param
    ├─ BM: branchId from JWT (validated against BranchManagerAssignment)
    ├─ CM/HR/COMMITTEE: branchId from JWT (validated against assignment table)
    └─ HOD/EMPLOYEE: branchId from User.department.branchId
    │
    ▼
Business logic + Prisma queries
    │
    ▼
AuditLog (fire-and-forget)
    │
    ▼
Response (ok/fail/unauthorized/…)
```

---

### API Route Groups Summary

| Group | Prefix | Roles |
|-------|--------|-------|
| Auth | `/api/auth/*` | Public / all roles |
| Admin | `/api/admin/*` | ADMIN only (some: ADMIN + HR_ALLOWED empCodes) |
| Branch Manager | `/api/branch-manager/*` | BRANCH_MANAGER |
| HOD | `/api/hod/*` | HOD |
| Cluster Manager | `/api/cluster-manager/*` | CLUSTER_MANAGER |
| HR | `/api/hr/*` | HR |
| Committee | `/api/committee/*` | COMMITTEE |
| Assessment | `/api/assessment/*` | EMPLOYEE |
| Employee | `/api/employee/*` | EMPLOYEE |
| Notifications | `/api/notifications/*` | All authenticated |
| User | `/api/user/*` | All authenticated |
| Health | `/api/health` | Public |

---

### Database

- **Engine:** PostgreSQL
- **ORM:** Prisma 5.16.0 (`prisma/schema.prisma`)
- **Models:** 25 total (see Section 7 for full list)
- **Migrations:** 11 applied (oldest: 2026-02-26 initial schema)
- **Singleton client:** `lib/prisma.ts` (dev reuse pattern, prod logs errors only)

---

### Shared Utilities Quick Reference

| File | Key exports |
|------|-------------|
| `lib/api-response.js` | `ok`, `created`, `fail`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `serverError`, `validateBody`, `withErrorHandler` |
| `lib/validators.js` | Zod schemas: `loginSchema`, `submitAssessmentSchema`, `evaluateSchema`, `startQuarterSchema`, `createQuestionSchema`, `branchEvalConfigSchema`, `assignHodSchema`, `hrEvaluateSchema`, `collarTypeSchema`, … |
| `lib/scoreCalculator.ts` | `normalizeScore`, `calculateBranchStage2Score`, `getBranchLimits` |
| `lib/branchRules.ts` | `getBranchLimits`, `getStage1CutoffPct`, `getBigBranchCollarLimits` |
| `lib/department-rules.js` | `getDepartmentSize`, `logSmallDepartmentRule` |
| `lib/shortlistManager.ts` | `updateBranchStage1Shortlist`, `updateStage1Shortlist` (legacy) |
| `lib/notifications.js` | `createNotification`, `notifyAllEmployees` |
| `lib/auth.ts` | `signToken`, `signRefreshToken`, `verifyToken`, `signBranchSelectToken`, `signRoleSelectToken` |

---

## 3. Business Rules

### 3.1 Login Rules

**EMPLOYEE / ADMIN (single-step):**
- Submit empCode + password → validate against `User.password` (bcrypt) → issue `accessToken` (8h) + `refreshToken` (7d).

**CM / HR / COMMITTEE (two-step branch pick):**
- Same empCode + password validation.
- If user has exactly 1 branch assignment → skip picker, issue JWT directly.
- If user has 2+ branch assignments → issue short-lived `branchSelectToken` (5 min) → user POSTs to `/api/auth/select-branch` with chosen branch → full JWT issued.
- JWT contains `branchId`; validated against assignment table on every request via `resolveScopeBranch()`.

**HOD dual-password (big branches):**
- Primary password = `User.password` (bcrypt of empCode) → role = `EMPLOYEE`.
- Secondary password = `User.passwordHod` (bcrypt of `Firstname_##`) → role = `HOD` (only if active `HodAssignment` exists).
- Login route tries primary first; if that succeeds and `passwordHod` is set and HOD assignment is active, the user may also authenticate as HOD.

**ADMIN + HOD (two-step role pick):**
- Login with HOD secondary password → both ADMIN and HOD are valid → issue `roleSelectToken` (5 min) → user picks role → full JWT issued.

---

### 3.2 Default Password Rules

| User type | Default plain-text password | Formula |
|-----------|----------------------------|---------|
| EMPLOYEE | empCode (verbatim) | — |
| BM / CM / HR / COMMITTEE / ADMIN | `Firstname_##` | First name (from full name split) + underscore + last 2 chars of empCode |
| HOD secondary (`passwordHod`) | Same as staff formula | `Firstname_##` |

Implemented in `lib/auth/defaultPassword.js`. Hashed with bcrypt (10 rounds) via `lib/auth/applyStaffPassword.js`.

**Fallback:** If name parsing fails, empCode is used as the plain-text password.

---

### 3.3 Evaluation Stage Limits

#### Big Branch
| Collar | After Stage 1 (cutoff) | Stage 2 → 3 limit | Stage 3 → 4 limit | Stage 4 → Final limit |
|--------|----------------------|------------------|------------------|----------------------|
| WHITE_COLLAR | Top 50% | Top 3 | Top 2 | Top 1 |
| BLUE_COLLAR | Top 50% | Top 10 | Top 5 | Top 3 |

#### Small Branch (all collars)
| Stage 2 → 3 | Stage 3 → 4 | Stage 4 → Final |
|------------|------------|----------------|
| Top 10 | Top 5 | Top 3 |

Limits can be overridden per branch per quarter via `BranchEvalConfig`.
Source: `lib/branchRules.ts` + `BranchEvalConfig` DB table.

---

### 3.4 Stage 1 Cutoff

- Default: top 50% of employees by `SelfAssessment.normalizedScore`.
- Overridable: `BranchEvalConfig.stage1CutoffPct` (float, e.g., `0.5` = 50%).

---

### 3.5 Small-Department Rules (legacy department-level)

Applies when department-level evaluation is used (legacy path, now superseded by branch-level shortlists):

| Dept employee count | Stage 1 limit | Stage 2 limit | Stage 3 limit |
|--------------------|--------------|--------------|--------------|
| ≥ 10 | Top 10 | Top 5 | Top 3 |
| 5–9 | All | Top 5 | Top 3 |
| 3–4 | All | All | Top 3 |
| 2 | All | All | All |
| 1 | Auto-winner — declared at quarter start | — | — |

Source: `lib/department-rules.js`.

---

### 3.6 Auto-Winner Rule

When a department has exactly 1 EMPLOYEE:
- Declared best employee automatically at `POST /api/admin/quarters/start`.
- Logged to `AuditLog` with action `AUTO_WINNER_SINGLE_EMPLOYEE`.
- Employee receives notification.
- No evaluation forms are shown to that employee.

---

### 3.7 Score Weighting

**Stage 2 combined score:**
```
combinedScore = (selfNormalizedScore × 0.60) + (evaluatorNormalizedScore × 0.40)
```

**Stage 3 and onwards:** CM contribution is added as an additional weighted layer.
Exact weights stored per evaluation record in the `*Contribution` fields.

Normalization: `normalizedScore = Math.round((rawScore / maxScore) * 100 × 100) / 100`

---

### 3.8 Branch Manager Uniqueness

- One BM per branch (enforced by `BranchManagerAssignment.branchId @unique`).
- One branch per BM (enforced by `BranchManagerAssignment.bmUserId @unique`).
- Atomic assignment + demotion of previous BM handled in `lib/auth/bmAssignment.js`.

---

### 3.9 Cluster Manager / HR / COMMITTEE Scoping

- CM: one CM per branch (`ClusterManagerBranchAssignment.branchId @unique`); a CM can oversee multiple branches via multiple rows.
- HR / COMMITTEE: many-to-many via `HrBranchAssignment` and `CommitteeBranchAssignment`.
- On login: if multiple assignments exist, branch picker shown; chosen branchId stored in JWT.
- On each request: JWT branchId validated against the assignment table by `resolveScopeBranch()`.

---

### 3.10 HOD Assignment Rules (Big Branches Only)

- Only available when `Branch.branchType === "BIG"`.
- HOD must be a WHITE_COLLAR employee in the same branch.
- HOD evaluates BLUE_COLLAR employees in their assigned department.
- BM assigns HOD via `POST /api/branch-manager/hod/assign`.
- Assignment creates: `HodAssignment` row + `DepartmentRoleMapping(role=HOD)` row.
- If HOD assigned while user role is `EMPLOYEE`, User.role is promoted to `HOD`.
- `User.passwordHod` is generated if not already set.
- One HOD per department per quarter (composite unique: `hodUserId + departmentId + quarterId`).

---

### 3.11 Bulk Upload Safety Rules

- **ADMIN users:** never overwritten or demoted regardless of mode.
- **BM / CM / HR / COMMITTEE role-holders in the sheet:**
  - Merge mode: entire upload is **rejected** (`findRoleHolderConflicts()` check).
  - Replace mode: those rows are **silently skipped**.
- **Replace mode only:** employees not present in the sheet are archived to `ArchivedEmployee` and deleted from `User`.
- Department resolution: tries exact match → suffix variant → same-name fallback (merge) → creates new.
- Default password for uploaded employees: `empCode` (set during import).

---

### 3.12 Admin-Only Employee Creation

Hardcoded in `app/api/admin/employees/route.js`:
```js
const HR_ALLOWED = ["1800349", "5100029"]; // Rishpal Kumawat, Chetan Singh Bhati
```
Only these empCodes can POST to create new individual employees via the admin panel.

---

### 3.13 Quarter Start Is Not Idempotent

Calling `POST /api/admin/quarters/start` twice will attempt to:
- Create duplicate `Quarter` records (blocked by `Quarter.name @unique`).
- Attempt to re-assign questions to employees (may create duplicate `EmployeeQuarterQuestions` rows if constraint is not enforced upstream).

Never call quarter start more than once per quarter name.

---

### 3.14 Token Lifecycle

- Access token: 8 hours (HS256, signed with `JWT_SECRET`).
- Refresh token: 7 days.
- Branch-select token: 5 minutes (short-lived, one-time use).
- Role-select token: 5 minutes.
- Logout: token added to `BlacklistedToken` table; middleware checks blacklist.
- Blacklist cleanup: `POST /api/admin/maintenance/prune-blacklist` removes expired entries (must be called periodically; no automatic cleanup).

---

## 4. Current System State

### Working (confirmed from code)

- Login / auth flow (single-step, two-step branch pick, two-step role pick)
- JWT middleware (token verification, header injection)
- Employee bulk import from Excel (multi-tab and single-tab)
- Quarter start/close lifecycle
- Per-employee randomized question assignment
- Self-assessment submission and scoring
- BM evaluation (Stage 2)
- HOD evaluation on big branches (Stage 2, blue collar)
- CM evaluation (Stage 3)
- HR evaluation with PDF upload to Vercel Blob (Stage 4)
- Committee results view
- Admin branch/employee/department CRUD
- Role assignment (BM, CM, HR, COMMITTEE, HOD)
- Notifications (creation + in-app bell)
- Audit logging on all critical actions
- BranchShortlistStage1–4 pipeline
- BranchBestEmployee records
- ArchivedEmployee history
- EmployeeAssignmentHistory audit trail
- Password reset (admin-initiated)
- Rate limiting on login (per-IP and per-empCode)
- XSS sanitization on all request bodies

### Partial / Needs Verification

- HOD orphaned employee fallback: if a HOD assignment is removed mid-quarter, BLUE_COLLAR employees in that department are supposed to revert to BM evaluation. The code path for this transition needs tracing.
- `BranchEvalConfig` override: `branchRules.ts` has hardcoded limits; it is not fully confirmed that every evaluation route checks `BranchEvalConfig` before applying limits.
- `BLOB_READ_WRITE_TOKEN` env var: referenced in Vercel Blob API calls but not listed in `.env.example`. Required for HR PDF uploads.
- Vitest test coverage: which files have tests is unknown without running `npm test`.

### Legacy / Deprecated (kept in schema, not active)

- `SupervisorEvaluation` table — legacy Stage 2 supervisor path (replaced by BM/HOD paths)
- `BestEmployee` table — department-level best employee (replaced by `BranchBestEmployee`)
- `ShortlistStage1`, `ShortlistStage2`, `ShortlistStage3` tables — department-level shortlists (replaced by `BranchShortlistStage1–4`)
- `SUPERVISOR` role — in the `Role` enum but no active routes use it
- `Department.branchManagerId`, `Department.supervisorId` — legacy FK fields, no longer used

### High-Risk / Do Not Touch Carelessly

| File / Area | Risk |
|------------|------|
| `app/api/auth/login/route.js` | Dual-password + multi-branch login flows; any change can lock users out |
| `middleware.ts` | All requests flow through it; bugs here break the entire app |
| `lib/auth/bmAssignment.js` | Atomic BM assignment with uniqueness constraints; non-atomic changes create data corruption |
| `app/api/admin/quarters/start/route.js` | Quarter start is not idempotent; auto-winner logic is irreversible |
| `lib/shortlistManager.ts` | Stage transitions cascade; incorrect rank updates corrupt the pipeline |
| `app/api/admin/branches/[branchId]/employees/bulk-upload/route.js` | Replace mode archives employees; a bug can permanently delete data |
| `prisma/schema.prisma` | Any migration must be carefully reviewed; some @unique constraints are load-bearing |

---

## 5. File-by-File Map

### Authentication & Access Control

#### `middleware.ts`
- **Purpose:** Request-level JWT verification. Runs on every non-public route.
- **Why it matters:** The only place where the JWT is verified and user context is injected as request headers. If this breaks, no protected route works.
- **Caution:** PUBLIC_PATHS list is hardcoded. Adding a new public route requires updating this list. Any header name change here must also be updated in `withRole.js`.

#### `lib/auth.ts`
- **Purpose:** JWT sign/verify utilities using `jose` (HS256). Issues access tokens (8h), refresh tokens (7d), branch-select tokens (5m), role-select tokens (5m).
- **Why it matters:** Central token factory. All login variants call functions here.
- **Caution:** Token payload shape is consumed by middleware and `withRole`. Any payload field rename is a breaking change.

#### `lib/withRole.js`
- **Purpose:** Higher-order function that wraps API route handlers with role-based access control. Reads `x-user-role` header set by middleware.
- **Why it matters:** Every protected API route is wrapped in this. It also injects the `user` context object into handlers.
- **Caution:** The `allowedEmpCodes` bypass in some admin routes (HR_ALLOWED) is a secondary check — if a user passes role check but not empCode check, they still get 403.

#### `lib/auth/requireBranchScope.js`
- **Purpose:** Validates that the user has access to the branchId in the URL. ADMIN reads from URL; others from JWT.
- **Why it matters:** Prevents cross-branch data access via URL tampering.
- **Caution:** If a new role is added, this guard must be updated to handle branch resolution for that role.

#### `lib/auth/resolveScopeBranch.js`
- **Purpose:** For multi-branch roles (CM/HR/COMMITTEE), verifies JWT `branchId` against the assignment table on every request.
- **Why it matters:** Prevents stale or forged tokens from accessing a branch the user was removed from.
- **Caution:** This runs on every CM/HR/COMMITTEE request — a database performance bottleneck if not indexed correctly. Assignment tables are indexed on `branchId`.

#### `lib/auth/defaultPassword.js`
- **Purpose:** Generates default plain-text passwords. `defaultPasswordFor(user)` → empCode for employees, `Firstname_##` for staff.
- **Why it matters:** All initial passwords and HOD secondary passwords are derived here.
- **Caution:** The name parsing (`firstName = name.split(' ')[0]`) will produce unexpected results for names with leading/trailing spaces. Fallback to empCode exists.

#### `lib/auth/applyStaffPassword.js`
- **Purpose:** Hashes the staff default password with bcrypt (10 rounds) and writes it to `User.password`.
- **Why it matters:** Called when BM/CM/HR/COMMITTEE/ADMIN accounts are created or reassigned.
- **Caution:** This hashes synchronously in request context — 10 bcrypt rounds can be slow under load.

#### `lib/auth/bmAssignment.js`
- **Purpose:** Validates BM uniqueness constraints and performs atomic BM assignment (clears previous BM, promotes new BM).
- **Why it matters:** `BranchManagerAssignment` has `@unique` on both `bmUserId` and `branchId`. Non-atomic operations outside this helper can violate constraints.
- **Caution:** `assertBmAssignable()` must be called before `applyBmAssignment()`. Do not bypass.

#### `lib/auth/bulkUploadDemotionGuard.js`
- **Purpose:** Scans employees in a bulk upload sheet for role-holder conflicts (BM/CM/HR/COMMITTEE).
- **Why it matters:** Prevents accidental demotion of evaluators during import.
- **Caution:** Only checks by empCode. If an employee's empCode in the sheet does not match what is in the DB, the guard will not trigger.

---

### Auth API Routes

#### `app/api/auth/login/route.js`
- **Purpose:** Main login handler. Validates empCode + password. Handles dual-password HOD, multi-branch picker, admin+HOD role picker.
- **Why it matters:** Entry point for all users. Contains the most complex authentication logic.
- **Caution:** Rate-limited (20 attempts/IP, 8 per empCode). Any error in the HOD/multi-branch flows will silently fall back to EMPLOYEE login — test both paths after changes.

#### `app/api/auth/select-branch/route.js`
- **Purpose:** Second step for CM/HR/COMMITTEE with multiple branch assignments. Validates `branchSelectToken` + chosen `branchId` → issues full JWT.
- **Caution:** Validates that the user's chosen branchId exists in their assignment table at the time of selection (not just at login). Stale assignments trigger 403.

#### `app/api/auth/select-role/route.js`
- **Purpose:** Second step for ADMIN+HOD role selection. Validates `roleSelectToken` → issues JWT with chosen role.
- **Caution:** Verifies HOD assignment is still active before issuing HOD-role JWT.

---

### Admin API Routes

#### `app/api/admin/quarters/start/route.js`
- **Purpose:** Initializes a new quarter. Assigns questions, declares auto-winners, sends notifications.
- **Why it matters:** Quarter start is a one-way operation that bootstraps the entire evaluation pipeline.
- **Caution:** Not idempotent. Question assignment to employees happens here. Auto-winner declaration is irreversible. Do not call twice.

#### `app/api/admin/quarters/close/route.js`
- **Purpose:** Closes the active quarter; results become visible.
- **Caution:** Once closed, `Quarter.status` cannot be re-opened via the UI (no revert route confirmed).

#### `app/api/admin/branches/[branchId]/employees/bulk-upload/route.js`
- **Purpose:** Import employees from Excel. Two modes: merge (upsert) and replace (upsert + archive missing).
- **Caution:** Replace mode permanently archives employees not in the sheet. The demotion guard must pass before any write occurs. Test merge vs replace separately.

---

### Evaluation Routes

#### `app/api/branch-manager/evaluate/route.js`
- **Purpose:** BM submits Stage-2 evaluation for a shortlisted employee.
- **Caution:** Must check branchType to route WC/BC correctly. After all targets are evaluated, triggers Stage-2 shortlist promotion.

#### `app/api/branch-manager/hod/assign/route.js`
- **Purpose:** BM assigns a HOD to a department for a quarter (BIG branches only).
- **Caution:** Returns 403 for SMALL branches. Generates `passwordHod` if not set. Creates both `HodAssignment` and `DepartmentRoleMapping` rows.

#### `app/api/hod/evaluate/route.js`
- **Purpose:** HOD submits Stage-2 evaluation for blue-collar employees (BIG branches only).
- **Caution:** Only valid for BIG branches. HOD must have an active `HodAssignment` for the employee's department.

#### `app/api/cluster-manager/evaluate/route.js`
- **Purpose:** CM submits Stage-3 evaluation for Stage-2 shortlisted employees.
- **Caution:** CM must be assigned to the employee's branch (verified via assignment table).

#### `app/api/hr/evaluate/route.js`
- **Purpose:** HR submits Stage-4 data (attendance %, working hours, PDFs).
- **Status:** Confirm whether this is the active HR path or the legacy supervisor path.

#### `app/api/assessment/submit/route.js`
- **Purpose:** Employee submits self-assessment. Calculates and stores normalized score. Updates Stage-1 shortlist ranking.
- **Caution:** `(userId, quarterId)` unique constraint prevents double submission. Shortlist recalculation fires after each submission — performance impact at scale.

---

### Scoring & Business Logic

#### `lib/scoreCalculator.ts`
- **Purpose:** All score math: normalization, stage weighted combinations.
- **Why it matters:** Used by every evaluation submission route. Wrong math here corrupts all stage rankings.
- **Caution:** Floating-point rounding (`Math.round(x * 100) / 100`) is used consistently — do not change the rounding approach without updating all consumers.

#### `lib/branchRules.ts`
- **Purpose:** Returns stage-wise shortlist limits per branch type and collar type.
- **Why it matters:** Consumed by shortlist manager and evaluation routes to determine cutoffs.
- **Caution:** Hardcoded limits exist here. `BranchEvalConfig` can override them — verify that evaluation routes actually call `getBranchLimits()` (which presumably checks `BranchEvalConfig`) rather than using hardcoded values directly.

#### `lib/department-rules.js`
- **Purpose:** Implements the 4-case small-department rule for auto-winner and limit decisions.
- **Caution:** This is the legacy department-level path. The active branch-level path uses `branchRules.ts`.

#### `lib/shortlistManager.ts`
- **Purpose:** Recalculates and upserts `BranchShortlistStage*` records after each evaluation.
- **Why it matters:** Stage transitions depend entirely on this. A bug here stalls the pipeline.
- **Caution:** Both a branch-level (`updateBranchStage1Shortlist`) and a legacy department-level function exist. Ensure the correct one is called.

#### `lib/questionAssigner.js`
- **Purpose:** Assigns a randomized subset of SELF-level questions to each employee at quarter start.
- **Caution:** Category-balance logic (spread questions across categories) is embedded here. If question bank is too small in a category, assignment may fail or repeat questions.

---

### Data Layer

#### `prisma/schema.prisma`
- **Purpose:** Single source of truth for the database schema. 25 models, 7 enums.
- **Why it matters:** Every model, field, constraint, and index is defined here.
- **Caution:** Several `@unique` constraints are load-bearing (BM, CM assignment). Migrations run with `prisma db push --accept-data-loss` in the build script — this can silently drop data on column changes.

#### `prisma/seed.ts`
- **Purpose:** Seeds the database with initial branch, departments, employees, and questions.
- **Caution:** Requires `ALLOW_FULL_SEED=1` env var. Without it, the script is a no-op. TRUNCATEs users/departments/branches before seeding — do not run in production.

#### `scripts/run-bulk-uploads.js`
- **Purpose:** CLI script to import employees from Excel files (alternative to the web UI upload).
- **Caution:** Uses flexible column detection. Location filter must match branch name correctly.

#### `scripts/sync-question-bank.js`
- **Purpose:** Idempotent sync of question bank from seed file to DB. Deactivates DB questions not in seed (unless used in an active quarter).
- **Caution:** Never deactivates legacy `SUPERVISOR` / `HOD` / `HR` level questions.

---

### Frontend

#### `components/DashboardShell.js`
- **Purpose:** Main layout wrapper for all protected pages. Renders Sidebar + TopBar + content area.
- **Caution:** Passes `user` object (including `role`) to Sidebar. Sidebar uses role to pick the nav group from `lib/dashboardNav.js`. If a new role is added, both `dashboardNav.js` and `Sidebar.jsx` must be updated.

#### `components/shell/Sidebar.jsx`
- **Purpose:** Role-aware collapsible sidebar navigation. Reads nav config from `lib/dashboardNav.js`.
- **Caution:** Sidebar state (collapsed/expanded) is stored in `localStorage`. Mobile: iOS safe-area insets are applied.

#### `components/shell/TopBar.jsx`
- **Purpose:** Top navigation bar showing current quarter name and logout button.

#### `components/EvaluationForm.js`
- **Purpose:** Shared evaluation form used across BM, HOD, CM, and self-assessment flows.
- **Caution:** Form behavior may differ based on props passed. Verify correct question set is loaded for each evaluator type.

#### `lib/dashboardNav.js`
- **Purpose:** Defines sidebar navigation structure per role (URL + label + icon per item).
- **Caution:** Must stay in sync with actual page paths under `app/dashboard/`. Adding a page without adding a nav entry leaves it unreachable from the sidebar.

---

## 6. Commands and Setup

### Install
```bash
npm install
# postinstall automatically runs: prisma generate
```

### Development
```bash
npm run dev
# Starts Next.js dev server at http://localhost:3000
```

### Build (Production)
```bash
npm run build
# Equivalent to: prisma generate && prisma db push --accept-data-loss && next build
# WARNING: db push --accept-data-loss can drop columns silently
```

### Start (Production)
```bash
npm start
```

### Test
```bash
npm test
# Runs: vitest run
```

### Lint
```bash
npm run lint
# Runs: next lint (ESLint with next/core-web-vitals)
# Note: ESLint build errors are ignored during build (ignoreDuringBuilds: true in next.config.js)
```

### Database — Generate Prisma Client
```bash
npm run prisma:generate
# or: npx prisma generate
```

### Database — Run Migrations
```bash
npm run prisma:migrate
# or: npx prisma migrate deploy
```

### Database — Push Schema (dev only)
```bash
npx prisma db push
# WARNING: Can drop data. Use migrate for production.
```

### Database — Studio (GUI)
```bash
npm run prisma:studio
# Opens Prisma Studio at http://localhost:5555
```

### Seed Database
```bash
ALLOW_FULL_SEED=1 npm run seed
# DANGER: TRUNCATEs users/departments/branches before seeding.
# Never run in production against real data.
```

### Sync Question Bank
```bash
node scripts/sync-question-bank.js
```

### Bulk Upload Employees from Excel
```bash
node scripts/run-bulk-uploads.js
```

---

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Pooled PostgreSQL connection string (e.g., `pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | Yes | Direct PostgreSQL connection (used by Prisma migrations) |
| `JWT_SECRET` | Yes | HS256 signing secret. Long random string (32+ chars recommended) |
| `NODE_ENV` | Yes | `production` or `development` |
| `NEXTAUTH_URL` | Yes | Canonical URL of the app (e.g., `https://yourapp.vercel.app`) — used for cookie domain |
| `BLOB_READ_WRITE_TOKEN` | Likely required | Vercel Blob API token for PDF uploads. Not in `.env.example` — **needs verification** |

Template: `.env.example`

---

### External Services

| Service | Purpose | SDK |
|---------|---------|-----|
| PostgreSQL | Primary database | Prisma 5 |
| Vercel Blob | HR evaluation PDF storage | `@vercel/blob` |

No external email, SMS, or OAuth services are used.

---

## 7. Data Model Explanation

### Core Organizational Entities

```
Branch (branches)
  ├─ id, name, slug, location
  ├─ branchType: SMALL | BIG
  └─ Has many: Department, BranchManagerAssignment,
               ClusterManagerBranchAssignment, HrBranchAssignment,
               CommitteeBranchAssignment, HodAssignment,
               BranchShortlistStage1–4, BranchBestEmployee, BranchEvalConfig

Department (departments)
  ├─ id, name, branchId (FK → Branch)
  ├─ collarType: WHITE_COLLAR | BLUE_COLLAR  ← default for employees in this dept
  └─ Has many: User (employees), HodAssignment, DepartmentRoleMapping

User (users)
  ├─ id, empCode (unique), name, password, passwordHod (nullable)
  ├─ role: EMPLOYEE | HOD | BRANCH_MANAGER | CLUSTER_MANAGER | HR | COMMITTEE | ADMIN
  ├─ departmentId (FK → Department, nullable — not set for BM/CM/HR/COMMITTEE)
  ├─ branchId (FK → Branch, nullable — set for BM/CM/HR/COMMITTEE scope)
  ├─ collarType (nullable — overrides Department.collarType when set)
  ├─ designation, mobile
  └─ Has many: SelfAssessment, evaluations, shortlist entries, assignments
```

### Evaluation Period

```
Quarter (quarters)
  ├─ id, name (unique, e.g., "Q1-2025"), status: ACTIVE | CLOSED
  ├─ startDate, endDate
  ├─ questionCount (SELF), bmQuestionCount, hodQuestionCount, cmQuestionCount
  └─ Has many: QuarterQuestion, SelfAssessment, all evaluations, all shortlists

Question (questions)
  ├─ id, text (English), textHindi
  ├─ category: ATTENDANCE | DISCIPLINE | PRODUCTIVITY | TEAMWORK | INITIATIVE | COMMUNICATION | INTEGRITY
  ├─ level: SELF | HOD | BRANCH_MANAGER | CLUSTER_MANAGER | HR  (SUPERVISOR deprecated)
  └─ isActive: boolean (soft activation flag)

QuarterQuestion (quarter_questions)
  └─ Links Question ↔ Quarter (locked set for the quarter)
     Composite unique: (quarterId, questionId)

EmployeeQuarterQuestions (employee_quarter_questions)
  └─ Per-employee randomized subset of questions
     Fields: employeeId, quarterId, questionId, orderIndex
     Composite unique: (employeeId, quarterId, questionId)
```

### Evaluation Records

```
SelfAssessment (self_assessments)
  ├─ userId, quarterId → composite unique
  ├─ answers (JSON: {questionId: score})
  ├─ rawScore, maxScore, normalizedScore
  └─ completionTimeSeconds, submittedAt

BranchManagerEvaluation (branch_manager_evaluations)
  ├─ managerId (BM), employeeId, quarterId → composite unique
  ├─ answers (JSON)
  ├─ selfContribution, supervisorContribution (legacy), bmRawScore, bmNormalized, bmContribution
  └─ stage3CombinedScore, submittedAt

HodEvaluation (hod_evaluations)
  ├─ hodId, employeeId, quarterId → composite unique
  ├─ answers (JSON)
  ├─ selfContribution, hodRawScore, hodNormalized, hodContribution
  └─ stage2CombinedScore, submittedAt

ClusterManagerEvaluation (cluster_manager_evaluations)
  ├─ clusterId (CM), employeeId, quarterId → composite unique
  ├─ answers (JSON)
  ├─ selfContribution, supervisorContribution, bmContribution, cmRawScore, cmNormalized, cmContribution
  └─ finalScore, submittedAt

HrEvaluation (hr_evaluations)
  ├─ hrUserId, employeeId, quarterId → composite unique
  ├─ attendancePct, workingHours
  ├─ referenceSheetUrl, attendancePdfUrl, punctualityPdfUrl (Vercel Blob)
  ├─ hrScore, selfContribution, evaluatorContribution, cmContribution, hrContribution
  └─ stage4CombinedScore, submittedAt

SupervisorEvaluation (supervisor_evaluations)  ← DEPRECATED
  └─ Legacy; kept for historical queries only
```

### Shortlist Pipeline (Active — branch-level)

```
BranchShortlistStage1 (branch_shortlist_stage1)
  ├─ userId, quarterId, branchId, collarType
  ├─ selfScore, rank
  └─ Composite unique: (userId, quarterId)

BranchShortlistStage2 (branch_shortlist_stage2)
  ├─ userId, quarterId, branchId, collarType
  ├─ selfScore, evaluatorScore, combinedScore, rank
  └─ Composite unique: (userId, quarterId)

BranchShortlistStage3 (branch_shortlist_stage3)
  ├─ userId, quarterId, branchId, collarType
  ├─ selfScore, evaluatorScore, cmScore, combinedScore, rank
  └─ Composite unique: (userId, quarterId)

BranchShortlistStage4 (branch_shortlist_stage4)
  ├─ userId, quarterId, branchId, collarType
  ├─ selfScore, evaluatorScore, cmScore, hrScore
  ├─ attendancePct, workingHours, referenceSheetUrl, attendancePdfUrl, punctualityPdfUrl
  ├─ combinedScore, rank
  └─ Composite unique: (userId, quarterId)

BranchBestEmployee (branch_best_employees)
  ├─ userId, quarterId, branchId, collarType
  └─ finalScore + all contributing scores

ShortlistStage1/2/3 + BestEmployee (dept-level)  ← DEPRECATED
```

### Assignment Tables

```
BranchManagerAssignment (bm_branch_assignments)
  ├─ bmUserId @unique → one branch per BM
  └─ branchId @unique → one BM per branch

ClusterManagerBranchAssignment (cm_branch_assignments)
  ├─ (cmUserId, branchId) composite unique
  └─ branchId @unique → one CM per branch

HrBranchAssignment (hr_branch_assignments)
  └─ (hrUserId, branchId) composite unique

CommitteeBranchAssignment (committee_branch_assignments)
  └─ (memberUserId, branchId) composite unique

HodAssignment (hod_assignments)
  ├─ hodUserId, branchId, departmentId, quarterId
  └─ Composite unique: (hodUserId, departmentId, quarterId)

EmployeeHodAssignment (employee_hod_assignments)
  ├─ hodUserId, employeeId, quarterId
  └─ Composite unique: (employeeId, quarterId) — one HOD per employee per quarter

DepartmentRoleMapping (department_role_mappings)
  ├─ userId, departmentId, role
  └─ Composite unique: (userId, departmentId, role)
```

### Configuration

```
BranchEvalConfig (branch_eval_configs)
  ├─ branchId, quarterId → composite unique
  ├─ stage1CutoffPct (float, default 0.5)
  └─ stage2Limit, stage3Limit, stage4Limit (integers)
```

### Audit & History

```
AuditLog (audit_logs)
  ├─ userId, action (string), details (JSON), ipAddress
  └─ Indexed on: userId, action, createdAt

EmployeeAssignmentHistory (employee_assignment_history)
  ├─ Denormalized snapshots of role/dept/branch before change
  ├─ userId FK uses SetNull (history survives employee deletion)
  └─ oldRole, newRole, oldDepartmentName, newDepartmentName, oldBranchName, newBranchName

ArchivedEmployee (archived_employees)
  ├─ Snapshot of employee at time of removal
  ├─ reasonLeaving, removalDate, archivedBy
  └─ originalUserId (nullable reference to former User.id)
```

### Utility Tables

```
Notification (notifications)
  ├─ userId, message, isRead
  └─ Indexed on: (userId, isRead), (userId, createdAt)

BlacklistedToken (blacklisted_tokens)
  ├─ token @unique, expiresAt
  └─ Used for logout invalidation; must be pruned periodically
```

---

## 8. Known Pitfalls

### P1 — Branch Leakage (Multi-Branch Roles)
CM/HR/COMMITTEE users can have multiple branch assignments. Their JWT contains a single `branchId` chosen at login. If a route only checks the JWT `branchId` without also verifying the user's current assignment table, a user could access data from a branch they were removed from after login.

**Fix in place:** `resolveScopeBranch.js` validates JWT `branchId` against the DB assignment table on every request for these roles. Do not remove this check.

---

### P2 — HOD Role Overlap
HOD is an EMPLOYEE with a secondary password. Changing `User.role` to anything other than `HOD` while a `HodAssignment` exists breaks the HOD login flow. Similarly, clearing `User.passwordHod` breaks HOD auth without removing the assignment.

**Rule:** Never touch `User.role` or `User.passwordHod` directly without also updating (or removing) `HodAssignment` and `DepartmentRoleMapping`.

---

### P3 — Login Resolution Regression
The login route has three separate code paths (single-step, branch-pick, role-pick). A change that fixes single-step login may silently break the multi-branch or multi-role paths because they share validation logic in the same function.

**Rule:** After any change to `app/api/auth/login/route.js`, test all three login paths.

---

### P4 — Import Overwrite (Replace Mode)
Bulk upload in replace mode archives and deletes all employees not present in the sheet. A wrong file, a missing location filter, or a misspelled branch name can silently archive an entire branch's employee list.

**Rule:** Always test bulk uploads in merge mode first. Confirm the record count before switching to replace mode.

---

### P5 — Department Collar Mismatch
`collarType` exists on both `User` and `Department`. A user's effective collar type is: `User.collarType` if set, else `Department.collarType`. If a user is moved to a different department without updating `User.collarType`, the shortlist routing (HOD vs BM path) will use the wrong collar type.

---

### P6 — Evaluation Stage Mismatch (BIG vs SMALL)
The HOD evaluation path only exists for BIG branches. If `Branch.branchType` is changed from `BIG` to `SMALL` mid-quarter, blue-collar employees who were routed to HOD will have no evaluator, stalling Stage 2.

**Rule:** Never change `Branch.branchType` during an active quarter.

---

### P7 — Admin Route Branch Scoping
ADMIN routes use the URL `[branchId]` parameter for branch scoping — there is no JWT-level branch constraint for admins. Do not add JWT-level branch checks to admin routes (it would break admin's cross-branch access).

---

### P8 — Quarter Start Idempotency
Calling `POST /api/admin/quarters/start` twice in the same session (or if the first call partially failed) can result in:
- Duplicate question assignments in `EmployeeQuarterQuestions` (if the unique constraint is enforced, it will throw; if not, duplicates exist).
- Auto-winner notifications sent twice.

**Rule:** Check for an existing ACTIVE quarter before calling start. The route should enforce this check but verify it is enforced.

---

### P9 — CM Reassignment Cleanup
`BranchManagerAssignment.branchId` is `@unique`, and `lib/auth/bmAssignment.js` atomically clears the old BM before assigning a new one. It is not confirmed whether a similar atomic-clear function exists for `ClusterManagerBranchAssignment`. If it does not, reassigning a CM to a branch that already has one may throw a unique constraint error rather than replacing the old assignment.

**Status:** Needs verification.

---

### P10 — Token Blacklist Growth
The `BlacklistedToken` table is never automatically pruned. Every logout adds a row. Over time this table grows and the middleware's blacklist check (`SELECT 1 FROM blacklisted_tokens WHERE token = ?`) slows down.

**Fix:** Call `POST /api/admin/maintenance/prune-blacklist` on a schedule (e.g., daily cron). This is not automated in the current codebase.

---

### P11 — Score Precision in Rank Comparisons
`normalizedScore` is stored as `FLOAT` with `Math.round(x * 100) / 100`. Two employees with scores of `73.125` and `73.125` will appear tied. The shortlist ranking logic must handle ties consistently; if it doesn't, rank assignment is non-deterministic for tied scores.

---

### P12 — `prisma db push --accept-data-loss` in Build Script
The build command runs `prisma db push --accept-data-loss`, which can silently drop columns or data if the schema has changed. This is appropriate for development but risky for production deployments.

**Rule:** Use `prisma migrate deploy` for production deployments, not `db push`.

---

## 9. Codex Working Guide

### Before Making Any Change

1. **Identify which lib/ utility governs the behavior** you're changing. Read it fully before touching any route.
2. **Trace the request path:** `middleware.ts` → `withRole()` → `requireBranchScope()`/`resolveScopeBranch()` → handler. Know which guards run for your route.
3. **Check for composite unique constraints** in `prisma/schema.prisma` that relate to the table you're modifying.
4. **Check if the change affects BIG vs SMALL branch logic** — many flows diverge on `branchType`.

---

### High-Risk Files — Extra Care Required

| File | Why high risk |
|------|--------------|
| `middleware.ts` | All requests flow through it |
| `app/api/auth/login/route.js` | Three login flows; one broken path locks users out |
| `lib/auth/bmAssignment.js` | Non-atomic BM changes corrupt data |
| `app/api/admin/quarters/start/route.js` | Irreversible; not idempotent |
| `lib/shortlistManager.ts` | Stage cascades; wrong rank = broken pipeline |
| `app/api/admin/branches/[branchId]/employees/bulk-upload/route.js` | Replace mode deletes permanently |
| `prisma/schema.prisma` | `@unique` constraints are load-bearing; `db push` can drop data |

---

### Validating Role/Branch Behavior After a Change

1. Check `middleware.ts` — confirm headers are still correctly injected.
2. Check `withRole()` call in the affected route — confirm the role list is correct.
3. If the route is branch-scoped, confirm `requireBranchScope()` or `resolveScopeBranch()` is called.
4. For multi-branch roles (CM/HR/COMMITTEE), verify the JWT branchId is validated against the assignment table, not just trusted from the token.
5. Test with a user of each role that should and should not have access.

---

### Evaluation Flow Safety

- Any change to `lib/scoreCalculator.ts` affects every evaluation stage.
  Run `npm test` after changes and manually verify a Stage-2 score = 60% self + 40% evaluator.
- Any change to `lib/branchRules.ts` affects shortlist limits for all branches.
  Test with both a BIG branch (WC and BC collar separately) and a SMALL branch.
- Any change to `lib/shortlistManager.ts` risks corrupting stage ranks.
  After changes, verify that employees are promoted correctly from Stage 1 → 2 → 3 → 4.
- Changes to `EmployeeQuarterQuestions` (question assignment) must not break the
  `(employeeId, quarterId, questionId)` unique constraint.

---

### Import / Dashboard Safety

- Before adding or modifying a bulk upload column mapping in `run-bulk-uploads.js` or
  the web upload route, test with a sample Excel file in merge mode first.
- Never remove the demotion guard (`findRoleHolderConflicts()`).
- If a new nav item is added in `lib/dashboardNav.js`, the corresponding
  `app/dashboard/[role]/...` page must exist. Linking to a non-existent page returns 404.
- If a new role is added to the `Role` enum, update:
  `lib/dashboardNav.js`, `components/shell/Sidebar.jsx`, `lib/withRole.js`,
  `middleware.ts`, and all relevant assignment/auth logic.

---

### Checking UI ↔ Backend Sync

- Every dashboard page that fetches data should match an API route.
- API route roles in `withRole([...])` must match what the page's user role is.
- If a page at `app/dashboard/hr/page.js` fetches `/api/hr/shortlist`, the route
  at `app/api/hr/shortlist/route.js` must exist and accept `HR` role.
- Add/remove nav entries in `lib/dashboardNav.js` when adding/removing pages.

---

### Test After Changes

```bash
npm test          # Run Vitest unit tests
npm run lint      # Check for ESLint errors
npx prisma validate  # Validate schema.prisma syntax
```

---

## 10. Open Questions / Unknowns

The following items were not fully confirmable from static code exploration alone.
Verify before acting on assumptions about these areas.

| # | Item | Status |
|---|------|--------|
| 1 | **HOD orphaned employee fallback** — if a HOD assignment is removed mid-quarter, the exact code path that reverts BC employees to BM evaluation needs tracing. | Needs verification |
| 2 | **CM reassignment atomic clear** — `bmAssignment.js` has an explicit `clearBmAssignment()` function. Whether a similar function exists for CM re-assignment to prevent unique constraint errors is unknown. | Needs verification |
| 3 | **HR evaluate route status** — `app/api/hr/evaluate/route.js` appears to be an older supervisor-style path. Whether it is the active HR evaluation route or fully deprecated needs confirmation. | Needs verification |
| 4 | **Vitest test coverage** — which files/routes have test coverage is unknown without running `npm test` and inspecting test files under `__tests__/` or adjacent `*.test.ts` files. | Unknown |
| 5 | **`BLOB_READ_WRITE_TOKEN` env var** — required by Vercel Blob API for HR PDF uploads but not listed in `.env.example`. Without this variable, HR PDF uploads will fail silently or with an auth error. | Needs verification |
| 6 | **`EmployeeQuarterQuestions` vs `QuarterQuestion`** — both exist. `QuarterQuestion` is the locked set of questions for a quarter (shared). `EmployeeQuarterQuestions` is the per-employee randomized subset. The self-assessment route should be serving from `EmployeeQuarterQuestions`; confirm this is the case in `app/api/assessment/questions/route.js`. | Needs verification |
| 7 | **`BranchEvalConfig` override in evaluation routes** — `branchRules.ts` contains hardcoded limits. Whether every evaluation and shortlist route actually queries `BranchEvalConfig` first (to respect per-branch overrides) needs per-route confirmation. | Needs verification |
| 8 | **Quarter re-open** — there is a `POST /api/admin/quarters/close` route but no confirmed route to re-open a closed quarter. If a quarter is closed prematurely, the only fix may be a direct DB update. | Needs verification |
| 9 | **ALLOW_FULL_SEED guard** — `prisma/seed.ts` requires `ALLOW_FULL_SEED=1` but this is not documented in any README or `.env.example`. New developers may run `npm run seed` without this var and see a no-op with no explanation. | Likely behavior — confirm message printed |
| 10 | **Multi-branch CM removal** — when an admin removes a CM from a branch, whether the `ClusterManagerBranchAssignment` row is deleted (allowing a new CM to be assigned to that branch) or merely flagged needs confirmation, given that `branchId` is `@unique` in that table. | Needs verification |
