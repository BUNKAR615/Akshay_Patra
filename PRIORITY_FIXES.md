# Priority Fixes — Akshaya Patra

Derived strictly from [FEATURE_STATUS.md](FEATURE_STATUS.md). Every item is a real gap backed by a file reference in that report. Working modules (auth login, admin CRUD, evaluation pipeline, committee, audit, notifications, seed, export) are **out of scope** — do not rewrite them.

Groupings answer different questions:
- **Critical** — a user or operator can be harmed today (security, data loss, auth escape).
- **Important** — a documented workflow cannot be completed end-to-end without a workaround.
- **Minor** — quality, hygiene, or future-proofing; nothing is blocked today.

---

## Critical — blocks usability or creates real risk

### C1. Refresh route ignores `BlacklistedToken`
- **Evidence:** [app/api/auth/refresh/route.js:18-28](app/api/auth/refresh/route.js). Logout writes the token ([app/api/auth/logout/route.js](app/api/auth/logout/route.js)) but the refresh path never reads it.
- **Impact:** A logged-out user who retains the refresh cookie can mint new 8h access tokens for up to 7 days. Logout is effectively cosmetic.
- **Fix shape (no rewrite):** After `verifyRefreshToken` succeeds, add one `prisma.blacklistedToken.findUnique({ where: { token: refreshToken } })` and `fail(..., 401)` if present. ~5 lines, no schema change, no UI change.

### C2. Build runs `prisma db push --accept-data-loss`
- **Evidence:** [package.json:8](package.json).
- **Impact:** Any accidental column drop in a PR silently destroys production data on next deploy. The [prisma/migrations](prisma/migrations) folder already exists but is not used at deploy time.
- **Fix shape:** Change the `build` script to `prisma generate && prisma migrate deploy && next build`. Verify the migration history matches the current DB before the first deploy under the new script. No application code changes.

### C3. No rate-limiting or lockout on login
- **Evidence (from FEATURE_STATUS §4):** no middleware on `app/api/auth/login/route.js`, no attempt counter on [User](prisma/schema.prisma).
- **Impact:** Unthrottled password stuffing against a known employee `empCode` set (seeded and bulk-uploaded; predictable).
- **Fix shape:** Smallest viable: in-process per-IP + per-empCode counter using an existing table (reuse `AuditLog` reads for attempt history, or add a `loginAttempts` column to `User`). No new infra. Do not migrate to an external rate-limit service in this pass.

---

## Important — core workflow incomplete

### I1. HR PDF upload has no upload endpoint
- **Evidence:** `HrEvaluation` stores `attendancePdfUrl`, `punctualityPdfUrl`, `referenceSheetUrl` ([prisma/schema.prisma](prisma/schema.prisma)); [app/api/hr/evaluate/route.js](app/api/hr/evaluate/route.js) accepts them as strings; `@vercel/blob` is declared in [package.json](package.json) but imported by zero source files.
- **Impact:** HR reviewers cannot actually attach the supporting documents the schema is designed to hold. The committee view shows links ([app/dashboard/committee](app/dashboard/committee)) that the HR user has no way to produce.
- **Fix shape:** New `POST /api/hr/upload` returning a blob URL via `@vercel/blob`; wire a file input in the HR UI to call it and pass the returned URL into the existing `hr/evaluate` body. Do **not** modify `hr/evaluate` beyond accepting the same field it already accepts.

### I2. Bulk-upload has no dashboard entry point
- **Evidence:** [app/api/admin/branches/bulk-upload/route.js](app/api/admin/branches/bulk-upload/route.js) is complete; no page under [app/dashboard/admin](app/dashboard/admin) references it.
- **Impact:** Admins must POST multipart XLSX manually. The feature exists but is not reachable from the UI it was built for.
- **Fix shape:** One page (e.g. `app/dashboard/admin/[branchId]/employees/bulk-upload/page.jsx`) with a file input + template download link. No backend changes.

### I3. No password-reset flow
- **Evidence:** No route under `app/api/auth/**` for reset; no reset page under `app/`; `bcryptjs` used only in login.
- **Impact:** Forgotten-password accounts must be reset by an admin directly in the DB or via a new `passwordHash` write. There is no self-serve path.
- **Fix shape:** Admin-initiated reset first (button on [app/dashboard/admin/[branchId]/employees](app/dashboard/admin) → new `POST /api/admin/users/[id]/reset-password` that writes a new hash and audits). Email-based self-serve is a later pass — do not introduce an email dependency in this step.

