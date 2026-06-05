/**
 * k6 load test — Akshaya Patra evaluation app
 *
 * MODES (set with  -e MODE=...):
 *   smoke (default) — read-only & non-destructive. Each virtual user hits
 *                     /login, /api/health, and a FAKE-credential login POST
 *                     (expects 401). Writes nothing, logs nobody in — safe to
 *                     run against production.
 *   full            — real authenticated flow. Requires  -e EMP_CODE  and
 *                     -e PASSWORD. Logs in, then loads /api/auth/me and
 *                     /api/assessment/questions. Run this against a Vercel
 *                     PREVIEW deployment seeded with test accounts — not
 *                     production (so any later submit testing can't corrupt
 *                     real evaluation data).
 *
 * EXAMPLES:
 *   k6 run -e VUS=50 -e DURATION=1m scripts/loadtest.k6.js
 *   k6 run -e MODE=full -e BASE_URL=<preview-url> -e EMP_CODE=1800349 -e PASSWORD=secret scripts/loadtest.k6.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'https://akshaya-patra.vercel.app';
const MODE     = __ENV.MODE     || 'smoke';

// 401 (expected for the fake-credential login) and 503 (Neon DB cold-start)
// are not real failures; 403/429/500 still count so they surface in the report.
http.setResponseCallback(http.expectedStatuses(200, 401, 503));

export const options = {
  vus:      parseInt(__ENV.VUS || '10', 10),
  duration: __ENV.DURATION || '30s',
  thresholds: {
    http_req_failed:   ['rate<0.05'],   // < 5% failed requests
    http_req_duration: ['p(95)<3000'],  // 95% of requests under 3s
    checks:            ['rate>0.95'],   // > 95% of assertions pass
  },
};

function note(r, label) {
  if (![200, 401, 503].includes(r.status)) {
    console.log(`unexpected ${r.status} on ${label}`);
  }
}

function smoke() {
  const page = http.get(`${BASE_URL}/login`);
  note(page, 'GET /login');
  check(page, { 'login page 200': (r) => r.status === 200 });

  const health = http.get(`${BASE_URL}/api/health`);
  note(health, 'GET /api/health');
  check(health, { 'health 200/503': (r) => r.status === 200 || r.status === 503 });

  const login = http.post(`${BASE_URL}/api/auth/login`,
    JSON.stringify({ empCode: '99999999', password: 'loadtest' }),
    { headers: { 'Content-Type': 'application/json' } });
  note(login, 'POST /api/auth/login');
  check(login, {
    'login reached app (401)':        (r) => r.status === 401,
    'login NOT rate-limited (!=429)': (r) => r.status !== 429,
  });

  sleep(1);
}

function full() {
  const empCode  = __ENV.EMP_CODE;
  const password = __ENV.PASSWORD;
  if (!empCode || !password) {
    throw new Error('MODE=full needs  -e EMP_CODE=...  and  -e PASSWORD=...');
  }
  // login — the auth cookie is stored in this VU's cookie jar automatically.
  const login = http.post(`${BASE_URL}/api/auth/login`,
    JSON.stringify({ empCode, password }),
    { headers: { 'Content-Type': 'application/json' } });
  const ok = check(login, { 'login 200': (r) => r.status === 200 });
  if (!ok) { sleep(1); return; }

  const me = http.get(`${BASE_URL}/api/auth/me`);
  check(me, { '/api/auth/me 200': (r) => r.status === 200 });

  const questions = http.get(`${BASE_URL}/api/assessment/questions`);
  check(questions, { '/api/assessment/questions 200': (r) => r.status === 200 });

  sleep(1);
}

export default function () {
  if (MODE === 'full') full();
  else smoke();
}
