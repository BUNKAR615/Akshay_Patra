# Feature Status — Akshaya Patra

Evidence-based status of every feature in the repository. Each item is linked to the file that proves the claim. Nothing here is inferred beyond what the code shows.

> Scope: `main` checked out at commit `1294c71`. Scanned `app/**`, `lib/**`, `prisma/**`, `components/**`, `package.json`, and existing docs.

---

## 1. Working features

Features with both backend logic and a caller (API + UI, or API + scheduled use), no TODOs, no missing dependencies.

### Authentication
- **Login** — JWT access + refresh issued, cookies set HttpOnly. [app/api/auth/login/route.js](app/api/auth/login/route.js)
- **Logout** — inserts token into `BlacklistedToken`, clears cookies, audits event. [app/api/auth/logout/route.js](app/api/auth/logout/route.js)
- **Me / current user** — [app/api/auth/me/route.js](app/api/auth/me/route.js)
- JWT sign/verify utilities. [lib/auth.ts](lib/auth.ts)

### Admin — branch & org management
- Branch CRUD. [app/api/admin/branches/route.js](app/api/admin/branches/route.js)
- Branch-scoped departments, employees, org view, HR+committee assignment, questions, audit log. Routes under [app/api/admin/branches/[branchId]](app/api/admin/branches) with matching UIs under [app/dashboard/admin/[branchId]](app/dashboard/admin).
- Branch evaluation config (stage cutoffs/limits). [app/api/admin/branches/[branchId]/eval-config/route.js](app/api/admin/branches/[branchId]/eval-config/route.js)
- HR assignment, Committee assignment APIs. [app/api/admin/branches/[branchId]/hr-assign/route.js](app/api/admin/branches/[branchId]/hr-assign/route.js), [app/api/admin/branches/[branchId]/committee-assign/route.js](app/api/admin/branches/[branchId]/committee-assign/route.js)
- Global admin dashboard. [app/dashboard/admin](app/dashboard/admin)

### Quarter lifecycle
- Start quarter (assigns questions, opens shortlists). [app/api/admin/quarters/start/route.js](app/api/admin/quarters/start/route.js)
- Close quarter. [app/api/admin/quarters/close/route.js](app/api/admin/quarters/close/route.js)
- Quarter progress tracking. [app/api/admin/quarter-progress/route.js](app/api/admin/quarter-progress/route.js)
- UI. [app/dashboard/admin/global/quarter](app/dashboard/admin/global/quarter)

### Employee self-assessment
- Randomized question fetch + submit. [app/api/assessment/questions/route.js](app/api/assessment/questions), [app/api/assessment/submit/route.ts](app/api/assessment/submit/route.ts)
- Score normalization + Stage 1 shortlist update. [lib/scoreCalculator.ts](lib/scoreCalculator.ts), [lib/shortlistManager.ts](lib/shortlistManager.ts)
- UI. [app/dashboard/employee](app/dashboard/employee)

### Multi-stage evaluation pipeline
- Stage 2 (BM, white-collar). [app/api/branch-manager/evaluate/route.js](app/api/branch-manager/evaluate/route.js), UI [app/dashboard/branch-manager](app/dashboard/branch-manager)
- Stage 2 (HOD, blue-collar big-branch). [app/api/hod/evaluate/route.js](app/api/hod/evaluate/route.js), UI [app/dashboard/hod](app/dashboard/hod)
- Stage 3 (CM). [app/api/cluster-manager/evaluate/route.js](app/api/cluster-manager/evaluate/route.js), UI [app/dashboard/cluster-manager](app/dashboard/cluster-manager)
- Stage 4 (HR scoring, writes `BranchBestEmployee`). [app/api/hr/evaluate/route.js](app/api/hr/evaluate/route.js), UI [app/dashboard/hr](app/dashboard/hr)
- Shortlist read APIs for each role. `hod/shortlist`, `branch-manager/shortlist`, `cluster-manager/shortlist`, `hr/shortlist` under [app/api](app/api).

### Committee review
- Results API. [app/api/committee/results/route.js](app/api/committee/results/route.js)
- UI renders winners, scores, attendance, reference-sheet links. [app/dashboard/committee](app/dashboard/committee)

### Bulk employee upload (admin)
- XLSX parsing, transactional creation of branches / managers / departments / employees. [app/api/admin/branches/bulk-upload/route.js](app/api/admin/branches/bulk-upload/route.js)

### Questions
- CRUD + quarter-wide randomized assignment. [app/api/admin/questions](app/api/admin/questions), UI [app/dashboard/admin/[branchId]/questions](app/dashboard/admin)

### Audit log
- Write: 50+ call sites across admin/auth/evaluate routes using `prisma.auditLog.create`.
- Read: [app/api/admin/audit-logs/route.js](app/api/admin/audit-logs/route.js), [app/api/admin/branches/[branchId]/audit-logs/route.js](app/api/admin/branches/[branchId]/audit-logs/route.js)
- UI. [app/dashboard/admin/[branchId]/audit](app/dashboard/admin)

### Notifications
- Create via `lib/notifications.js`; read / mark-read endpoints under `app/api/notifications/**`. Wired from employee-archive and HOD-assign flows.

### Export
- Quarter report Excel export. [app/api/admin/export/quarter-report/route.js](app/api/admin/export/quarter-report/route.js)

### Seed data
- 287 employees, 16 departments (Jaipur), question pool, role mappings. [prisma/seed.ts](prisma/seed.ts), [prisma/seed-data](prisma/seed-data)

---

## 2. Partially implemented features

Backend exists but a piece of the chain is not wired, or the data path is incomplete.

