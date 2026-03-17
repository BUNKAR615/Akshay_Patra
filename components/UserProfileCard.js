"use client";

const ROLE_LABELS = {
    EMPLOYEE: "Employee",
    SUPERVISOR: "Supervisor",
    BRANCH_MANAGER: "Branch Manager",
    CLUSTER_MANAGER: "Cluster Manager",
    ADMIN: "Admin",
};

const ROLE_COLORS = {
    EMPLOYEE: "bg-blue-50 text-[#003087] border-blue-200",
    SUPERVISOR: "bg-purple-50 text-purple-700 border-purple-200",
    BRANCH_MANAGER: "bg-emerald-50 text-emerald-700 border-emerald-200",
    CLUSTER_MANAGER: "bg-orange-50 text-[#F57C00] border-orange-200",
    ADMIN: "bg-red-50 text-red-700 border-red-200",
};

export default function UserProfileCard({ user, extraInfo }) {
    if (!user) return null;

    const branch = user.department?.branch?.name || "Jaipur";
    const dept = user.department?.name || "—";

    return (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6 shadow-sm">
            <div className="flex items-start gap-5">
                {/* Avatar */}
                <div className="h-14 w-14 rounded-full bg-[#E3F2FD] flex items-center justify-center text-[#003087] font-bold text-[22px] shrink-0 border-2 border-[#90CAF9]">
                    {user.name?.charAt(0)?.toUpperCase()}
                </div>

                {/* Info Grid */}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                        <h3 className="text-[18px] font-black text-[#003087] leading-tight">{user.name}</h3>
                        <span className={`text-[11px] px-3 py-1 rounded-full border font-bold uppercase tracking-wider w-fit ${ROLE_COLORS[user.role] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                            {ROLE_LABELS[user.role] || user.role}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-2">
                        {user.empCode && (
                            <div>
                                <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Emp Code</p>
                                <p className="text-[14px] font-bold text-[#333333]">{user.empCode}</p>
                            </div>
                        )}
                        <div>
                            <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Department</p>
                            <p className="text-[14px] font-bold text-[#333333]">{dept}</p>
                        </div>
                        {user.designation && (
                            <div>
                                <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Designation</p>
                                <p className="text-[14px] font-bold text-[#333333]">{user.designation}</p>
                            </div>
                        )}
                        <div>
                            <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Branch</p>
                            <p className="text-[14px] font-bold text-[#333333]">{branch}</p>
                        </div>
                        {extraInfo && (
                            <div>
                                <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">{extraInfo.label}</p>
                                <p className={`text-[14px] font-bold ${extraInfo.color || "text-[#333333]"}`}>{extraInfo.value}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
