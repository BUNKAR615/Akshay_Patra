"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function UnauthorizedPage() {
    const router = useRouter();
    const [userRole, setUserRole] = useState(null);

    useEffect(() => {
        // Try to get the role from local storage or an API call if needed
        // For now, we'll try to extract it from the token payload (if accessible) or just show a generic message
        const role = localStorage.getItem("userRole"); // Assuming we save this on login, or we can just fetch /api/auth/me
        if (role) setUserRole(role);
        else {
            fetch("/api/auth/me")
                .then(res => res.json())
                .then(data => {
                    if (data.success && data.user) {
                        setUserRole(data.user.role);
                        localStorage.setItem("userRole", data.user.role);
                    }
                })
                .catch(() => { });
        }
    }, []);

    const handleGoHome = () => {
        if (!userRole) {
            router.push("/login");
            return;
        }

        switch (userRole) {
            case "ADMIN":
            case "HR_ADMIN":
                router.push("/dashboard/admin");
                break;
            case "CLUSTER_MANAGER":
                router.push("/dashboard/cluster-manager");
                break;
            case "BRANCH_MANAGER":
                router.push("/dashboard/branch-manager");
                break;
            case "SUPERVISOR":
                router.push("/dashboard/supervisor");
                break;
            default:
                router.push("/dashboard/employee");
        }
    };

    return (
        <div className="min-h-screen bg-[#F5F5F5] flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-white border border-[#E0E0E0] rounded-2xl p-8 text-center shadow-xl">
                <div className="w-20 h-20 bg-[#D32F2F]/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#D32F2F]/20">
                    <svg className="w-10 h-10 text-[#D32F2F]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h1 className="text-3xl font-bold text-[#003087] mb-2">Access Denied</h1>
                <p className="text-[#333333] mb-8">
                    You do not have permission to view this page. Please ensure you are logged in with the correct role.
                </p>
                <div className="flex flex-col gap-3">
                    <button
                        onClick={handleGoHome}
                        className="w-full py-3 bg-[#003087] hover:bg-[#00843D] text-white font-semibold rounded-xl transition-all shadow-lg cursor-pointer"
                    >
                        Go to My Dashboard
                    </button>
                    <button
                        onClick={() => router.push("/login")}
                        className="w-full py-3 bg-white border border-[#CCCCCC] hover:bg-[#F5F7FA] text-[#333333] font-semibold rounded-xl transition-all cursor-pointer"
                    >
                        Sign In with Different Account
                    </button>
                </div>
            </div>
        </div>
    );
}
