/**
 * materialize-hod-employee-links.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time data repair for the "BM page disagrees with admin on Stage 2" bug.
 *
 * BACKGROUND
 *   In BIG branches the BM nominates an HOD (HodAssignment) and then attaches
 *   blue-collar employees to them (EmployeeHodAssignment). The HOD routes also
 *   had an implicit fallback: an HOD with NO per-employee links could see and
 *   evaluate every blue-collar Stage 1 employee of the department they were
 *   nominated for. Every BM-side screen only reads EmployeeHodAssignment, so
 *   those evaluations were invisible there — e.g. Nathdwara Q2-2026: Narendra
 *   Singh Rajput evaluated 27 Production employees, the admin pipeline showed
 *   Stage 2 complete, but Dilip Purohit's page showed the HOD with 0 assigned
 *   and the 27 still awaiting the BM.
 *
 *   The fallback has been removed from the code; EmployeeHodAssignment is now
 *   the only grant. This script writes the links the fallback implied, so the
 *   data says what actually happened.
 *
 * WHAT THIS DOES (active quarter, or --quarter=<id>)
 *   1. Every HodEvaluation whose employee has no EmployeeHodAssignment → create
 *      the link to the HOD who evaluated them.
 *   2. Every HOD that has a HodAssignment but no per-employee links (i.e. was
 *      relying on the fallback) → link the not-yet-evaluated blue-collar
 *      Stage 1 employees of their nominated departments, so they keep the list
 *      they could see before.
 *   assignedBy = the BM who made the HodAssignment nomination.
 *
 * SAFETY
 *   DRY-RUN by default — prints a report and writes NOTHING. Pass `--apply` to
 *   persist. Insert-only (never updates or deletes a link, never touches
 *   evaluations). Idempotent: re-running after `--apply` is a no-op.
 *
 * USAGE
 *   node scripts/materialize-hod-employee-links.js            # dry run
 *   node scripts/materialize-hod-employee-links.js --apply    # write
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const quarterArg = (process.argv.find((a) => a.startsWith("--quarter=")) || "").split("=")[1];

async function main() {
  const quarter = quarterArg
    ? await prisma.quarter.findUnique({ where: { id: quarterArg } })
    : await prisma.quarter.findFirst({ where: { status: "ACTIVE" } });
  if (!quarter) throw new Error("Quarter not found");
  console.log(`\nQuarter: ${quarter.name} (${quarter.id}) — ${APPLY ? "APPLY" : "DRY RUN"}\n`);
  const quarterId = quarter.id;

  const [links, nominations, hodEvals, bmEvals] = await Promise.all([
    prisma.employeeHodAssignment.findMany({ where: { quarterId }, select: { employeeId: true, hodUserId: true } }),
    prisma.hodAssignment.findMany({
      where: { quarterId },
      select: { hodUserId: true, departmentId: true, branchId: true, assignedBy: true, assignedAt: true },
      orderBy: { assignedAt: "asc" },
    }),
    prisma.hodEvaluation.findMany({ where: { quarterId }, select: { employeeId: true, hodId: true } }),
    prisma.branchManagerEvaluation.findMany({ where: { quarterId }, select: { employeeId: true } }),
  ]);

  const linked = new Set(links.map((l) => l.employeeId));
  const hodsWithLinks = new Set(links.map((l) => l.hodUserId));
  const hodEvaluated = new Set(hodEvals.map((e) => e.employeeId));
  const bmEvaluated = new Set(bmEvals.map((e) => e.employeeId));
  const nominatedBy = new Map();
  for (const n of nominations) if (!nominatedBy.has(n.hodUserId)) nominatedBy.set(n.hodUserId, n.assignedBy);

  const toCreate = new Map(); // employeeId → { hodUserId, assignedBy, reason }

  // 1. HOD evaluations with no link.
  for (const e of hodEvals) {
    if (linked.has(e.employeeId) || toCreate.has(e.employeeId)) continue;
    toCreate.set(e.employeeId, { hodUserId: e.hodId, assignedBy: nominatedBy.get(e.hodId) || e.hodId, reason: "evaluated by HOD" });
  }

  // 2. Fallback-mode HODs: their department's remaining blue-collar Stage 1 employees.
  for (const n of nominations) {
    if (hodsWithLinks.has(n.hodUserId)) continue;
    const stage1 = await prisma.branchShortlistStage1.findMany({
      where: { quarterId, branchId: n.branchId, user: { departmentId: n.departmentId } },
      select: { userId: true, collarType: true, user: { select: { collarType: true } } },
    });
    for (const s of stage1) {
      const collar = s.user?.collarType || s.collarType;
      if (collar === "WHITE_COLLAR" || s.userId === n.hodUserId) continue;
      if (linked.has(s.userId) || toCreate.has(s.userId)) continue;
      if (hodEvaluated.has(s.userId) || bmEvaluated.has(s.userId)) continue; // Stage 2 already done elsewhere
      toCreate.set(s.userId, { hodUserId: n.hodUserId, assignedBy: n.assignedBy, reason: "department nomination (not yet evaluated)" });
    }
  }

  const ids = [...new Set([...toCreate.keys(), ...[...toCreate.values()].map((v) => v.hodUserId)])];
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, empCode: true, department: { select: { name: true, branch: { select: { name: true } } } } },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  console.log(`── LINKS TO CREATE (${toCreate.size}) ${APPLY ? "[written]" : "[would write]"} ──`);
  for (const [employeeId, v] of toCreate) {
    const emp = byId.get(employeeId);
    const hod = byId.get(v.hodUserId);
    console.log(`${emp?.department?.branch?.name || "?"} | ${emp?.name} (${emp?.empCode}) · ${emp?.department?.name || "—"}  →  HOD ${hod?.name}   [${v.reason}]`);
  }

  if (APPLY && toCreate.size > 0) {
    const res = await prisma.employeeHodAssignment.createMany({
      data: [...toCreate].map(([employeeId, v]) => ({ employeeId, quarterId, hodUserId: v.hodUserId, assignedBy: v.assignedBy })),
      skipDuplicates: true,
    });
    await prisma.auditLog.create({
      data: {
        userId: [...toCreate.values()][0].assignedBy,
        action: "HOD_EMPLOYEES_ASSIGNED",
        details: {
          quarterId,
          source: "scripts/materialize-hod-employee-links.js",
          moves: [...toCreate].map(([employeeId, v]) => ({ employeeId, fromHodUserId: null, toHodUserId: v.hodUserId })),
        },
      },
    }).catch((e) => console.warn("audit log failed:", e.message));
    console.log(`\nInserted ${res.count} link(s).`);
  }

  console.log(`\n${APPLY ? "Done." : "Dry run complete — re-run with --apply to persist."}\n`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