### HR PDF uploads — **URL fields only, no upload handler**
- Schema stores `attendancePdfUrl`, `punctualityPdfUrl`, `referenceSheetUrl` on [HrEvaluation](prisma/schema.prisma) and `BranchShortlistStage4` / `BranchBestEmployee`.
- HR evaluate endpoint accepts those URLs as request-body strings. [app/api/hr/evaluate/route.js](app/api/hr/evaluate/route.js)
- `@vercel/blob` is declared in [package.json](package.json) but imported by **zero** source files (grep verified).
- Result: no upload endpoint, no signed-URL generation, no storage integration. The HR UI has no way to turn a file picker into a URL except by hand.

### Token blacklist — **write-only**
- Logout inserts into `BlacklistedToken`. [app/api/auth/logout/route.js](app/api/auth/logout/route.js)
- Refresh does *not* check it before reissuing access tokens. [app/api/auth/refresh/route.js:18-28](app/api/auth/refresh/route.js)
- No other reader exists (grep: `blacklistedToken.findUnique` / `findFirst` matches nothing in `app/**` or `lib/**`).

### Deprecated-model dual-write paths
Legacy tables are still written / read for backward compatibility, living alongside the new branch-scoped models:
- `SupervisorEvaluation`, `BranchManagerEvaluation`, `ClusterManagerEvaluation`, `BestEmployee`, `ShortlistStage1/2/3`, `DepartmentRoleMapping` — still referenced in `app/api/assessment/submit/route.ts`, `app/api/cluster-manager/evaluate/route.js`, `app/api/admin/employees/[id]/route.js`, `app/api/admin/departments/remove-role/route.js`, and `app/api/auth/refresh/route.js`.
- Not broken, but the codebase is carrying two shapes of the same data; a cleanup pass is pending.

### Expired-token cleanup
- `BlacklistedToken.expiresAt` is indexed in [prisma/schema.prisma](prisma/schema.prisma) but no job, cron, or route prunes rows. Table will grow unbounded.

---

## 3. Broken features

Features that will not behave as a user/operator reasonably expects.

| # | Feature | Evidence | Symptom |
|---|---|---|---|
| B1 | **Refresh token ignores blacklist** | [app/api/auth/refresh/route.js:18-28](app/api/auth/refresh/route.js) — calls `verifyRefreshToken` but never queries `BlacklistedToken` | A logged-out user who kept a copy of the refresh cookie can still mint new access tokens until JWT expiry (7d). |
| B2 | **HR PDF upload UX** | `@vercel/blob` unused; no upload route | UI cannot actually attach files; only a pre-existing URL string can be submitted. |
| B3 | **Build uses `prisma db push --accept-data-loss`** | [package.json:8](package.json) | Any column drop in a PR will silently destroy production data on deploy. Not a code defect per se, but a broken deployment contract. |

### Easiest to fix first (ranked)

1. **B1 — Refresh blacklist check.** ~5 lines in [app/api/auth/refresh/route.js](app/api/auth/refresh/route.js): after `verifyRefreshToken`, add `const revoked = await prisma.blacklistedToken.findUnique({ where: { token: refreshToken } }); if (revoked) return fail(...)`. No schema change, no UI change.
2. **B3 — Remove `--accept-data-loss`.** One flag in [package.json](package.json), plus switching to `prisma migrate deploy` backed by the existing [prisma/migrations](prisma/migrations) folder. Low code risk, higher process risk (requires discipline on migration authoring).
3. **B2 — Wire Vercel Blob.** Larger change: new `POST /api/hr/upload` returning a blob URL, plus file-input wiring in the HR UI. The dependency is already installed.

---

## 4. Missing but expected

Gaps relative to what the rest of the repo implies should exist.

- **Automated tests.** No `*.test.*`, no `__tests__/`, no Jest / Vitest / Playwright config. Only ESLint ([.eslintrc.json](.eslintrc.json)) and TypeScript ([tsconfig.json](tsconfig.json)) are configured.
- **CI pipeline.** No `.github/workflows/`, no GitLab/CircleCI/Jenkins config. Deploys rely on the build step in [package.json](package.json).
- **Pre-commit hooks.** No `husky/`, no `lint-staged` config; linting is not enforced on commit.
- **File upload route.** Implied by HR schema fields (see §2) but never implemented.
- **Token cleanup job.** Implied by `BlacklistedToken.expiresAt` index (see §2) but never implemented.
- **Admin UI for bulk upload.** The [bulk-upload API](app/api/admin/branches/bulk-upload/route.js) exists; no dashboard page under [app/dashboard/admin](app/dashboard/admin) references it by name. If it is invoked, it is via an ad-hoc form or manual POST.
- **Password reset / forgot-password.** No route under `app/api/auth/**` for reset, no UI page. `bcryptjs` is used only on login.
- **Rate limiting / lockout on login.** No middleware, no attempt counter in [User](prisma/schema.prisma). Login is unthrottled.
- **Documentation of deprecation path.** Schema marks models `@deprecated` but there is no migration plan / dated removal target in-repo.

---

## Methodology

- Every API route was listed from `app/api/**/route.{js,ts}` and each handler read for empty-body or stub patterns (`return NextResponse.json({})`, `throw new Error('not implemented')`, `// TODO`). None found.
- Every dashboard page was listed from `app/dashboard/**/page.{js,jsx,tsx}` and checked for "Coming Soon" / empty render. None found.
- Prisma models were grepped across `app/**` and `lib/**`. All 32 models have at least one read or write call site.
- Imports in every route were cross-checked against files in `lib/`. No missing imports.
- Unused dependencies cross-checked by grepping for their import specifiers in source (not just `package.json`).
