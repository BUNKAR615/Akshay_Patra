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

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.replace("/login");
    };

    return (
        <div className="min-h-screen bg-[#F5F5F5]">
            {/* Top Nav — Brand Blue */}
            <nav className="bg-[#003087] shadow-md sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[64px] py-2 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                        <Image src="/logo.png" alt="Akshaya Patra" width={120} height={36} className="h-9 w-auto brightness-0 invert" priority />
                        <span className="text-white text-[14px] font-medium hidden md:inline ml-2 border-l border-white/30 pl-3">
                            {currentQuarter ? `Active: ${currentQuarter}` : "Best Employee of the Quarter"}
                        </span>
                    </div>

                    {/* Mobile-only quarter display */}
                    {currentQuarter && (
                        <div className="w-full order-last md:hidden flex justify-center text-white text-[14px] font-medium border-t border-white/20 pt-2 pb-1">
                            Current Quarter: {currentQuarter}
                        </div>
                    )}

                    <div className="flex items-center gap-3 ml-auto">
                        {user && (
                            <div className="flex items-center gap-3 mr-2">
                                <div className="hidden sm:flex flex-col items-end">
                                    <span className="text-[14px] font-bold text-white leading-tight">{user.name}</span>
                                    {user.department && (
                                        <span className="text-[12px] text-white/90 leading-tight">
                                            {user.department.name}{user.designation ? ` · ${user.designation}` : ""}
                                        </span>
                                    )}
                                </div>
                                <span className={`text-[12px] px-3 py-1.5 rounded-full border font-bold shadow-sm ${ROLE_COLORS[user.role] || "bg-gray-100 text-[#333333]"}`}>
                                    {ROLE_LABELS[user.role] || user.role}
                                </span>
                            </div>
                        )}
                        {user?.role === 'ADMIN' && (
                            <a href="/dashboard/admin/employees" className="text-[14px] font-bold text-white min-h-[44px] px-4 py-2 rounded-lg hover:bg-white/20 transition-colors cursor-pointer border border-transparent hover:border-white/30 flex items-center justify-center gap-2 mr-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                All Employees
                            </a>
                        )}
                        <NotificationBell />
                        <button
                            onClick={handleLogout}
                            className="text-[14px] font-bold text-white min-h-[44px] min-w-[80px] px-4 py-2 rounded-lg hover:bg-white/20 transition-colors cursor-pointer border border-transparent hover:border-white/30 flex items-center justify-center"
                        >
                            Logout
                        </button>
                    </div>
                </div>
            </nav>

            {/* Page Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
                {title && (
                    <h1 className="text-[24px] md:text-[28px] font-bold text-[#003087] mb-6 md:mb-8 tracking-tight">{title}</h1>
                )}
                <div className="max-w-full overflow-x-hidden">
                    {children}
                </div>
            </main>
        </div>
    );
}
