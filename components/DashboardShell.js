"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import NotificationBell from "./NotificationBell";

const ROLE_LABELS = {
    EMPLOYEE: "Employee",
    SUPERVISOR: "Supervisor",
    BRANCH_MANAGER: "Branch Manager",
    CLUSTER_MANAGER: "Cluster Manager",
    ADMIN: "Admin",
};

const ROLE_COLORS = {
    EMPLOYEE: "bg-blue-100 text-[#003087] border-blue-200",
    SUPERVISOR: "bg-purple-100 text-purple-700 border-purple-200",
    BRANCH_MANAGER: "bg-emerald-100 text-emerald-700 border-emerald-200",
    CLUSTER_MANAGER: "bg-orange-100 text-orange-700 border-orange-200",
    ADMIN: "bg-red-100 text-red-700 border-red-200",
};

export default function DashboardShell({ user, currentQuarter, title, children }) {
    const router = useRouter();

    // Detect if user has multiple roles (primary role + any different DRM roles)
    const allRoles = user ? [...new Set([user.role, ...(user.departmentRoles || []).map(dr => dr.role)])] : [];
    const isMultiRole = allRoles.length > 1;

    const handleSwitchRole = () => {
        window.location.href = "/select-role";
    };

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.replace("/login");
    };

    return (
        <div className="min-h-screen bg-[#F5F5F5]">
            {/* Top Nav — Brand Blue */}
            <nav className="bg-[#003087] shadow-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 min-h-[56px] sm:min-h-[64px] py-2 flex items-center justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <Image src="/logo.png" alt="Akshaya Patra" width={120} height={36} className="h-7 sm:h-9 w-auto brightness-0 invert" priority />
                        <span className="text-white text-[13px] font-medium hidden lg:inline ml-2 border-l border-white/30 pl-3">
                            {currentQuarter ? `Active: ${currentQuarter}` : "Best Employee of the Quarter"}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-3 ml-auto">
                        {user && (
                            <div className="flex items-center gap-2 sm:gap-3 mr-1 sm:mr-2">
                                <div className="hidden md:flex flex-col items-end">
                                    <span className="text-[14px] font-bold text-white leading-tight">{user.name}</span>
                                    {user.department && (
                                        <span className="text-[12px] text-white/90 leading-tight">
                                            {user.department.name}{user.designation ? ` · ${user.designation}` : ""}
                                        </span>
                                    )}
                                </div>
                                <span className={`text-[10px] sm:text-[12px] px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border font-bold shadow-sm ${ROLE_COLORS[user.role] || "bg-gray-100 text-[#333333]"}`}>
                                    {ROLE_LABELS[user.role] || user.role}
                                </span>
                            </div>
                        )}
                        <NotificationBell />
                        {isMultiRole && (
                            <button
                                onClick={handleSwitchRole}
                                className="text-[11px] sm:text-[13px] font-bold text-white min-h-[36px] sm:min-h-[44px] px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg hover:bg-white/20 transition-colors cursor-pointer border border-white/30 hover:border-white/50 flex items-center justify-center gap-1.5"
                                title="Switch to another role"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                <span className="hidden sm:inline">Switch Role</span>
                            </button>
                        )}
                        <button
                            onClick={handleLogout}
                            className="text-[12px] sm:text-[14px] font-bold text-white min-h-[36px] sm:min-h-[44px] px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-white/20 transition-colors cursor-pointer border border-transparent hover:border-white/30 flex items-center justify-center"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            {/* Page Content */}
            <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 md:py-10">
                {title && (
                    <h1 className="text-[22px] md:text-[28px] font-bold text-[#003087] mb-5 md:mb-8 tracking-tight">{title}</h1>
                )}
                <div className="max-w-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
