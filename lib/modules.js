// Module registry — single source of truth for the platform launcher + rail.
// Each module is independent (separate data, routes, dashboards). The rail and
// launcher are data-driven from this list so new modules stay easy to add.
//
// `icon` values are KEYS into the `Ic` set (components/ui/Icons.jsx) so this
// file stays free of JSX and can be imported by both server and client code.
// Fixed display order: Quarterly Evaluation, Feedback & Survey, Online Exam.

export const MODULES = [
    {
        id: "qe",
        name: "Quarterly Evaluation",
        short: "Quarterly",
        tag: "Live",
        desc: "Multi-stage quarterly performance appraisal across all branches — self assessment through HR committee.",
        icon: "clipboard",
        accent: "#003087", // ap-blue
        tint: "#EEF3FB",
        defaultRoute: "/dashboard/admin",
        stat: "Q2 2026",
        statLabel: "active quarter",
        // QE keeps its own existing shell + sidebar; not re-rendered in ModuleShell.
        nav: null,
    },
    {
        id: "fs",
        name: "Feedback & Survey",
        short: "Feedback",
        tag: "Stable",
        desc: "Collect structured feedback and run organization-wide pulse surveys. Track sentiment and response rates.",
        icon: "chat",
        accent: "#00843D", // ap-green
        tint: "#EBF7F1",
        defaultRoute: "/dashboard/modules/feedback",
        stat: "6",
        statLabel: "active surveys",
        nav: [
            { section: "", items: [{ id: "overview", label: "Overview", icon: "grid", href: "/dashboard/modules/feedback" }] },
            {
                section: "Manage",
                items: [
                    { id: "surveys", label: "Surveys", icon: "chat", href: "/dashboard/modules/feedback", badge: "6" },
                    { id: "responses", label: "Responses", icon: "list", href: "/dashboard/modules/feedback" },
                    { id: "templates", label: "Templates", icon: "doc", href: "/dashboard/modules/feedback" },
                ],
            },
        ],
    },
    {
        id: "exam",
        name: "Online Exam",
        short: "Online Exam",
        tag: "New",
        desc: "Create Google-Forms-style assessments, target precise audiences, and analyze results with rich charts.",
        icon: "exam",
        accent: "#F7941D", // ap-orange
        tint: "#FEF4E8",
        defaultRoute: "/dashboard/exam",
        stat: "3",
        statLabel: "exams running",
        nav: [
            { section: "", items: [{ id: "list", label: "All Exams", icon: "grid", href: "/dashboard/exam" }] },
            {
                section: "Build",
                items: [
                    { id: "builder", label: "Create Exam", icon: "type", href: "/dashboard/exam/new" },
                ],
            },
            {
                section: "Analyze",
                items: [
                    { id: "results", label: "Results", icon: "slider", href: "/dashboard/exam" },
                ],
            },
        ],
    },
];

export const MODULE_BY_ID = Object.fromEntries(MODULES.map((m) => [m.id, m]));

export const LAUNCHER_ROUTE = "/dashboard/modules";

export function getModule(id) {
    return MODULE_BY_ID[id] || MODULES[0];
}
