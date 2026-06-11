// Client-side fetch wrapper shared by dashboard pages.
// Unwraps the { success, data, message } envelope and retries transient
// failures (network blips, 503 warm-ups) with backoff.
export async function api(url, opts, { retries = 4 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt < retries; attempt++) {
        let res;
        try {
            res = await fetch(url, opts);
        } catch (e) {
            // Network blip — retry a couple of times before surfacing.
            lastErr = e;
            if (attempt < retries - 1) {
                await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
                continue;
            }
            throw e;
        }
        let json = null;
        try { json = await res.json(); } catch { json = null; }

        // 503 = backend warming up (cold DB / pool). Retry transparently
        // with backoff so the dashboard never shows a dead error page.
        if (res.status === 503 && attempt < retries - 1) {
            lastErr = new Error((json && json.message) || "Service starting up");
            await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
            continue;
        }

        if (!res.ok || !json || !json.success) {
            const err = new Error((json && json.message) || "Request failed");
            err.status = res.status;
            throw err;
        }
        return json.data;
    }
    throw lastErr || new Error("Request failed");
}
