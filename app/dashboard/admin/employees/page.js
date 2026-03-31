"use client";

import { useState, useEffect, useCallback } from "react";
import DashboardShell from "../../../../components/DashboardShell";

// Roles colors
const ROLE_BADGE = {
  ADMIN: { bg: "bg-[#003087]", text: "text-white", label: "Admin" },
  CLUSTER_MANAGER: { bg: "bg-[#F7941D]", text: "text-white", label: "Cluster Manager" },
  BRANCH_MANAGER: { bg: "bg-[#00843D]", text: "text-white", label: "Branch Manager" },
  SUPERVISOR: { bg: "bg-[#1D4ED8]", text: "text-white", label: "Supervisor" },
  EMPLOYEE: { bg: "bg-[#E5E7EB]", text: "text-[#374151]", label: "Employee" },
};

export default function EmployeesPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [user, setUser] = useState(null);
  const [currentQuarter, setCurrentQuarter] = useState("");

  // Debouncing search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [search]);

  // Auth check
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((d) => {
        if (d.success) {
          setUser(d.data?.user || d.user);
          setCurrentQuarter(d.data?.currentQuarter || "");
        }
      })
      .catch(() => {});
  }, []);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        search: debouncedSearch,
        department,
        role,
      });
      const res = await fetch(`/api/admin/employees?${params.toString()}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, department, role]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  // Derived stats
  const totalEmployees = data?.roleStats ? Object.values(data.roleStats).reduce((a, b) => a + b, 0) : 0;
  const supervisorsCount = data?.roleStats?.SUPERVISOR || 0;
  const departmentsCount = data?.departmentStats?.length || 0;
  const regularEmployeesCount = data?.roleStats?.EMPLOYEE || 0;

  return (
    <DashboardShell user={user} currentQuarter={currentQuarter} title="Employee Directory">
      <div className="space-y-6">
        
        {/* PAGE HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[#E2E8F0] pb-4">
          <div>
            <h1 className="text-2xl font-bold text-[#003087]">All Employees — Jaipur Branch</h1>
            <p className="text-[#64748B] text-sm mt-1">{totalEmployees} Employees</p>
          </div>
          <a href="/dashboard/admin" className="px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm font-bold text-[#003087] hover:bg-[#EFF6FF] transition-colors shadow-sm flex items-center gap-2">
            ← Back to Admin Dashboard
          </a>
        </div>

        {/* STATS CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#003087] text-white rounded-xl p-5 shadow-sm">
            <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">Total Employees</p>
            <p className="text-3xl font-black">{totalEmployees}</p>
          </div>
          <div className="bg-[#00843D] text-white rounded-xl p-5 shadow-sm">
            <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">Supervisors</p>
            <p className="text-3xl font-black">{supervisorsCount}</p>
          </div>
          <div className="bg-[#F7941D] text-white rounded-xl p-5 shadow-sm">
            <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">Departments</p>
            <p className="text-3xl font-black">{departmentsCount}</p>
          </div>
          <div className="bg-[#64748B] text-white rounded-xl p-5 shadow-sm">
            <p className="text-white/80 text-xs font-bold uppercase tracking-wider mb-1">Employees</p>
            <p className="text-3xl font-black">{regularEmployeesCount}</p>
          </div>
        </div>

        {/* SEARCH AND FILTER BAR */}
        <div className="bg-white border border-[#E2E8F0] shadow-sm rounded-xl p-4 flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            <input 
              type="text" 
              placeholder="Search by name or employee code..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#003087] focus:border-transparent transition-all"
            />
          </div>
          <div className="flex gap-4 md:w-auto w-full">
            <select 
              value={department} 
              onChange={(e) => { setDepartment(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#003087] flex-1 min-w-[160px]"
            >
              <option value="">All Departments</option>
              {data?.departments?.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <select 
              value={role} 
              onChange={(e) => { setRole(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#003087] flex-1 min-w-[140px]"
            >
              <option value="">All Roles</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="BRANCH_MANAGER">Branch Manager</option>
              <option value="CLUSTER_MANAGER">Cluster Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </div>

        {/* EMPLOYEE TABLE */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto min-h-[400px]">
            <table className="min-w-full text-left w-full border-collapse">
              <thead>
                <tr className="bg-[#003087] text-white text-[14px]">
                  <th className="px-6 py-4 font-bold tracking-wide">Emp Code</th>
                  <th className="px-6 py-4 font-bold tracking-wide">Name</th>
                  <th className="px-6 py-4 font-bold tracking-wide">Department</th>
                  <th className="px-6 py-4 font-bold tracking-wide">Designation</th>
                  <th className="px-6 py-4 font-bold tracking-wide">Role</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-[#F8FAFC]"}>
                      <td className="px-6 py-4 border-t border-[#E2E8F0]"><div className="h-4 bg-gray-200 rounded animate-pulse w-16"></div></td>
                      <td className="px-6 py-4 border-t border-[#E2E8F0]"><div className="h-4 bg-gray-200 rounded animate-pulse w-32"></div></td>
                      <td className="px-6 py-4 border-t border-[#E2E8F0]"><div className="h-4 bg-gray-200 rounded animate-pulse w-24"></div></td>
                      <td className="px-6 py-4 border-t border-[#E2E8F0]"><div className="h-4 bg-gray-200 rounded animate-pulse w-28"></div></td>
                      <td className="px-6 py-4 border-t border-[#E2E8F0]"><div className="h-6 bg-gray-200 rounded-full animate-pulse w-20"></div></td>
                    </tr>
                  ))
                ) : data?.employees?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-16 text-center text-[#64748B]">
                      <div className="w-16 h-16 bg-[#F1F5F9] rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg className="w-8 h-8 text-[#94A3B8]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                      </div>
                      <p className="text-lg font-bold text-[#0F172A] mb-1">No employees found matching your search</p>
                      <p className="text-sm">Try a different name, employee code, or adjust your filters.</p>
                    </td>
                  </tr>
                ) : (
                  data?.employees?.map((emp, i) => {
                    const r = ROLE_BADGE[emp.role] || ROLE_BADGE.EMPLOYEE;
                    return (
                      <tr key={emp.id} className={`${i % 2 === 0 ? "bg-white" : "bg-[#F8FAFC]"} hover:bg-[#EFF6FF] transition-colors border-t border-[#E2E8F0] text-[14px]`}>
                        <td className="px-6 py-3.5 font-bold text-[#003087] whitespace-nowrap">{emp.empCode}</td>
                        <td className="px-6 py-3.5 font-semibold text-[#0F172A] capitalize">{emp.name.toLowerCase()}</td>
                        <td className="px-6 py-3.5 text-[#334155]">{emp.department || "—"}</td>
                        <td className="px-6 py-3.5 text-[#64748B]">{emp.designation || "—"}</td>
                        <td className="px-6 py-3.5">
                          <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${r.bg} ${r.text}`}>
                            {r.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          
          {/* PAGINATION */}
          {!loading && data?.total > 0 && (
            <div className="px-6 py-4 border-t border-[#E2E8F0] bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-sm text-[#475569]">
                Showing <span className="font-bold text-[#0F172A]">{(page - 1) * 50 + 1}-{Math.min(page * 50, data.total)}</span> of <span className="font-bold text-[#0F172A]">{data.total}</span> employees
              </span>
              <div className="flex gap-1">
                <button 
                  disabled={page === 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 border border-[#E2E8F0] rounded-md text-sm font-medium text-[#0F172A] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#F8FAFC] transition-colors"
                >
                  Previous
                </button>
                {Array.from({ length: Math.min(7, data.totalPages) }).map((_, i) => {
                  let pNum = i + 1;
                  if (data.totalPages > 7) {
                    if (page > 4) pNum = page - 3 + i;
                    if (pNum > data.totalPages) pNum = data.totalPages - (6 - i);
                  }
                  return (
                    <button 
                      key={i}
                      onClick={() => setPage(pNum)}
                      className={`min-w-[32px] px-2 py-1.5 rounded-md text-sm font-bold transition-colors ${page === pNum ? "bg-[#003087] text-white border border-[#003087]" : "border border-[#E2E8F0] text-[#0F172A] hover:bg-[#F8FAFC]"}`}
                    >
                      {pNum}
                    </button>
                  );
                })}
                <button 
                  disabled={page === data.totalPages}
                  onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                  className="px-3 py-1.5 border border-[#E2E8F0] rounded-md text-sm font-medium text-[#0F172A] disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#F8FAFC] transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* DEPARTMENT SUMMARY SECTION */}
        {data?.departmentStats?.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-[#0F172A] mb-4">Department Summary</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {data.departmentStats.map((d) => (
                <div key={d.name} className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                  <p className="font-bold text-[#003087] mb-1">{d.name}</p>
                  <p className="text-2xl font-black text-[#F7941D] mb-3">{d.count} <span className="text-sm font-semibold text-[#64748B] uppercase">employees</span></p>
                  <div className="w-full h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-[#00843D] rounded-full" 
                      style={{ width: `${Math.max(1, (d.count / (totalEmployees || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </DashboardShell>
  );
}
