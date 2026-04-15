"use client";

const ROLE_LABELS = {
    EMPLOYEE: "Employee",
    HOD: "HOD",
    BRANCH_MANAGER: "Branch Manager",
    CLUSTER_MANAGER: "Cluster Manager",
    HR: "HR",
    COMMITTEE: "Committee",
    ADMIN: "Admin",
};

const ROLE_COLORS = {
    ADMIN: "bg-purple-100 text-purple-700 border-purple-300",
    CLUSTER_MANAGER: "bg-red-100 text-red-700 border-red-300",
    BRANCH_MANAGER: "bg-orange-100 text-orange-700 border-orange-300",
    HOD: "bg-purple-100 text-purple-700 border-purple-300",
    HR: "bg-sky-100 text-sky-700 border-sky-300",
    COMMITTEE: "bg-amber-100 text-amber-700 border-amber-300",
    EMPLOYEE: "bg-green-100 text-green-700 border-green-300",
};

export default function UserProfileCard({ user, extraInfo, roles }) {
    if (!user) return null;

    const branch = user.department?.branch?.name || user.branch || "Jaipur";
    const dept = user.department?.name || user.departmentName || (user.departmentRoles?.length > 0 ? user.departmentRoles[0].department?.name : null) || "—";
    const firstName = user.name?.split(" ")[0];
    const greeting = firstName
        ? `${firstName.charAt(0).toUpperCase()}${firstName.slice(1).toLowerCase()}`
        : "User";

    // Collect all roles: merge explicit roles prop, user.roles array, and user.role
    const allRoles = new Set();
    if (roles && Array.isArray(roles)) roles.forEach((r) => allRoles.add(r));
    if (user.roles && Array.isArray(user.roles)) user.roles.forEach((r) => allRoles.add(r));
    if (user.role) allRoles.add(user.role);
    // Remove EMPLOYEE if there are higher roles
    if (allRoles.size > 1) allRoles.delete("EMPLOYEE");
    const roleList = Array.from(allRoles);

    return (
        <div className="bg-white border border-[#E0E0E0] rounded-xl p-5 mb-6 shadow-sm">
            {/* Greeting */}
            <p className="text-[13px] text-[#999999] mb-3 font-medium">
                Welcome, <span className="text-[#003087] font-bold text-[15px]">{greeting}</span>
            </p>

            <div className="flex items-start gap-5">
                {/* Avatar */}
                <div className="h-14 w-14 rounded-full bg-[#E3F2FD] flex items-center justify-center text-[#003087] font-bold text-[22px] shrink-0 border-2 border-[#90CAF9]">
                    {user.name?.charAt(0)?.toUpperCase()}
                </div>

                {/* Info Grid */}
                <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                        <h3 className="text-[18px] font-black text-[#003087] leading-tight">{user.name}</h3>
                        <div className="flex flex-wrap gap-1.5">
                            {roleList.map((r) => (
                                <span
                                    key={r}
                                    className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${ROLE_COLORS[r] || "bg-gray-100 text-gray-700 border-gray-200"}`}
                                >
                                    {ROLE_LABELS[r] || r}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-2">
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
                        {(user.designation) && (
                            <div>
                                <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Designation</p>
                                <p className="text-[14px] font-bold text-[#333333]">{user.designation}</p>
                            </div>
                        )}
                        <div>
                            <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Branch</p>
                            <p className="text-[14px] font-bold text-[#333333]">{branch}</p>
                        </div>
                        {(user.mobile) && (
                            <div>
                                <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">Mobile</p>
                                <p className="text-[14px] font-bold text-[#333333]">{user.mobile}</p>
                            </div>
                        )}
                        {extraInfo && (Array.isArray(extraInfo) ? extraInfo : [extraInfo]).map((info, idx) => (
                            <div key={idx}>
                                <p className="text-[11px] text-[#999999] font-bold uppercase tracking-wider">{info.label}</p>
                                <p className={`text-[14px] font-bold ${info.color || "text-[#333333]"}`}>{info.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
