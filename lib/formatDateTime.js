// Shared date/time formatting for exam screens. Renders a concise
// "21 Jun 2026, 3:30 PM" style string in the viewer's locale.

export function fmtDateTime(value) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
        day: "numeric", month: "short", year: "numeric",
        hour: "numeric", minute: "2-digit",
    });
}

// For <input type="datetime-local"> — needs "YYYY-MM-DDTHH:mm" in LOCAL time.
export function toDateTimeLocal(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
