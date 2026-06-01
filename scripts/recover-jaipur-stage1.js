/**
 * Recover Jaipur Stage 1 (and later-stage) assessment history that was
 * cascade-deleted by the old destructive sheet import on 2026-06-01 ~04:25Z.
 *
 * HOW IT WORKS
 *   The deleted rows still exist in Neon's write-ahead-log history. Create a
 *   Point-in-Time branch of the database at a timestamp just BEFORE the delete
 *   (e.g. 2026-06-01T04:20:00Z), then run this script with that branch's
 *   connection string as RECOVERY_DATABASE_URL. The script reads the old
 *   assessment rows from the branch and re-inserts them into the LIVE database,
 *   re-linking every row to the CURRENT employee by empCode (because the live
 *   employees now have fresh User.ids after the destructive recreate).
 *
 *   Nothing in the live DB is deleted or overwritten — existing rows are kept
 *   (skipDuplicates), only missing history is restored.
 *
 * USAGE
 *   # 1. Create the PITR branch (done separately / by the auth'd neonctl run).
 *   # 2. Preview:
 *   RECOVERY_DATABASE_URL="postgresql://...branch..." node scripts/recover-jaipur-stage1.js --dry
 *   # 3. Restore:
 *   RECOVERY_DATABASE_URL="postgresql://...branch..." node scripts/recover-jaipur-stage1.js
 */
const { PrismaClient } = require("@prisma/client");

const DRY_RUN = process.argv.includes("--dry");
const BRANCH_NAME = "Jaipur";
const SRC_URL = process.env.RECOVERY_DATABASE_URL;

if (!SRC_URL) {
  console.error("ERROR: set RECOVERY_DATABASE_URL to the Point-in-Time branch connection string.");
  process.exit(1);
}

const src = new PrismaClient({ datasources: { db: { url: SRC_URL } } });
const dst = new PrismaClient(); // live DB from .env DATABASE_URL

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

