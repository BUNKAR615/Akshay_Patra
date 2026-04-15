"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
    { href: "", label: "Summary", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
    { href: "/employees", label: "Employees", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" },
    { href: "/departments", label: "Departments", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" },
    { href: "/org", label: "Org Structure", icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" },
    { href: "/hr-committee", label: "HR & Committee", icon: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" },
    { href: "/questions", label: "Questions", icon: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    { href: "/audit", label: "Audit Logs", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
];

export default function BranchSideNav({ branchId, branchName, branchType }) {
    const pathname = usePathname();
    const basePath = `/dashboard/admin/${branchId}`;

    return (
        <nav className="w-full lg:w-56 shrink-0">
            {/* Branch header */}
            <div className="mb-4">
                <Link href="/dashboard/admin/branches" className="text-[12px] text-[#003087] font-bold hover:underline flex items-center gap-1 mb-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    All Branches
                </Link>
                <h2 className="text-[18px] font-black text-[#003087] leading-tight">{branchName}</h2>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold ${branchType === "BIG" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                    {branchType}
                </span>
            </div>

            {/* Nav links */}
            <div className="flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
                {NAV_ITEMS.map((item) => {
                    const fullHref = basePath + item.href;
                    const isActive = item.href === ""
                        ? pathname === basePath || pathname === basePath + "/"
                        : pathname.startsWith(fullHref);

                    return (
                        <Link
                            key={item.href}
                            href={fullHref}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-bold whitespace-nowrap transition-colors ${
                                isActive
                                    ? "bg-[#003087] text-white shadow-sm"
                                    : "text-[#333333] hover:bg-[#E3F2FD] hover:text-[#003087]"
                            }`}
                        >
                            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                            </svg>
                            {item.label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
