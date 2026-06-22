// Shared deadline logic for online exams. `dueDate` (when set) is a hard close
// time: once it passes, the exam stops accepting submissions for everyone —
// enforced lazily on each take/submit request (no cron needed, since no write
// is accepted past the deadline).

// Grace window (ms) after dueDate during which an already-open taker's
// auto-submit is still accepted. This absorbs the race at the exact close
// moment (the client force-submits when the timer hits the deadline) without
// letting anyone keep working — the UI is already locked at dueDate.
export const SUBMISSION_GRACE_MS = 90 * 1000;

/** True when the exam has a dueDate that is now in the past. Used to lock the
 *  UI and block starting/continuing exactly at the deadline. */
export function isExamClosed(exam, now = Date.now()) {
    if (!exam?.dueDate) return false;
    const t = new Date(exam.dueDate).getTime();
    return Number.isFinite(t) && now > t;
}

/** True once the deadline + grace window has fully elapsed. Used server-side to
 *  reject submissions — gives in-flight auto-submits a moment to land. */
export function isPastSubmissionGrace(exam, now = Date.now()) {
    if (!exam?.dueDate) return false;
    const t = new Date(exam.dueDate).getTime();
    return Number.isFinite(t) && now > t + SUBMISSION_GRACE_MS;
}
