"use client";

import { useState, useEffect, useRef } from "react";

/**
 * NotificationBell — dropdown bell icon for the navbar.
 * Shows unread count badge, notification list, and mark-as-read actions.
 */
export default function NotificationBell() {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const fetchNotifications = async () => {
        try {
            const res = await fetch("/api/notifications");
            const json = await res.json();
            if (json.success) {
                setNotifications(json.data.notifications);
                setUnreadCount(json.data.unreadCount);
            }
        } catch { }
    };

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const markAsRead = async (id) => {
        try {
            await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
            setNotifications((prev) =>
                prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
            );
            setUnreadCount((c) => Math.max(0, c - 1));
        } catch { }
    };

    const markAllRead = async () => {
        try {
            await fetch("/api/notifications/read-all", { method: "PATCH" });
            setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch { }
    };

    const timeAgo = (dateStr) => {
        const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (seconds < 60) return "just now";
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        return `${Math.floor(seconds / 86400)}d ago`;
    };

    return (
        <div className="relative" ref={ref}>
            {/* Bell Button */}
            <button
                onClick={() => setOpen(!open)}
                className="relative p-2 text-gray-600 hover:text-[#003087] transition-colors rounded-lg hover:bg-gray-100 cursor-pointer"
                aria-label="Notifications"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-[#D32F2F] text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div className="fixed inset-x-0 top-14 mx-2 sm:absolute sm:inset-auto sm:right-0 sm:top-12 sm:mx-0 sm:w-80 max-h-[70vh] sm:max-h-96 bg-white border border-[#E0E0E0] rounded-xl shadow-2xl overflow-hidden z-50">
                    {/* Header */}
                    <div className="px-4 py-3 border-b border-[#E0E0E0] flex items-center justify-between">
                        <h3 className="text-sm font-bold text-[#003087]">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={markAllRead}
                                className="text-xs text-[#003087] hover:underline cursor-pointer"
                            >
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div className="overflow-y-auto max-h-[calc(70vh-3rem)] sm:max-h-72 divide-y divide-[#E0E0E0]">
                        {notifications.length === 0 ? (
                            <div className="px-4 py-8 text-center text-[#333333] text-sm">No notifications</div>
                        ) : (
                            notifications.map((n) => (
                                <button
                                    key={n.id}
                                    onClick={() => !n.isRead && markAsRead(n.id)}
                                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${n.isRead ? "opacity-70 hover:bg-[#F5F7FA]" : "bg-[#F5F7FA] hover:bg-[#E3F2FD]"}`}
                                >
                                    <div className="flex items-start gap-2">
                                        {!n.isRead && (
                                            <span className="w-2 h-2 mt-1.5 rounded-full bg-[#00843D] shrink-0" />
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <p className={`text-sm leading-snug ${n.isRead ? "text-[#333333]" : "text-[#1A1A2E]"}`}>
                                                {n.message}
                                            </p>
                                            <p className="text-[10px] text-[#666666] mt-1">{timeAgo(n.createdAt)}</p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