async function main() {
  // 1) Resolve Jaipur on both sides (branch id is stable across the delete).
  const srcBranch = await src.branch.findFirst({ where: { name: { equals: BRANCH_NAME, mode: "insensitive" } }, select: { id: true } });
  const dstBranch = await dst.branch.findFirst({ where: { name: { equals: BRANCH_NAME, mode: "insensitive" } }, select: { id: true } });
  if (!srcBranch || !dstBranch) throw new Error("Jaipur branch not found on one side");

  // 2a) OLD users (pre-delete snapshot) for Jaipur — the employees who own the
  //     Stage 1 / evaluation history we are recovering.
  const oldUsers = await src.user.findMany({
    where: { OR: [{ branchId: srcBranch.id }, { department: { branchId: srcBranch.id } }] },
    select: { id: true, empCode: true, name: true },
  });
  const oldCodes = oldUsers.map((u) => u.empCode).filter(Boolean);

  // 2b) GLOBAL old id -> empCode map (every user in the snapshot). Needed so we
  //     can remap evaluators (CM/HR/BM/HOD/supervisor) who sit OUTSIDE Jaipur.
  const allOldUsers = await src.user.findMany({ select: { id: true, empCode: true } });
  const oldIdToCode = new Map(allOldUsers.map((u) => [u.id, u.empCode]));

  // 3) empCode -> CURRENT user.id (live). Also include all live users so we can
  //    remap evaluators (BM/HOD/CM/HR/supervisor) who may sit outside Jaipur.
  const liveUsers = await dst.user.findMany({ select: { id: true, empCode: true } });
  const codeToLiveId = new Map(liveUsers.filter((u) => u.empCode).map((u) => [u.empCode, u.id]));

  // Helper: remap an OLD userId -> LIVE userId via empCode. null if unmappable.
  const remap = (oldId) => {
    const code = oldIdToCode.get(oldId) || null;
    if (!code) return null;
    return codeToLiveId.get(code) || null;
  };

  const oldUserIds = oldUsers.map((u) => u.id);
  const report = {};

  // ── 4) Self-assessments (the actual Stage 1 evaluation data) ──
  const oldSelf = await src.selfAssessment.findMany({ where: { userId: { in: oldUserIds } } });
  const selfRows = [];
  let selfUnmapped = 0;
  for (const s of oldSelf) {
    const uid = remap(s.userId);
    if (!uid) { selfUnmapped++; continue; }
    selfRows.push({
      userId: uid, quarterId: s.quarterId, answers: s.answers,
      submittedAt: s.submittedAt, maxScore: s.maxScore, normalizedScore: s.normalizedScore,
      rawScore: s.rawScore, completionTimeSeconds: s.completionTimeSeconds,
    });
  }
  report.selfAssessments = { found: oldSelf.length, mappable: selfRows.length, unmapped: selfUnmapped };

  // ── 5) Later-stage evaluations (employeeId + evaluator remap, best-effort) ──
  const collectEval = async (model, evaluatorField) => {
    const rows = await src[model].findMany({ where: { employeeId: { in: oldUserIds } } });
    const out = [];
    let skipped = 0;
    for (const r of rows) {
      const emp = remap(r.employeeId);
      const eval_ = remap(r[evaluatorField]);
      if (!emp || !eval_) { skipped++; continue; }
      const { id, ...rest } = r; // drop old PK, keep all score columns + answers
      out.push({ ...rest, employeeId: emp, [evaluatorField]: eval_ });
    }
    return { out, found: rows.length, skipped };
  };

  const sup = await collectEval("supervisorEvaluation", "supervisorId");
  const hod = await collectEval("hodEvaluation", "hodId");
  const bm  = await collectEval("branchManagerEvaluation", "managerId");
  const cm  = await collectEval("clusterManagerEvaluation", "clusterId");
  const hr  = await collectEval("hrEvaluation", "hrUserId");
  report.supervisorEvaluations = { found: sup.found, mappable: sup.out.length, skipped: sup.skipped };
  report.hodEvaluations = { found: hod.found, mappable: hod.out.length, skipped: hod.skipped };
  report.bmEvaluations = { found: bm.found, mappable: bm.out.length, skipped: bm.skipped };
  report.cmEvaluations = { found: cm.found, mappable: cm.out.length, skipped: cm.skipped };
  report.hrEvaluations = { found: hr.found, mappable: hr.out.length, skipped: hr.skipped };

  console.log(DRY_RUN ? "=== RECOVERY DRY RUN (no writes) ===" : "=== RECOVERY (writing to live DB) ===");
  console.log("Old Jaipur users in snapshot:", oldUsers.length, "| live empCodes matched:", oldCodes.filter((c) => codeToLiveId.has(c)).length);
  console.dir(report, { depth: null });

  if (DRY_RUN) { console.log("\nDry run complete — no changes written."); return; }

  // ── 6) Write to live DB. skipDuplicates protects any rows the employee
  //       re-created after the wipe (unique on userId/employeeId + quarterId). ──
  let restored = { self: 0, sup: 0, hod: 0, bm: 0, cm: 0, hr: 0 };
  for (const part of chunk(selfRows, 200)) {
    const res = await dst.selfAssessment.createMany({ data: part, skipDuplicates: true });
    restored.self += res.count;
  }
  const writeEval = async (model, rows) => {
    let n = 0;
    for (const part of chunk(rows, 200)) {
      const res = await dst[model].createMany({ data: part, skipDuplicates: true });
      n += res.count;
    }
    return n;
  };
  restored.sup = await writeEval("supervisorEvaluation", sup.out);
  restored.hod = await writeEval("hodEvaluation", hod.out);
  restored.bm  = await writeEval("branchManagerEvaluation", bm.out);
  restored.cm  = await writeEval("clusterManagerEvaluation", cm.out);
  restored.hr  = await writeEval("hrEvaluation", hr.out);

  // ── 7) Branch-level shortlist/winner rows. These key on the STABLE branchId
  //       (not departmentId), so a straight userId remap + skipDuplicates is
  //       safe. Rank-unique collisions are skipped by ON CONFLICT DO NOTHING. ──
  const recoverByUser = async (model) => {
    const rows = await src[model].findMany({ where: { userId: { in: oldUserIds } } });
    const data = [];
    for (const r of rows) {
      const uid = remap(r.userId);
      if (!uid) continue;
      const { id, ...rest } = r;
      data.push({ ...rest, userId: uid });
    }
    let n = 0;
    for (const part of chunk(data, 200)) {
      const res = await dst[model].createMany({ data: part, skipDuplicates: true });
      n += res.count;
    }
    return { found: rows.length, restored: n };
  };
  restored.branchShortlist1 = (await recoverByUser("branchShortlistStage1")).restored;
  restored.branchShortlist2 = (await recoverByUser("branchShortlistStage2")).restored;
  restored.branchShortlist3 = (await recoverByUser("branchShortlistStage3")).restored;
  restored.branchShortlist4 = (await recoverByUser("branchShortlistStage4")).restored;
  restored.branchBestEmployee = (await recoverByUser("branchBestEmployee")).restored;

  console.log("\nRestored rows (new inserts, duplicates skipped):");
  console.dir(restored, { depth: null });
  console.log("\nRecovery complete. Self-assessment history is now visible; if Stage 1 counts/queue");
  console.log("look off, run the Admin 'recompute' for the quarter to re-rank the shortlist.");
}

main()
  .catch((e) => { console.error("RECOVERY FAILED:", e); process.exitCode = 1; })
  .finally(async () => { await src.$disconnect(); await dst.$disconnect(); });
