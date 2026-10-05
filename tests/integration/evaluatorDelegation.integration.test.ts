import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * End-to-end check of department evaluator POA against a REAL Postgres
 * database, driving the actual route handlers (BM / CM / HR / Committee
 * evaluate + queues, admin POA API, login, reports).
 *
 * Opt-in and local-only: runs only when POA_INTEGRATION_DB points at a
 * localhost database (it seeds and mutates data). It is skipped in the normal
 * `npm test` run and can never touch a hosted database.
 *
 *   POA_INTEGRATION_DB="postgresql://…@localhost:5432/ap_poa_test" npx vitest run tests/integration
 *
 * The DB must already have the current schema (prisma db push / migrate).
 */
const DB = process.env.POA_INTEGRATION_DB || "";
const enabled = /@(localhost|127\.0\.0\.1)[:/]/.test(DB);

/* eslint-disable @typescript-eslint/no-explicit-any */
let prisma: any;
let NextRequest: any;
const R: Record<string, any> = {}; // route modules

type U = { id: string; role: string; empCode?: string | null; name?: string };
async function call(handler: any, opts: { method?: string; path?: string; user?: U; body?: any; params?: any } = {}) {
    const headers = new Headers({ "content-type": "application/json" });
    if (opts.user) {
        headers.set("x-user-id", opts.user.id);
        headers.set("x-user-role", opts.user.role);
        headers.set("x-user-empcode", opts.user.empCode || "");
    }
    const req = new NextRequest(`http://localhost${opts.path || "/api/x"}`, {
        method: opts.method || "GET",
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const res = await handler(req, { params: opts.params || {} });
    const json = await res.json();
    return { status: res.status, ...json };
}

const S: Record<string, any> = {}; // seeded ids/users

async function setActiveStage(n: number) {
    await prisma.quarterStage.updateMany({ where: { quarterId: S.quarter.id }, data: { status: "SCHEDULED" } });
    await prisma.quarterStage.updateMany({ where: { quarterId: S.quarter.id, stageNumber: { lt: n } }, data: { status: "COMPLETED" } });
    await prisma.quarterStage.updateMany({ where: { quarterId: S.quarter.id, stageNumber: n }, data: { status: "ACTIVE" } });
}

const answers = (qIds: string[], score: number) => qIds.map((questionId) => ({ questionId, score }));
const ids = (rows: any[]) => rows.map((r: any) => r.userId || r.id).sort();

describe.skipIf(!enabled)("Department evaluator POA — integration (local DB)", () => {
    beforeAll(async () => {
        process.env.DATABASE_URL = DB;
        process.env.JWT_SECRET = "poa-integration-secret";
        ({ NextRequest } = await import("next/server"));
        prisma = (await import("../../lib/prisma")).default;
        R.bmShortlist = (await import("../../app/api/branch-manager/shortlist/route.js")).GET;
        R.bmDepartments = (await import("../../app/api/branch-manager/departments/route.js")).GET;
        R.bmEvaluate = (await import("../../app/api/branch-manager/evaluate/route.js")).POST;
        R.cmDepartments = (await import("../../app/api/cluster-manager/departments/route.js")).GET;
        R.cmEvaluate = (await import("../../app/api/cluster-manager/evaluate/route.js")).POST;
        R.hrShortlist = (await import("../../app/api/hr/shortlist/route.js")).GET;
        R.hrEvaluate = (await import("../../app/api/hr/evaluate/route.js")).POST;
        R.committee = (await import("../../app/api/committee/results/route.js")).GET;
        R.winners = (await import("../../app/api/admin/winners/route.js")).GET;
        R.poa = await import("../../app/api/admin/branches/[branchId]/evaluator-delegations/route.js");
        R.reports = (await import("../../app/api/admin/reports/route.js")).GET;
        R.answerSheet = (await import("../../app/api/admin/answer-sheet/route.js")).GET;
        R.login = (await import("../../app/api/auth/login/route.js")).POST;

        // ── wipe (disposable local DB) ──
        await prisma.$executeRawUnsafe(`DO $$ DECLARE r record; BEGIN
            FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' LOOP
                EXECUTE 'TRUNCATE TABLE "' || r.tablename || '" CASCADE'; END LOOP; END $$;`);

        const bcrypt = (await import("bcryptjs")).default;
        const pw = await bcrypt.hash("x", 4);

        S.jaipur = await prisma.branch.create({ data: { name: "Jaipur", slug: "jaipur", location: "Jaipur", branchType: "SMALL" } });
        S.jodhpur = await prisma.branch.create({ data: { name: "Jodhpur", slug: "jodhpur", location: "Jodhpur", branchType: "SMALL" } });
        const dept = (name: string, branchId: string) => prisma.department.create({ data: { name, branchId } });
        S.jFin = await dept("Finance", S.jaipur.id);
        S.jHr = await dept("HR", S.jaipur.id);
        S.jOps = await dept("Operations", S.jaipur.id);
        S.dFin = await dept("Finance", S.jodhpur.id);

        const user = (name: string, empCode: string, role: string, departmentId: string | null = null, extra: any = {}) =>
            prisma.user.create({ data: { name, empCode, role, departmentId, password: pw, collarType: departmentId ? "WHITE_COLLAR" : null, designation: extra.designation || null, ...extra } });
        S.admin = await user("Admin User", "9000000", "ADMIN");
        S.bmJ = await user("Bm Jaipur", "9000001", "BRANCH_MANAGER");
        S.bmD = await user("Bm Jodhpur", "9000002", "BRANCH_MANAGER");
        S.cmA = await user("Cm Alpha", "9000003", "CLUSTER_MANAGER");
        S.cmB = await user("Cm Beta", "9000004", "CLUSTER_MANAGER");
        S.hrA = await user("Hr Alpha", "9000005", "HR");
        S.hrB = await user("Hr Beta", "9000006", "HR");
        S.comA = await user("Com Alpha", "9000007", "COMMITTEE");
        S.comB = await user("Com Beta", "9000008", "COMMITTEE");
        // Finance Head: an ordinary employee whose primary password is the empCode.
        S.finHead = await prisma.user.create({
            data: { name: "Rakesh Sharma", empCode: "1000101", role: "EMPLOYEE", departmentId: S.jFin.id, collarType: "WHITE_COLLAR", designation: "Finance Head", password: await bcrypt.hash("1000101", 4) },
        });
        S.f1 = await user("Fin One", "1000102", "EMPLOYEE", S.jFin.id);
        S.f2 = await user("Fin Two", "1000103", "EMPLOYEE", S.jFin.id);
        S.h1 = await user("Hr One", "1000104", "EMPLOYEE", S.jHr.id);
        S.h2 = await user("Hr Two", "1000105", "EMPLOYEE", S.jHr.id);
        S.o1 = await user("Ops One", "1000106", "EMPLOYEE", S.jOps.id);
        S.d1 = await user("Jodhpur Fin", "2000101", "EMPLOYEE", S.dFin.id);

        const by = S.admin.id;
        await prisma.branchManagerAssignment.create({ data: { bmUserId: S.bmJ.id, branchId: S.jaipur.id, assignedBy: by } });
        await prisma.branchManagerAssignment.create({ data: { bmUserId: S.bmD.id, branchId: S.jodhpur.id, assignedBy: by } });
        await prisma.clusterManagerBranchAssignment.create({ data: { cmUserId: S.cmA.id, branchId: S.jaipur.id, assignedBy: by } });
        await prisma.clusterManagerBranchAssignment.create({ data: { cmUserId: S.cmB.id, branchId: S.jodhpur.id, assignedBy: by } });
        await prisma.hrBranchAssignment.create({ data: { hrUserId: S.hrA.id, branchId: S.jaipur.id, assignedBy: by } });
        await prisma.hrBranchAssignment.create({ data: { hrUserId: S.hrB.id, branchId: S.jodhpur.id, assignedBy: by } });
        await prisma.committeeBranchAssignment.create({ data: { memberUserId: S.comA.id, branchId: S.jaipur.id, assignedBy: by } });
        await prisma.committeeBranchAssignment.create({ data: { memberUserId: S.comB.id, branchId: S.jodhpur.id, assignedBy: by } });

        S.quarter = await prisma.quarter.create({ data: { name: "Q-POA-TEST", status: "ACTIVE", startDate: new Date(Date.now() - 864e5), endDate: new Date(Date.now() + 30 * 864e5) } });
        for (let n = 1; n <= 5; n++) await prisma.quarterStage.create({ data: { quarterId: S.quarter.id, stageNumber: n } });

        const q = async (text: string, level: string) => {
            const qq = await prisma.question.create({ data: { text, level, isActive: true } });
            await prisma.quarterQuestion.create({ data: { quarterId: S.quarter.id, questionId: qq.id } });
            return qq.id;
        };
        S.bmQ = [await q("BM q1", "BRANCH_MANAGER"), await q("BM q2", "BRANCH_MANAGER")];
        S.cmQ = [await q("CM q1", "CLUSTER_MANAGER"), await q("CM q2", "CLUSTER_MANAGER")];

        const jaipurCandidates = [S.finHead, S.f1, S.f2, S.h1, S.h2, S.o1];
        let rank = 1;
        for (const c of jaipurCandidates) {
            await prisma.branchShortlistStage1.create({ data: { userId: c.id, quarterId: S.quarter.id, branchId: S.jaipur.id, collarType: "WHITE_COLLAR", selfScore: 80, rank: rank++ } });
        }
        await prisma.branchShortlistStage1.create({ data: { userId: S.d1.id, quarterId: S.quarter.id, branchId: S.jodhpur.id, collarType: "WHITE_COLLAR", selfScore: 80, rank: 1 } });
        for (const c of [...jaipurCandidates, S.d1]) {
            await prisma.selfAssessment.create({ data: { userId: c.id, quarterId: S.quarter.id, answers: [], maxScore: 100, normalizedScore: 80, rawScore: 80 } });
        }
        // Scores that make Finance Head, Fin One and Hr One the Jaipur top 3.
        S.top = new Set([S.finHead.id, S.f1.id, S.h1.id]);
        await setActiveStage(2);
    }, 60_000);

    afterAll(async () => { if (prisma) await prisma.$disconnect(); });

    const bmEval = (who: U, emp: any) => call(R.bmEvaluate, { method: "POST", user: who, body: { employeeId: emp.id, answers: answers(S.bmQ, S.top.has(emp.id) ? 5 : 2) } });
    const poaPost = (body: any) => call(R.poa.POST, { method: "POST", user: S.admin, params: { branchId: "jaipur" }, body });
    const poaDelete = (id: string) => call(R.poa.DELETE, { method: "DELETE", user: S.admin, params: { branchId: "jaipur" }, path: `/api/x?id=${id}` });

    it("CASE 1 — no POA: branch BM queue is the whole branch; nobody else has one", async () => {
        const bm = await call(R.bmShortlist, { user: S.bmJ });
        expect(bm.status).toBe(200);
        expect(ids(bm.data.employees)).toEqual(ids([S.finHead, S.f1, S.f2, S.h1, S.h2, S.o1]));
        expect(bm.data.delegateOnly).toBe(false);
        const fh = await call(R.bmShortlist, { user: { ...S.finHead, role: "BRANCH_MANAGER" } });
        expect(fh.status).toBe(400);
    });

    it("assign BM POA — validation, and original employee data is never changed", async () => {
        const before = await prisma.user.findUnique({ where: { id: S.finHead.id }, select: { role: true, departmentId: true, branchId: true, designation: true, collarType: true, name: true, empCode: true, password: true } });
        const userCount = await prisma.user.count();

        expect((await poaPost({ departmentId: S.jFin.id, evaluatorType: "BRANCH_MANAGER", userId: S.bmJ.id })).status).toBe(409); // already branch default
        expect((await poaPost({ departmentId: S.dFin.id, evaluatorType: "BRANCH_MANAGER", userId: S.finHead.id })).status).toBe(400); // other branch's dept

        const res = await poaPost({ departmentId: S.jFin.id, evaluatorType: "BRANCH_MANAGER", userId: S.finHead.id });
        expect(res.status).toBe(201);
        S.bmPoaId = res.data.delegation.id;
        expect((await poaPost({ departmentId: S.jFin.id, evaluatorType: "BRANCH_MANAGER", userId: S.f1.id })).status).toBe(409); // single slot — must use Change

        const after = await prisma.user.findUnique({ where: { id: S.finHead.id }, select: { role: true, departmentId: true, branchId: true, designation: true, collarType: true, name: true, empCode: true, password: true, passwordHod: true } });
        const { passwordHod, ...rest } = after;
        expect(rest).toEqual(before);
        expect(passwordHod).toBeTruthy(); // evaluator sign-in provisioned
        expect(await prisma.user.count()).toBe(userCount); // no duplicate employee
    });

    it("CASE 2 — queues: delegate gets Finance (minus self); BM keeps the rest + the delegate's own record; Jodhpur untouched", async () => {
        const bm = await call(R.bmShortlist, { user: S.bmJ });
        expect(ids(bm.data.employees)).toEqual(ids([S.finHead, S.h1, S.h2, S.o1]));
        const fh = await call(R.bmShortlist, { user: { ...S.finHead, role: "BRANCH_MANAGER" } });
        expect(fh.status).toBe(200);
        expect(fh.data.delegateOnly).toBe(true);
        expect(ids(fh.data.employees)).toEqual(ids([S.f1, S.f2]));
        expect(fh.data.employees.every((e: any) => e.delegated)).toBe(true);
        const deps = await call(R.bmDepartments, { user: { ...S.finHead, role: "BRANCH_MANAGER" } });
        expect(deps.data.delegateOnly).toBe(true);
        expect(deps.data.departments.map((d: any) => d.id)).toEqual([S.jFin.id]);
        const jod = await call(R.bmShortlist, { user: S.bmD });
        expect(ids(jod.data.employees)).toEqual([S.d1.id]);
    });

    it("CASES 2/7/10 — server-side authorization on evaluate", async () => {
        const FH = { ...S.finHead, role: "BRANCH_MANAGER" };
        const self = await bmEval(FH, S.finHead);
        expect(self.status).toBe(403);
        expect(self.message).toMatch(/yourself/i);
        expect((await bmEval(FH, S.h1)).status).toBe(403); // unrelated department
        expect((await bmEval(FH, S.d1)).status).toBe(403); // CASE 10 — Jodhpur Finance
        const bmOnFin = await bmEval(S.bmJ, S.f1);
        expect(bmOnFin.status).toBe(403);
        expect(bmOnFin.message).toMatch(/Power of Attorney/);

        expect((await bmEval(FH, S.f1)).status).toBe(201);
        expect((await bmEval(S.bmJ, S.finHead)).status).toBe(201); // CASE 7 fallback
        expect((await bmEval(S.bmJ, S.h1)).status).toBe(201);

        const rows = await prisma.branchManagerEvaluation.findMany({ where: { quarterId: S.quarter.id }, select: { employeeId: true, managerId: true, viaDelegation: true } });
        const byEmp = new Map(rows.map((r: any) => [r.employeeId, r]));
        expect(byEmp.get(S.f1.id)).toMatchObject({ managerId: S.finHead.id, viaDelegation: true });
        expect(byEmp.get(S.finHead.id)).toMatchObject({ managerId: S.bmJ.id, viaDelegation: false });
        expect(byEmp.get(S.h1.id)).toMatchObject({ managerId: S.bmJ.id, viaDelegation: false });
    });

    it("CASE 8 — POA removed: immediate fallback, no double evaluation", async () => {
        expect((await poaDelete(S.bmPoaId)).status).toBe(200);
        const bm = await call(R.bmShortlist, { user: S.bmJ });
        expect(ids(bm.data.employees)).toEqual(ids([S.finHead, S.f1, S.f2, S.h1, S.h2, S.o1]));
        expect(bm.data.employees.find((e: any) => e.userId === S.f1.id).alreadyEvaluated).toBe(true);
        expect((await bmEval(S.bmJ, S.f1)).status).toBe(409); // already done by the (former) delegate
        expect((await bmEval(S.bmJ, S.f2)).status).toBe(201);
        expect((await call(R.bmShortlist, { user: { ...S.finHead, role: "BRANCH_MANAGER" } })).status).toBe(400);
    });

    it("CASE 9 — same person, several departments; global role unchanged", async () => {
        const a = await poaPost({ departmentId: S.jFin.id, evaluatorType: "BRANCH_MANAGER", userId: S.finHead.id });
        const b = await poaPost({ departmentId: S.jOps.id, evaluatorType: "BRANCH_MANAGER", userId: S.finHead.id });
        expect([a.status, b.status]).toEqual([201, 201]);
        const fh = await call(R.bmShortlist, { user: { ...S.finHead, role: "BRANCH_MANAGER" } });
        expect(ids(fh.data.employees)).toEqual(ids([S.f1, S.f2, S.o1]));
        expect((await bmEval({ ...S.finHead, role: "BRANCH_MANAGER" }, S.o1)).status).toBe(201);
        expect((await bmEval(S.bmJ, S.o1)).status).toBe(403); // Ops is now delegated — BM refused before any duplicate check
        expect((await bmEval(S.bmJ, S.h2)).status).toBe(201);
        expect((await bmEval(S.bmD, S.d1)).status).toBe(201);
        expect((await prisma.user.findUnique({ where: { id: S.finHead.id } })).role).toBe("EMPLOYEE");
        const s2 = await prisma.branchShortlistStage2.count({ where: { quarterId: S.quarter.id, branchId: S.jaipur.id } });
        expect(s2).toBe(6); // Stage 2 qualification unchanged (SMALL limit 10)
        S.bmSnapshot = await prisma.branchManagerEvaluation.findMany({ orderBy: { id: "asc" } });
    });

    it("CASE 3 — Cluster Manager POA", async () => {
        await setActiveStage(3);
        expect((await poaPost({ departmentId: S.jFin.id, evaluatorType: "CLUSTER_MANAGER", userId: S.cmB.id })).status).toBe(201);

        const a = await call(R.cmDepartments, { user: S.cmA, path: `/api/x?branchId=${S.jaipur.id}` });
        const aEmp = a.data.departments.flatMap((d: any) => d.shortlist);
        expect(ids(aEmp)).toEqual(ids([S.h1, S.h2, S.o1]));
        const b = await call(R.cmDepartments, { user: S.cmB, path: `/api/x?branchId=${S.jaipur.id}` });
        expect(b.status).toBe(200);
        expect(b.data.branch.delegated).toBe(true);
        expect(b.data.departments.map((d: any) => d.id)).toEqual([S.jFin.id]);
        expect(ids(b.data.departments.flatMap((d: any) => d.shortlist))).toEqual(ids([S.finHead, S.f1, S.f2]));
        expect(b.data.assignedBranches.map((x: any) => [x.name, x.delegated])).toEqual([["Jodhpur", false], ["Jaipur", true]]);

        const cm = (who: U, emp: any) => call(R.cmEvaluate, { method: "POST", user: who, body: { employeeId: emp.id, answers: answers(S.cmQ, S.top.has(emp.id) ? 5 : 2) } });
        expect((await cm(S.cmA, S.f1)).status).toBe(403);
        for (const e of [S.finHead, S.f1, S.f2]) expect((await cm(S.cmB, e)).status).toBe(201);
        for (const e of [S.h1, S.h2, S.o1]) expect((await cm(S.cmA, e)).status).toBe(201);
        expect((await cm(S.cmB, S.h1)).status).toBe(403);
        expect((await cm(S.cmB, S.d1)).status).toBe(201); // own branch as default
        const f1 = await prisma.clusterManagerEvaluation.findFirst({ where: { employeeId: S.f1.id } });
        expect(f1).toMatchObject({ clusterId: S.cmB.id, viaDelegation: true });
        expect(await prisma.branchShortlistStage3.count({ where: { branchId: S.jaipur.id } })).toBe(5);
    });

    it("CASE 4 — HR POA (HR scoring untouched)", async () => {
        await setActiveStage(4);
        expect((await poaPost({ departmentId: S.jFin.id, evaluatorType: "HR", userId: S.hrB.id })).status).toBe(201);
        const s3 = await prisma.branchShortlistStage3.findMany({ where: { quarterId: S.quarter.id }, include: { user: { select: { departmentId: true } } } });
        const fin = s3.filter((r: any) => r.user.departmentId === S.jFin.id).map((r: any) => r.userId);
        const nonFin = s3.filter((r: any) => r.branchId === S.jaipur.id && r.user.departmentId !== S.jFin.id).map((r: any) => r.userId);

        const a = await call(R.hrShortlist, { user: S.hrA });
        expect(ids(a.data.employees)).toEqual([...nonFin].sort());
        const b = await call(R.hrShortlist, { user: S.hrB });
        expect(ids(b.data.employees)).toEqual([...fin, S.d1.id].sort());

        const hr = (who: U, id: string) => call(R.hrEvaluate, { method: "POST", user: who, body: {
            employeeId: id, attendancePct: S.top.has(id) ? 95 : 50, punctualityPct: S.top.has(id) ? 95 : 50,
            presentDays: 20, punctualDays: 20, workingDays: 22,
            attendancePdfUrl: "https://example.com/a.pdf", punctualityPdfUrl: "https://example.com/p.pdf",
        } });
        expect((await hr(S.hrA, fin[0])).status).toBe(403);
        for (const id of fin) expect((await hr(S.hrB, id)).status).toBe(200);
        for (const id of nonFin) expect((await hr(S.hrA, id)).status).toBe(200);
        expect((await hr(S.hrB, S.d1.id)).status).toBe(200);
        const row = await prisma.hrEvaluation.findFirst({ where: { employeeId: fin[0] } });
        expect(row).toMatchObject({ hrUserId: S.hrB.id, viaDelegation: true, hrScore: S.top.has(fin[0]) ? 20 : 10 });
    });

    it("CASE 5 — Committee POA", async () => {
        await setActiveStage(5);
        expect((await poaPost({ departmentId: S.jFin.id, evaluatorType: "COMMITTEE", userId: S.comB.id })).status).toBe(201);
        const all = await call(R.winners, { user: S.admin });
        const jaipurWinners = all.data.branches.find((b: any) => b.branchName === "Jaipur").winners.map((w: any) => w.userId).sort();
        expect(jaipurWinners).toEqual([...S.top].sort());

        const a = await call(R.committee, { user: S.comA });
        expect(a.data.results.map((w: any) => w.userId)).toEqual([S.h1.id]);
        const b = await call(R.committee, { user: S.comB });
        expect(b.data.results.map((w: any) => w.userId).sort()).toEqual([S.finHead.id, S.f1.id, S.d1.id].sort());
        // Admin view is unaffected by POA.
        expect(all.data.results.length).toBe(4);
    });

    it("CASE 6 — all four Finance POAs; other departments stay Branch Default", async () => {
        const m = await call(R.poa.GET, { user: S.admin, params: { branchId: "jaipur" } });
        expect(m.status).toBe(200);
        const fin = m.data.departments.find((d: any) => d.id === S.jFin.id);
        const hrDept = m.data.departments.find((d: any) => d.id === S.jHr.id);
        for (const t of ["BRANCH_MANAGER", "CLUSTER_MANAGER", "HR", "COMMITTEE"]) {
            expect(fin.evaluators[t].mode).toBe("DEPARTMENT_POA");
            expect(hrDept.evaluators[t].mode).toBe("BRANCH_DEFAULT");
        }
        const fhRow = fin.evaluators.BRANCH_MANAGER.delegates[0];
        expect(fhRow).toMatchObject({ name: "Rakesh Sharma", empCode: "1000101", homeBranch: "Jaipur", homeDepartment: "Finance", globalRoles: ["Employee"] });
        expect(fin.evaluators.CLUSTER_MANAGER.delegates[0].globalRoles).toEqual(["Cluster Manager (Jodhpur)"]);
    });

    it("CASE 11 — historical evaluations untouched by later POA changes", async () => {
        const now = await prisma.branchManagerEvaluation.findMany({ orderBy: { id: "asc" } });
        expect(now).toEqual(S.bmSnapshot);
    });

    it("CASE 12 — reports show the ACTUAL evaluator and capacity", async () => {
        const rep = await call(R.reports, { user: S.admin });
        const row = (id: string) => rep.data.employees.find((e: any) => e.userId === id);
        expect(row(S.f1.id).stage2.bmEval).toMatchObject({ evaluatorName: "Rakesh Sharma", evaluatorType: "Delegated Branch Manager", viaDelegation: true });
        expect(row(S.finHead.id).stage2.bmEval).toMatchObject({ evaluatorName: "Bm Jaipur", evaluatorType: "Branch Manager" });
        expect(row(S.f1.id).stage3.cmEval).toMatchObject({ evaluatorName: "Cm Beta", evaluatorType: "Delegated Cluster Manager" });
        expect(row(S.f1.id).stage4.hrEval).toMatchObject({ evaluatorName: "Hr Beta", evaluatorType: "Delegated HR Personnel" });
        expect(row(S.h1.id).stage4.hrEval).toMatchObject({ evaluatorName: "Hr Alpha", evaluatorType: "HR Personnel" });
        const sheet = await call(R.answerSheet, { user: S.admin, path: `/api/x?employeeId=${S.f1.id}&stage=2` });
        expect(sheet.data.sheets[0]).toMatchObject({ role: "Delegated Branch Manager", evaluatorName: "Rakesh Sharma" });
    });

    it("login — POA holder reaches the evaluator role only via the evaluator password", async () => {
        const login = (password: string) => call(R.login, { method: "POST", body: { empCode: "1000101", password } });
        const emp = await login("1000101");
        expect(emp.status).toBe(200);
        expect(emp.data.user.role).toBe("EMPLOYEE");
        const ev = await login("Rakesh_01");
        expect(ev.status).toBe(200);
        expect(ev.data.user.role).toBe("BRANCH_MANAGER");
        expect(ev.data.user.branchId).toBe(S.jaipur.id);
        expect((await prisma.user.findUnique({ where: { id: S.finHead.id } })).role).toBe("EMPLOYEE");
        // Unchanged for ordinary staff with no POA.
        expect((await login("wrong")).status).toBe(401);
    });
});
