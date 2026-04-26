/**
 * Generates `public/sample-branch-upload.xlsx` — a ready-to-edit template
 * for the POST /api/admin/branches/bulk-upload endpoint.
 *
 * Covers all the cases admins need to know:
 *   • case-insensitive role values   (CM / cm / cluster_manager / Cluster Manager)
 *   • case-insensitive collar values (WC / White / white_collar)
 *   • case-insensitive headers       ("Emp Code", "EMPCODE", "empcode" all match)
 *   • required ordering              (CM → BM → EMPLOYEE)
 *   • CM/BM blank department/collar
 *   • optional designation/mobile/password
 *
 * Run:  node scripts/generate-sample-branch-upload.js
 */
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const rows = [
    // ── 1 CM row (must come first) ─────────────────────────────────────────
    {
        role: "CM",                     // CM / cm / cluster_manager — all OK
        empCode: "CM001",
        name: "Ramesh Kumar",
        branch: "Jaipur",
        branchType: "BIG",              // BIG | SMALL  (default SMALL)
        department: "",                 // BM/CM leave blank
        collar: "",                     // BM/CM leave blank
        designation: "Cluster Manager",
        mobile: "9876500001",
        password: "",                   // blank → Ramesh_01 (Firstname_last2digits)
    },

    // ── 1 BM row (must come before any EMPLOYEE row) ───────────────────────
    {
        role: "BM",                     // BM / bm / branch_manager — all OK
        empCode: "BM042",
        name: "Suresh Sharma",
        branch: "Jaipur",
        branchType: "BIG",
        department: "",
        collar: "",
        designation: "Branch Manager",
        mobile: "9876500042",
        password: "",                   // blank → Suresh_42
    },

    // ── EMPLOYEE rows (any order after CM/BM) ──────────────────────────────
    {
        role: "Employee",               // Employee / EMPLOYEE / Emp — all OK
        empCode: "EMP1001",
        name: "Priya Singh",
        branch: "Jaipur",
        branchType: "BIG",
        department: "Kitchen",
        collar: "BC",                   // BC | Blue | Blue Collar | blue_collar
        designation: "Cook",
        mobile: "9876501001",
        password: "",                   // blank → EMP1001 (= empCode)
    },
    {
        role: "EMPLOYEE",
        empCode: "EMP1002",
        name: "Amit Verma",
        branch: "Jaipur",
        branchType: "BIG",
        department: "Admin",
        collar: "WC",                   // WC | White | White Collar | white_collar
        designation: "Executive",
        mobile: "9876501002",
        password: "",
    },
    {
        role: "emp",                    // also valid
        empCode: "EMP1003",
        name: "Sunita Devi",
        branch: "Jaipur",
        branchType: "BIG",
        department: "Kitchen",          // same dept → must use same collar
        collar: "Blue Collar",          // case + spacing tolerated
        designation: "Helper",
        mobile: "9876501003",
        password: "",
    },
    {
        role: "Employee",
        empCode: "EMP1004",
        name: "Rajesh Yadav",
        branch: "Jaipur",
        branchType: "BIG",
        department: "Logistics",
        collar: "blue",
        designation: "Driver",
        mobile: "9876501004",
        password: "",
    },
    {
        role: "Employee",
        empCode: "EMP1005",
        name: "Neha Gupta",
        branch: "Jaipur",
        branchType: "BIG",
        department: "HR",
        collar: "white",
        designation: "HR Coordinator",
        mobile: "9876501005",
        password: "",
    },
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(rows, {
    header: ["role", "empCode", "name", "branch", "branchType", "department", "collar", "designation", "mobile", "password"],
});

// Pleasant column widths
ws["!cols"] = [
    { wch: 10 }, { wch: 10 }, { wch: 22 }, { wch: 12 }, { wch: 12 },
    { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 14 },
];

XLSX.utils.book_append_sheet(wb, ws, "Branch");

const outDir = path.join(__dirname, "..", "public");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const outFile = path.join(outDir, "sample-branch-upload.xlsx");
XLSX.writeFile(wb, outFile);

console.log(`✓ Wrote ${outFile}`);
console.log(`  ${rows.length} rows: 1 CM, 1 BM, ${rows.filter(r => /^(emp|employee)/i.test(r.role)).length} employees.`);