### I4. `BlacklistedToken` grows unbounded
- **Evidence:** `expiresAt` is indexed in [prisma/schema.prisma](prisma/schema.prisma) but no pruning job exists.
- **Impact:** Slow creep of table size; eventually a cost and query concern, not an immediate outage.
- **Fix shape:** One admin endpoint `POST /api/admin/maintenance/prune-blacklist` doing `deleteMany({ where: { expiresAt: { lt: now } } })`, optionally invoked from a Vercel Cron (config-only, no new service). Do not block on building a general job scheduler.

---

## Minor — UI or enhancement

### M1. No automated tests
- **Evidence (FEATURE_STATUS §4):** no `*.test.*`, no `__tests__/`, no runner configured.
- **Fix shape:** Add Vitest + one smoke test per evaluation-stage route (`branch-manager/evaluate`, `hod/evaluate`, `cluster-manager/evaluate`, `hr/evaluate`, `assessment/submit`). Start with route-level happy-path tests against a test DB; do not refactor the routes to be "more testable" — they already accept plain JSON.

### M2. No CI
- **Evidence:** no `.github/workflows/`.
- **Fix shape:** Single GitHub Actions workflow running `npm ci && npm run lint && npm test && npm run build` on PR. No deployment automation in this pass.

### M3. No pre-commit hook
- **Fix shape:** Husky + lint-staged running `next lint` on staged files. Pure config.

### M4. Deprecated-model cleanup plan
- **Evidence:** `SupervisorEvaluation`, `BranchManagerEvaluation`, `ClusterManagerEvaluation`, `BestEmployee`, `ShortlistStage1/2/3`, `DepartmentRoleMapping` are marked `@deprecated` but still dual-written.
- **Fix shape:** **Do not delete.** Add a short `DEPRECATION_PLAN.md` listing each model, the new table that replaces it, and the quarter after which reads can be removed. Code changes come later, behind this plan.

### M5. Login telemetry
- **Fix shape:** Ensure every login failure logs to `AuditLog` with reason code, to make C3's counter trivially derivable from existing data. Likely already partially done — verify, don't rebuild.

---

## Recommended order of implementation

Ordered so each step is independently deployable, low-blast-radius, and unblocks the next.

1. **C1 — Refresh blacklist check.** ~5 lines, no schema, no UI. Closes the auth-escape immediately. Ship alone.
2. **M5 — Verify login-failure audit logging.** Read-only investigation; needed to inform C3. No deploy.
3. **C3 — Login rate-limit / lockout.** Built on the audit trail verified in step 2. One column or one table, one middleware check in the login route. Keep the change tight.
4. **I4 — Blacklist pruning endpoint.** One route, deleteMany, optional cron config. Cheap follow-up to C1 that keeps the table healthy before it matters.
5. **C2 — Switch build to `prisma migrate deploy`.** Do this **after** the code-level auth fixes land on production cleanly, so the first migration-driven deploy is low-novelty. Dry-run in a preview environment; confirm the migration history matches production schema before cutting over.
6. **I1 — HR PDF upload endpoint + HR UI wiring.** Larger than the auth fixes but self-contained; only touches the HR route's input path (already accepts URL strings) and one new page.
7. **I2 — Bulk-upload UI page.** Pure frontend; the API is proven.
8. **I3 — Admin-initiated password reset.** New route + one admin button. Avoid email in this step.
9. **M1 → M2 → M3 — Tests, CI, hooks.** In that order: tests first so CI has something to run, CI second so hooks aren't the only gate, hooks last.
10. **M4 — Write `DEPRECATION_PLAN.md`.** Documentation only. No code churn until a later, planned cycle removes the legacy reads.

---

## Explicitly out of scope (do not touch)

Everything marked "Working" in [FEATURE_STATUS.md §1](FEATURE_STATUS.md):
- Login, logout, `/me`
- Admin branch / department / employee / question CRUD
- Quarter start / close / progress
- Self-assessment submit + scoring + Stage 1 shortlist
- Branch-manager, HOD, cluster-manager, HR evaluate routes and their dashboards
- Committee results route and dashboard
- Audit log writes and reads
- Notifications create / read / mark-read
- Excel export
- Seed data and seed script

No refactors, no renames, no "while we're in here" changes in those areas. Every fix above should be additive where possible, and local to a single route or a single page where not.
