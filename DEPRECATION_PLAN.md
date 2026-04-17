# Deprecation Plan

Tracks legacy Prisma models marked `@deprecated` in [prisma/schema.prisma](prisma/schema.prisma) and their new-shape replacements. Nothing here is deleted yet — this document exists so the eventual removal is a deliberate, documented step instead of a surprise.

## Principle

Keep the deprecated table alive for as long as any read of it remains in code, plus one full quarter after the last read is removed. Only then drop the column/table in a dedicated migration.

## Deprecated models

| Model | Replacement | Dual-read/write sites | Planned removal |
|---|---|---|---|
| `SupervisorEvaluation` | `HodEvaluation` (big branches, blue-collar) and `BranchManagerEvaluation`→`BranchShortlistStage2` (white-collar) | [app/api/cluster-manager/evaluate/route.js](app/api/cluster-manager/evaluate/route.js) — legacy Stage 3 shortlist fallback | TBD — after one quarter with no reads |
| `BranchManagerEvaluation` | `BranchShortlistStage2` (new branch-scoped pipeline) | [app/api/admin/employees/[id]/route.js](app/api/admin/employees/[id]/route.js) — legacy data presence check | TBD |
| `ClusterManagerEvaluation` | `BranchShortlistStage3` | [app/api/cluster-manager/evaluate/route.js](app/api/cluster-manager/evaluate/route.js) — legacy fallback | TBD |
| `ShortlistStage1` / `ShortlistStage2` / `ShortlistStage3` | `BranchShortlistStage1` / `BranchShortlistStage2` / `BranchShortlistStage3` | [app/api/assessment/submit/route.ts](app/api/assessment/submit/route.ts) — "Also update legacy department-level shortlist for backward compatibility" | TBD |
| `BestEmployee` | `BranchBestEmployee` (per-collar, per-branch) | [app/api/cluster-manager/evaluate/route.js](app/api/cluster-manager/evaluate/route.js) — legacy fallback | TBD |
| `DepartmentRoleMapping` | Role now lives directly on `User.role` + `Branch`/`Department` scope | [app/api/admin/departments/remove-role/route.js](app/api/admin/departments/remove-role/route.js), [app/api/auth/refresh/route.js](app/api/auth/refresh/route.js) — builds `departmentIds` from this table | TBD |
| Role `SUPERVISOR` in the `Role` enum | Any of `HOD`, `BRANCH_MANAGER` depending on branch size | No active assignments; seeded only for historical rows | TBD |

## Removal procedure (when ready)

For each model:
1. Grep `app/**` and `lib/**` for the model name. Confirm zero reads remain in application code.
2. Run one production quarter with the dual-write removed but the table still present (so a rollback stays cheap).
3. Add a Prisma migration that drops the table (or enum value). Land it through the standard `prisma migrate dev` → `prisma migrate deploy` flow — **not** via `db push`.
4. Delete the model/enum-value block from [prisma/schema.prisma](prisma/schema.prisma) in the same commit as the migration.

## Out of scope here

- No schema edits in this pass.
- No dropping of dual-write paths today; the sites listed above stay as-is until a planned cleanup cycle is scheduled.
