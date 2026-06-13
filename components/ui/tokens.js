// JS-side brand colors (recharts, inline styles). Class-side mirror lives in
// tailwind.config.js (`ap-blue`, `ap-border`, …) — keep the two in sync.
export const AP = {
    blue: "#003087",
    green: "#00843D",
    orange: "#F7941D",
    dark: "#0D1B3E",
    bg: "#F4F6FA",
};

// Semantic intent palette — Primary/Success/Warning/Danger/Info. JS-side mirror
// of the `primary|success|warning|danger|info` Tailwind colors (see
// tailwind.config.js). Use for recharts / inline styles so status colors stay
// consistent with the class-side tokens. Each: { DEFAULT, 50, 100, 600, 700 }.
export const SEMANTIC = {
    primary: { DEFAULT: "#003087", 50: "#EEF3FB", 100: "#DCE6F7", 600: "#0A3FA0", 700: "#002266" },
    success: { DEFAULT: "#00843D", 50: "#EBF7F1", 100: "#D2EEDF", 600: "#0A9B4E", 700: "#006B32" },
    warning: { DEFAULT: "#B45309", 50: "#FFFBEB", 100: "#FEF3C7", 600: "#D97706", 700: "#92400E" },
    danger: { DEFAULT: "#DC2626", 50: "#FEF2F2", 100: "#FEE2E2", 600: "#DC2626", 700: "#B91C1C" },
    info: { DEFAULT: "#0369A1", 50: "#EFF6FF", 100: "#DBEAFE", 600: "#0284C7", 700: "#0369A1" },
};

export const ROLE_COLOR = {
    EMPLOYEE: "blue",
    HOD: "purple",
    BRANCH_MANAGER: "green",
    CLUSTER_MANAGER: "orange",
    HR: "sky",
    COMMITTEE: "amber",
    ADMIN: "red",
};

export const ROLE_LABEL = {
    EMPLOYEE: "Employee",
    HOD: "HOD",
    BRANCH_MANAGER: "Branch Manager",
    CLUSTER_MANAGER: "Cluster Manager",
    HR: "HR",
    COMMITTEE: "Committee",
    ADMIN: "Admin",
};

export const CAT_COLOR = {
    ATTENDANCE: "blue",
    DISCIPLINE: "purple",
    PRODUCTIVITY: "green",
    TEAMWORK: "orange",
    INITIATIVE: "sky",
    COMMUNICATION: "amber",
    INTEGRITY: "gray",
};

export const SCORE_LABELS = ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"];
export const SCORE_COLORS = ["#DC2626", "#F97316", "#6B7280", "#0369A1", AP.green];

export const BADGE_PALETTE = {
    blue: { bg: "#EEF3FB", text: AP.blue, bd: "#C7D9F5" },
    green: { bg: "#EBF7F1", text: AP.green, bd: "#A3D9BC" },
    orange: { bg: "#FEF4E8", text: "#C2410C", bd: "#FAD4A0" }, // darker than brand orange for WCAG AA on light bg
    red: { bg: "#FEE8E8", text: "#DC2626", bd: "#FCBBBB" },
    purple: { bg: "#F3EFFE", text: "#7C3AED", bd: "#C4B5FD" },
    sky: { bg: "#EBF6FD", text: "#0369A1", bd: "#BAE0F5" },
    amber: { bg: "#FFFBEB", text: "#B45309", bd: "#FDE68A" },
    gray: { bg: "#F3F4F6", text: "#374151", bd: "#D1D5DB" },
};
