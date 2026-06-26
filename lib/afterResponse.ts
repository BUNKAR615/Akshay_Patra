/**
 * runAfterResponse — run non-critical work WITHOUT blocking the HTTP response.
 *
 * The user's response is returned the moment the critical write is committed;
 * derived/secondary work (shortlist recompute, notifications, …) is scheduled
 * to finish afterwards.
 *
 * Reliability:
 *  - On Vercel, the serverless function is kept alive until the promise settles
 *    via the platform `waitUntil` hook, so the work is NOT dropped when the
 *    response is flushed.
 *  - Anywhere else (local `next dev`, a long-lived Node server, tests) the event
 *    loop stays alive, so the fire-and-forget promise simply completes.
 *  - Failures are swallowed + logged: a hiccup in best-effort background work
 *    must never surface as an error to a user whose data is already saved.
 */
export function runAfterResponse(work: () => Promise<unknown>): void {
  const p = (async () => {
    try {
      await work()
    } catch (err) {
      console.error('[afterResponse] background task failed:', err)
    }
  })()

  // Keep the Vercel function warm until `p` settles, when running on Vercel.
  try {
    const ctx = (globalThis as any)[Symbol.for('@vercel/request-context')]?.get?.()
    ctx?.waitUntil?.(p)
  } catch {
    /* not on Vercel — the event loop keeps `p` alive on its own */
  }
}
