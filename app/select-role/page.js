"use client";

import { useState, useEffect } from "react";
import Image from "next/image";

const ROLE_REDIRECTS = {
    EMPLOYEE: "/dashboard/employee",
    SUPERVISOR: "/dashboard/supervisor",
    BRANCH_MANAGER: "/dashboard/branch-manager",
    CLUSTER_MANAGER: "/dashboard/cluster-manager",
    ADMIN: "/dashboard/admin",
};

const ROLE_LABELS = {
    EMPLOYEE: "Employee",
    SUPERVISOR: "Supervisor",
    BRANCH_MANAGER: "Branch Manager",
    CLUSTER_MANAGER: "Cluster Manager",
    ADMIN: "Admin",
};

const ROLE_ICONS = {
    EMPLOYEE: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
    ),
    SUPERVISOR: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
    ),
    BRANCH_MANAGER: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
        </svg>
    ),
    CLUSTER_MANAGER: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
        </svg>
    ),
    ADMIN: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    ),
};

const ROLE_COLORS = {
    EMPLOYEE: { bg: "bg-blue-50", border: "border-blue-200", hover: "hover:border-[#003087] hover:bg-blue-100", icon: "text-[#003087]" },
    SUPERVISOR: { bg: "bg-emerald-50", border: "border-emerald-200", hover: "hover:border-[#00843D] hover:bg-emerald-100", icon: "text-[#00843D]" },
    BRANCH_MANAGER: { bg: "bg-amber-50", border: "border-amber-200", hover: "hover:border-[#F7941D] hover:bg-amber-100", icon: "text-[#F7941D]" },
    CLUSTER_MANAGER: { bg: "bg-purple-50", border: "border-purple-200", hover: "hover:border-purple-600 hover:bg-purple-100", icon: "text-purple-600" },
    ADMIN: { bg: "bg-rose-50", border: "border-rose-200", hover: "hover:border-rose-600 hover:bg-rose-100", icon: "text-rose-600" },
};

export default function SelectRolePage() {
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedRole, setSelectedRole] = useState(null);
    const [error, setError] = useState("");
    const [userName, setUserName] = useState("");

    useEffect(() => {
        const loadRoles = async () => {
            try {
                // First try sessionStorage (from login flow)
                const stored = sessionStorage.getItem("availableRoles");
                const name = sessionStorage.getItem("userName");
                if (stored) {
                    setRoles(JSON.parse(stored));
                    if (name) setUserName(name);
                    return;
                }

                // No sessionStorage — try API (switch-role flow, user already authenticated)
                const res = await fetch("/api/auth/available-roles");
                const json = await res.json();
                if (res.ok && json.success && json.data?.roles?.length > 1) {
                    setRoles(json.data.roles);
                    if (json.data.userName) setUserName(json.data.userName);
                    return;
                }

                // Single role or no roles — redirect back to login
                window.location.href = "/login";
            } catch {
                window.location.href = "/login";
            }
        };
        loadRoles();
    }, []);

    const handleSelectRole = async (role) => {
        setSelectedRole(role);
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/auth/select-role", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ role }),
            });

            const json = await res.json();

            if (!res.ok || !json.success) {
                setError(json.message || "Failed to select role");
                setLoading(false);
                setSelectedRole(null);
                return;
            }

            // Clear sessionStorage (may not exist in switch-role flow)
            try {
                sessionStorage.removeItem("availableRoles");
                sessionStorage.removeItem("userName");
            } catch { }

            // Redirect to role dashboard
            const redirectPath = ROLE_REDIRECTS[role] || "/dashboard/employee";
            window.location.href = redirectPath;
        } catch {
            setError("Network error. Please try again.");
            setLoading(false);
            setSelectedRole(null);
        }
    };

    if (roles.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="flex items-center gap-2 text-[#333333]">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#f8f9fc] to-[#e8edf5] px-4 py-12">
            <div className="w-full max-w-lg">
                {/* Logo */}
                <div className="text-center mb-8">
                    <Image src="/logo.png" alt="Akshaya Patra" width={160} height={50} className="h-12 w-auto mx-auto mb-4" />
                    <div className="w-12 h-0.5 bg-[#F7941D] mx-auto rounded-full" />
                </div>

                {/* Card */}
                <div className="bg-white rounded-2xl shadow-lg border border-[#E0E0E0] p-8">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-bold text-[#003087]">
                            {userName ? `Welcome, ${userName}` : "Select Your Role"}
                        </h1>
                        <p className="text-sm text-[#666666] mt-2">
                            You have multiple roles. Please choose how you would like to continue.
                        </p>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-4 p-3 bg-[#FFEBEE] border-l-4 border-[#D32F2F] rounded-r-lg text-[#D32F2F] text-sm font-bold flex items-start gap-2">
                            <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Role Cards */}
                    <div className="space-y-3">
                        {roles.map((role) => {
                            const colors = ROLE_COLORS[role] || ROLE_COLORS.EMPLOYEE;
                            const isSelected = selectedRole === role;
                            return (
                                <button
                                    key={role}
                                    onClick={() => handleSelectRole(role)}
                                    disabled={loading}
                                    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer
                                        ${colors.bg} ${colors.border} ${colors.hover}
                                        ${isSelected ? "ring-2 ring-offset-1 ring-[#003087] scale-[0.98]" : ""}
                                        ${loading && !isSelected ? "opacity-50 cursor-not-allowed" : ""}
                                    `}
                                >
                                    <div className={`${colors.icon} shrink-0`}>
                                        {ROLE_ICONS[role] || ROLE_ICONS.EMPLOYEE}
                                    </div>
                                    <div className="text-left flex-1">
                                        <p className="font-semibold text-[#1A1A2E]">
                                            Continue as {ROLE_LABELS[role] || role}
                                        </p>
                                        <p className="text-xs text-[#666666] mt-0.5">
                                            Access the {ROLE_LABELS[role]?.toLowerCase() || role.toLowerCase()} dashboard
                                        </p>
                                    </div>
                                    {isSelected && loading ? (
                                        <svg className="animate-spin h-5 w-5 text-[#003087] shrink-0" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-5 h-5 text-[#999999] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                        </svg>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {/* Back to login */}
                    <div className="mt-6 text-center">
                        <a
                            href="/login"
                            className="text-sm text-[#003087] hover:text-[#00843D] hover:underline transition-colors"
                            onClick={() => {
                                sessionStorage.removeItem("availableRoles");
                                sessionStorage.removeItem("userName");
                            }}
                        >
                            ← Back to Login
                        </a>
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-6">
                    <p className="text-[#333333] text-xs">
                        Akshaya Patra Foundation — Jaipur Branch © 2025
                    </p>
                </div>
            </div>
        </div>
    );
}
