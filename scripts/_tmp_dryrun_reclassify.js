/**
 * Dry-run: for every empCode that the user resolved as BC (164) or kept as WC
 * (2 exceptions), look up the current Neon row and show what would change.
 * READ-ONLY. No writes. Run with `node scripts/_tmp_dryrun_reclassify.js`.
 *
 * Source rules (from the user's decision on 2026-05-21):
 *   - SYOJI RAM JAT (1800046) → keep WHITE_COLLAR
 *   - Jagdish Prasad Meena (1801105) → keep WHITE_COLLAR
 *   - All other 164 conflict empCodes → BLUE_COLLAR
 *
 * The 166 conflict empCodes come from the xlsx classification step.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// 166 conflict empCodes from xlsx_conflicts_by_group.txt (computed earlier).
// 2 exceptions kept as WC; the rest go to BC.
const KEEP_WC = new Set(["1800046", "1801105"]);

const ALL_166 = [
    // Group 1 (125) — Production-Helper blue collor ∩ Production-White Collar
    "1801105","1802153","1800056","1801872","1800169","1801167","1801368","1801776",
    "1802258","1802333","1801745","1802159","1802334","1802192","1800094","1802337",
    "1801416","1802006","1801363","1802232","1802222","1802299","1800133","1800106",
    "1802217","1801587","1802385","1800221","1800282","1800171","1800989","1802361",
    "1802284","1801180","1801919","1801841","1802253","1800144","1802075","1800168",
    "1802288","1802387","1802145","1801079","1800557","1801187","1800060","1800979",
    "1800134","1801748","1802188","1802328","1800135","1800160","1800110","1801840",
    "1802324","1802384","1801078","1801391","1801912","1802049","1801607","1800050",
    "1801642","1800120","1802371","1802289","1802264","1800153","1802147","1801735",
    "1801952","1800082","1802363","1802009","1802152","1802073","1801544","1802141",
    "1800137","1800112","1801747","1802240","1802233","1802099","1802090","1802377",
    "1801878","1800496","1800113","1802119","1801873","1800115","1801846","1802269",
    "1802375","1801053","1802118","1801780","1802360","1801892","1800978","1801534",
    "1800154","1801947","1802365","1801924","1800117","1801728","1801746","1801025",
    "1800046","1802383","1800143","1802254","1802287","1801427","1802345","1801938",
    "1801545","1801853","1800474","1802281","1802369",
    // Group 2 (41) — Distribution-Helper blue collor ∩ Production-White Collar
    "1801219","1801220","1801221","1801781","1801658","1801225","1801226","1801227",
    "1802374","1802378","1801232","1801198","1802040","1801862","1801236","1801237",
    "1801238","1801961","1801240","1801241","1801242","1801243","1801767","1802331",
    "1801246","1801248","1802059","1802244","1801252","1801291","1802355","1801253",
    "1801254","1802339","1802057","1802025","1801656","1802069","1801768","1801259",
    "1801260",
];

(async () => {
    const codes = ALL_166;
    console.log(`Total empCodes to inspect: ${codes.length}  (expected 166)`);
    console.log(`  KEEP_WC: ${Array.from(KEEP_WC).join(", ")}`);
    console.log("-".repeat(110));

    const users = await prisma.user.findMany({
        where: { empCode: { in: codes } },
        select: {
            id: true,
            empCode: true,
            name: true,
            collarType: true,
            role: true,
            department: { select: { id: true, name: true, collarType: true, branch: { select: { name: true } } } },
        },
        orderBy: [{ empCode: "asc" }],
    });

    const byCode = new Map(users.map(u => [u.empCode, u]));

    const summary = {
        notFound: [],
        alreadyCorrect: [],
        wouldChangeToBC: [],
        wouldChangeToWC: [],
    };

    console.log(
        ["empCode","Name","Dept","DeptCollar","UserCollar","Target","Action"].map((s,i) => s.padEnd([10,30,28,12,12,12,30][i])).join("")
    );
    console.log("-".repeat(110));
    for (const code of codes) {
        const target = KEEP_WC.has(code) ? "WHITE_COLLAR" : "BLUE_COLLAR";
        const u = byCode.get(code);
        if (!u) {
            summary.notFound.push(code);
            console.log(["NOTFOUND", "(empCode not in DB)", "—", "—", "—", target, "skip"]
                .map((s,i) => String(s).padEnd([10,30,28,12,12,12,30][i])).join(""));
            continue;
        }
        const userCollar = u.collarType || "(null)";
        const deptCollar = u.department?.collarType || "(no dept)";
        const effective = u.collarType || u.department?.collarType || "(unknown)";
        let action;
        if (effective === target) {
            summary.alreadyCorrect.push(code);
            action = "OK — already correct";
        } else {
            // set User.collarType to target
            action = `UPDATE User.collarType: ${userCollar} → ${target}`;
            if (target === "BLUE_COLLAR") summary.wouldChangeToBC.push(code);
            else summary.wouldChangeToWC.push(code);
        }
        console.log([
            code,
            (u.name || "").slice(0, 28),
            (u.department?.name || "(no dept)").slice(0, 26),
            deptCollar,
            userCollar,
            target,
            action,
        ].map((s,i) => String(s).padEnd([10,30,28,12,12,12,30][i])).join(""));
    }
    console.log("-".repeat(110));
    console.log(`SUMMARY:`);
    console.log(`  Not in DB        : ${summary.notFound.length}`);
    console.log(`  Already correct  : ${summary.alreadyCorrect.length}`);
    console.log(`  Would change → BC: ${summary.wouldChangeToBC.length}`);
    console.log(`  Would change → WC: ${summary.wouldChangeToWC.length}`);
    if (summary.notFound.length) {
        console.log(`\n  empCodes not in DB:`);
        for (const c of summary.notFound) console.log(`    ${c}`);
    }
    await prisma.$disconnect();
})().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
