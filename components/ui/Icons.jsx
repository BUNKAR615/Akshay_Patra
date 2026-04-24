// Icon set ported from the design prototype. All inline SVG, stroke="currentColor".

export const ChevR = () => (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export const Xicon = () => (
    <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
        <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
);

export const CheckIcon = () => (
    <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
        <polyline points="20 6 9 17 4 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const Ic = {
    dashboard: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
            <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
            <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
            <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    ),
    employees: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" />
            <path d="M2 21c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M17 11c2.21 0 4 1.79 4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="17" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    ),
    branches: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <path d="M3 21h18M5 21V9l7-6 7 6v12" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <rect x="9" y="14" width="6" height="7" rx="1" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    ),
    departments: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <rect x="3" y="10" width="18" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="15.5" r="1.5" fill="currentColor" />
        </svg>
    ),
    pipeline: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <circle cx="5" cy="12" r="2" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="19" cy="12" r="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M7 12h3M14 12h3" stroke="currentColor" strokeWidth="1.8" />
        </svg>
    ),
    quarter: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="17" rx="2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    ),
    questions: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="17" r="1" fill="currentColor" />
        </svg>
    ),
    hod: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    ),
    star: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
    ),
    audit: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeWidth="1.8" />
            <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    ),
    bell: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    ),
    plus: (
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    ),
    search: (
        <svg width="14" height="14" fill="none" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8" />
            <path d="m21 21-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    ),
    download: (
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    edit: (
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    ),
    upload: (
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    logout: (
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    ),
    trophy: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <path d="M6 9H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 17a5 5 0 0 0 5-5V3H7v9a5 5 0 0 0 5 5z" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 17v4M8 21h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    ),
    file: (
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.8" />
            <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    ),
    assessment: (
        <svg width="17" height="17" fill="none" viewBox="0 0 24 24">
            <path d="M9 11l3 3L22 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    ),
    menu: (
        <svg width="18" height="18" fill="none" viewBox="0 0 24 24">
            <path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
    ),
};
