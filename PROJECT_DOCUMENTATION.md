# Akshaya Patra — Project Documentation

Best Employee of the Quarter evaluation and recognition system for **Akshaya Patra Jaipur Branch Pilot**. This document is the single-source onboarding reference for contributors.

---

## 1. Overview

Akshaya Patra runs a quarterly recognition program across branches. This app automates the full evaluation lifecycle:

- Employees complete a **self-assessment** each quarter.
- A **branch-scoped, multi-stage shortlist pipeline** narrows candidates stage by stage.
- Evaluators at each stage (HOD, Branch Manager, Cluster Manager, HR) add scored input.
- A **Committee** reviews the final shortlist and picks the winner per collar type per branch.

The system is **collar-type aware** (white-collar vs blue-collar follow different paths) and **branch-type aware** (small vs big branches use different stage limits and evaluators).

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14.2.5 (App Router, API Routes) |
| Language | TypeScript, JavaScript (React 18.3.1) |
| Styling | TailwindCSS 3.4.4 + PostCSS + Autoprefixer |
| Database | PostgreSQL (Neon / PgBouncer pooling) |
| ORM | Prisma 5.16 |
| Auth | JWT via [jose](https://www.npmjs.com/package/jose) 5.9 + bcryptjs 2.4 |
| File storage | Vercel Blob 2.3 (HR PDF uploads) |
| Imports/Exports | PapaParse 5.5 (CSV), xlsx 0.18 (Excel) |
| Validation | Zod 3.23 |

See [package.json](package.json).

---

## 3. Repository Layout

```
app/
  api/                         REST endpoints
    admin/                     Admin-only ops (branch-scoped)
      branches/
        bulk-upload/           CSV/Excel employee import
        [branchId]/
          departments/
          employees/
          eval-config/         Per-quarter stage cutoffs & limits
          hr-assign/           Link HR user to branch
          committee-assign/    Link Committee members to branch
      employees/
      departments/
    auth/                      login, logout, refresh, me
    assessment/
      questions/               Randomized Q&A per employee/quarter
      submit/                  Submit self-assessment
    employee/
    health/
  dashboard/                   Role-scoped UIs
    admin/
    branch-manager/
    cluster-manager/
    committee/
    hod/
    hr/
    employee/
  login/
  unauthorized/

lib/
  auth.ts                      JWT sign/verify, cookie helpers
  auth/                        server-side auth middleware
  prisma.ts                    Prisma singleton
  branchRules.ts               Branch type + stage-limit rules
  scoreCalculator.ts           Normalization + weighted scoring
  shortlistManager.ts          Stage advancement logic

components/
  admin/BranchSideNav.jsx      Branch-scoped sidebar

prisma/
  schema.prisma                Full data model
  migrations/                  11 migration folders
  seed.ts                      Seed entrypoint (287 employees, 16 depts)
  seed-data/                   Departments, employees, questions, role mappings

public/                        Static assets
scripts/                       Utility scripts
```

Key files:

- [prisma/schema.prisma](prisma/schema.prisma) — authoritative data model
- [lib/auth.ts](lib/auth.ts)
- [lib/branchRules.ts](lib/branchRules.ts)
- [lib/scoreCalculator.ts](lib/scoreCalculator.ts)
- [lib/shortlistManager.ts](lib/shortlistManager.ts)
- [prisma/seed.ts](prisma/seed.ts)

---

## 4. Domain Model & Key Concepts

- **Branch** — a physical Akshaya Patra location. Branches have a **type**: `SMALL` or `BIG`. Big branches use HODs for blue-collar Stage 2; small branches route everything through the Branch Manager.
- **Department** — org unit inside a branch, tagged `WHITE_COLLAR` or `BLUE_COLLAR`.
- **Collar Type** — `WHITE_COLLAR` / `BLUE_COLLAR`. Pipelines and winners are tracked independently per collar.
- **Quarter** — evaluation period with status `ACTIVE` or `CLOSED`.
- **Evaluation chain** — Self → (HOD or BM) → CM → HR → Committee.
- **Stage limits** — per-branch, per-quarter cutoffs stored in `BranchEvalConfig`.

---

## 5. Database Schema

Grouped by purpose (see [prisma/schema.prisma](prisma/schema.prisma) for full fields and relations).

### Core
- **User** — all humans in the system; carries `role`, `branchId`, `departmentId`, `collarType`, `passwordHash`, optional `passwordHod`.
- **Branch** — name, type (`SMALL` | `BIG`).
- **Department** — name, collar type, branch.
- **Quarter** — label, start/end, status.
- **Question** — reusable self-assessment questions, categorized (Attendance, Discipline, Productivity, etc.).

### Evaluation scores
- **SelfAssessment** — per employee per quarter; per-question scores normalized to 0–100.
- **HodEvaluation** — HOD evaluates blue-collar in big branches (Stage 2).
- **HrEvaluation** — HR Stage 4 (attendance %, working hours, PDF references, notes).
- **BranchManagerEvaluation** *(deprecated)* — legacy BM flow.
- **ClusterManagerEvaluation** *(deprecated)* — legacy CM flow.

### Shortlist pipeline (branch-scoped)
- **BranchShortlistStage1** — top slice by self-score.
- **BranchShortlistStage2** — survivors after BM/HOD evaluation.
- **BranchShortlistStage3** — survivors after CM evaluation.
- **BranchShortlistStage4** — survivors after HR evaluation.
- **BranchBestEmployee** — Committee-selected winner per collar per branch per quarter.

### Configuration & assignment
- **BranchEvalConfig** — `stage1CutoffPct`, `stage2Limit`, `stage3Limit`, `stage4Limit` per branch/quarter.
- **HodAssignment** — BM assigns an HOD to a department for a quarter.
- **EmployeeHodAssignment** — admin pins specific employees to an HOD (Stage 2 routing).
- **HrBranchAssignment** — scopes an HR user to one or more branches.
- **CommitteeBranchAssignment** — scopes a Committee user to branches.
- **DepartmentRoleMapping** *(deprecated)* — legacy role-to-department mapping.

### Operational
- **AuditLog** — user action trail with IP and metadata.
- **Notification** — in-app notifications.
- **BlacklistedToken** — revoked JWTs (logout / forced expiry).
- **ArchivedEmployee** — soft-deleted employees with removal reason.

---

## 6. Roles & Authorization

### Roles

| Role | Scope | Responsibility |
|---|---|---|
| `EMPLOYEE` | self | Complete self-assessment |
| `SUPERVISOR` *(deprecated)* | — | Legacy Stage 2 evaluator |
| `HOD` | department(s) | Stage 2 for blue-collar in big branches |
| `BRANCH_MANAGER` | branch | Stage 2 (white-collar) + assigns HODs |
| `CLUSTER_MANAGER` | branch(es) | Stage 3 |
| `HR` | branch(es) | Stage 4 (attendance, PDFs) |
| `COMMITTEE` | branch(es) | Final winner selection |
| `ADMIN` | global | System administration |

### JWT Flow

- Access token: 8h default (`JWT_EXPIRES_IN`).
- Refresh token: 7 days.
- Stored as **HttpOnly cookies** (no localStorage).
- Logout and forced expiry go through `BlacklistedToken`.
- HODs may set an additional `passwordHod` to switch login context.

Sign/verify logic lives in [lib/auth.ts](lib/auth.ts); route middleware in [lib/auth/](lib/auth).

---

## 7. Evaluation Pipeline (Stages 1–4)

Defined in [lib/scoreCalculator.ts](lib/scoreCalculator.ts) and [lib/shortlistManager.ts](lib/shortlistManager.ts); branch-dependent limits in [lib/branchRules.ts](lib/branchRules.ts).

1. **Stage 1 — Self-assessment cutoff.** Top `stage1CutoffPct` (typically 50%) by self-score advance.
2. **Stage 2 — Evaluator review.**
   - White-collar: evaluated by Branch Manager.
   - Blue-collar in big branches: evaluated by assigned HOD.
   - Weighted: **self 60% / evaluator 40%**.
   - Keeps top `stage2Limit` (e.g., 10 white-collar or 3 blue-collar).
3. **Stage 3 — Cluster Manager evaluation.**
   - Composite weighting: **self 30 / BM 25 / CM 25 / HR 20** (HR 0 at this point — see note below).
   - Keeps top `stage3Limit` (e.g., 5 or 2).
4. **Stage 4 — HR evaluation.** Attendance percentage, working hours, supporting PDFs (Vercel Blob). Keeps top `stage4Limit` (e.g., 3 finalists or 1).
5. **Committee.** Reviews Stage 4 shortlist per branch/collar; records a `BranchBestEmployee`.

---

## 8. Routing Map

### Dashboard (UI)
- `/login`
- `/dashboard/admin`
- `/dashboard/branch-manager`
- `/dashboard/hod`
- `/dashboard/cluster-manager`
- `/dashboard/hr`
- `/dashboard/committee`
- `/dashboard/employee`
- `/unauthorized`

### API (selected)
- `POST /api/auth/login` · `POST /api/auth/logout` · `POST /api/auth/refresh` · `GET /api/auth/me`
- `GET  /api/assessment/questions?quarterId=...`
- `POST /api/assessment/submit`
- `GET  /api/admin/branches`
- `POST /api/admin/branches/bulk-upload`
- `GET  /api/admin/branches/[branchId]/summary`
- `GET/POST /api/admin/branches/[branchId]/departments`
- `GET/POST /api/admin/branches/[branchId]/employees`
- `POST /api/admin/branches/[branchId]/eval-config`
- `POST /api/admin/branches/[branchId]/hr-assign`
- `POST /api/admin/branches/[branchId]/committee-assign`

---

## 9. Feature Modules

- **Self-assessment** — randomized question set per employee/quarter; per-question scores in `-2..+2` normalized to 0–100; single submission enforced.
- **Bulk employee upload** — CSV/Excel import validated against departments, collar type, designation; auto-generates passwords; roles set via seed mappings.
- **Branch-scoped admin dashboard** — drill-down Branch → Department → Employee; per-stage progress; Excel export of results.
- **HOD assignment (big branches)** — BM assigns HODs to departments each quarter; admin can pin specific employees to an HOD.
- **HR Stage 4** — attendance % and working hours entry, PDF uploads (attendance + punctuality) to Vercel Blob.
- **Committee review** — view Stage 4 shortlist by branch and collar; select winner per collar.
- **Audit logging** — significant user actions logged with IP.

---

## 10. Scripts

From [package.json](package.json):

```bash
npm run dev              # next dev
npm run build            # prisma generate && prisma db push --accept-data-loss && next build
npm run start            # next start
npm run lint             # next lint
npm run seed             # ts-node prisma/seed.ts
npm run prisma:generate  # prisma generate
npm run prisma:migrate   # prisma migrate dev
npm run prisma:studio    # prisma studio
```

`postinstall` runs `prisma generate` automatically.

---

## 11. Environment Variables

Required (see `.env.example`):

```
DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://USER:PASS@HOST:5432/DB"      # Prisma direct / migrations
JWT_SECRET="high-entropy-random-key-min-32-chars"
NEXTAUTH_URL="https://your-app.example.com"
NODE_ENV="development" | "production"
```

Optional:

```
JWT_EXPIRES_IN="8h"
```

---

## 12. Local Setup

```bash
npm install
cp .env.example .env          # fill in values
npm run prisma:migrate        # apply migrations
npm run seed                  # seed 287 employees, 16 departments (Jaipur)
npm run dev                   # http://localhost:3000
```

---

## 13. Deployment Notes

Summarized from [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md):

- Set all env vars in hosting provider secrets; never commit local `.env`.
- `npm run build` runs `prisma db push --accept-data-loss` — review schema changes before deploying.
- Rotate `JWT_SECRET` on any suspected compromise; revoked tokens remain in `BlacklistedToken`.
- Validate that session cookies are HttpOnly + Secure in production.
- Confirm Vercel Blob access for HR PDF uploads.

---

## 14. Glossary

- **Branch** — Akshaya Patra location; type `SMALL` or `BIG`.
- **Collar Type** — `WHITE_COLLAR` or `BLUE_COLLAR`; pipelines are tracked separately.
- **Quarter** — evaluation period (`ACTIVE` | `CLOSED`).
- **Stage** — one step of the shortlist pipeline (1 = self cutoff, 2 = BM/HOD, 3 = CM, 4 = HR, final = Committee).
- **Shortlist** — set of employees carried into the next stage.
- **Cutoff / Limit** — `stage1CutoffPct` is a percentage; `stage2Limit`, `stage3Limit`, `stage4Limit` are absolute counts set per branch/quarter in `BranchEvalConfig`.
