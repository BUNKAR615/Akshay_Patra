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

export default function LoginPage() {
    const [empCode, setEmpCode] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Read error from URL params (e.g. session expired redirect)
        const urlParams = new URLSearchParams(window.location.search);
        const urlError = urlParams.get("error");
        if (urlError) setError(urlError);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ empCode, password }),
            });

            const json = await res.json();

            if (!res.ok || !json.success) {
                setError(json.message || "Login failed");
                setLoading(false);
                return;
            }

            // Multi-role: redirect to role selection
            if (json.data.requiresRoleSelection) {
                sessionStorage.setItem("availableRoles", JSON.stringify(json.data.availableRoles));
                sessionStorage.setItem("userName", json.data.user.name || "");
                window.location.href = "/select-role";
                return;
            }

            // Single role: redirect to dashboard
            const redirectPath = ROLE_REDIRECTS[json.data.user.role] || "/dashboard/employee";
            window.location.href = redirectPath;
        } catch (err) {
            setError("Network error. Please try again.");
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col lg:flex-row">
            {/* ═══════ LEFT HALF — Hero Image Panel ═══════ */}
            <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
                {/* Background image */}
                <Image
                    src="/hero.png"
                    alt="Akshaya Patra Employees"
                    fill
                    priority
                    sizes="(max-width: 1024px) 0vw, 50vw"
                    className="object-cover"
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#003087]/90 via-[#003087]/40 to-[#00843D]/30" />

                {/* Bottom text overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-10">
                    <div className="max-w-lg">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-10 h-1 bg-[#F7941D] rounded-full" />
                            <span className="text-[#F7941D] text-sm font-semibold tracking-wider uppercase">Recognition Program</span>
                        </div>
                        <h2 className="text-4xl font-bold text-white leading-tight mb-3">
                            Best Employee<br />of the Quarter
                        </h2>
                        <p className="text-white/80 text-lg font-medium mb-1">
                            Jaipur Branch — Evaluation Portal
                        </p>
                        <p className="text-white/50 text-sm italic">
                            &ldquo;Education, Not Hunger&rdquo;
                        </p>
                    </div>
                </div>

                {/* Decorative corner element */}
                <div className="absolute top-6 left-6">
                    <Image src="/logo.png" alt="Akshaya Patra" width={150} height={48} className="h-12 w-auto brightness-0 invert" />
                </div>
            </div>

            {/* ═══════ RIGHT HALF — Login Form ═══════ */}
            <div className="flex-1 flex items-center justify-center bg-white px-6 py-12 lg:px-12">
                <div className="w-full max-w-md">
                    {/* Logo */}
                    <div className="text-center mb-8">
                        <Image src="/logo.png" alt="Akshaya Patra" width={180} height={56} className="h-14 w-auto mx-auto mb-4" />
                        <div className="w-12 h-0.5 bg-[#F7941D] mx-auto mt-2 rounded-full" />
                    </div>

                    <div className="text-center mb-8">
                        <h2 className="text-[28px] font-bold text-[#003087]">Welcome Back</h2>
                        <p className="text-sm text-[#333333] mt-1">Sign in to your evaluation portal</p>
                    </div>

                    {/* Mobile hero banner (visible only on small screens) */}
                    <div className="lg:hidden mb-6 rounded-xl overflow-hidden relative h-40">
                        <Image src="/hero.png" alt="Akshaya Patra" fill sizes="100vw" priority className="object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#003087]/80 to-transparent" />
                        <div className="absolute bottom-3 left-4">
                            <p className="text-white font-semibold text-sm">Best Employee of the Quarter</p>
                            <p className="text-white/70 text-xs">Jaipur Branch</p>
                        </div>
                    </div>

                    {/* Login Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Employee Code */}
                        <div>
                            <label className="block text-sm font-medium text-[#333333] mb-1.5">Employee Code</label>
                            <div className="relative">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#333333]">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                    </svg>
                                </span>
                                <input
                                    id="empCode"
                                    type="text" value={empCode} onChange={(e) => { setEmpCode(e.target.value); if (error) setError(""); }}
                                    required placeholder="1800349"
                                    inputMode="numeric"
                                    autoComplete="username"
                                    className="w-full h-11 pl-10 pr-4 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] placeholder-[#999999] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087] text-sm"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-medium text-[#333333] mb-1.5">Password</label>
                            <div className="relative">
                                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#333333]">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                                    </svg>
                                </span>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); if (error) setError(""); }}
                                    required placeholder="••••••••"
                                    autoComplete="current-password"
                                    className="w-full h-11 pl-10 pr-12 bg-white border border-[#CCCCCC] rounded-lg text-[#1A1A2E] placeholder-[#999999] focus:outline-none focus:ring-2 focus:ring-[#003087]/20 focus:border-[#003087] text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#333333] hover:text-[#003087] cursor-pointer"
                                >
                                    {showPassword ? (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit" disabled={loading}
                            className="w-full h-12 bg-[#003087] hover:bg-[#00843D] text-white font-semibold rounded-lg disabled:bg-[#CCCCCC] disabled:text-[#666666] disabled:cursor-not-allowed cursor-pointer shadow-sm hover:shadow-md text-sm mt-2"
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                    </svg>
                                    Signing in...
                                </span>
                            ) : "Sign In"}
                        </button>

                        {/* Error message */}
                        {error && (
                            <div className="mt-4 p-3 bg-[#FFEBEE] border-l-4 border-[#D32F2F] rounded-r-lg text-[#D32F2F] text-[14px] font-bold shadow-sm flex items-start gap-2">
                                <svg className="w-5 h-5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <span>{error}</span>
                            </div>
                        )}
                    </form>

                    <div className="text-center mt-10 pt-6 border-t border-[#E0E0E0]">
                        <p className="text-[#333333] text-xs">
                            Akshaya Patra Foundation — Jaipur Branch © 2025
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
