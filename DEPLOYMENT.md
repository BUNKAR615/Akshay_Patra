# Deployment — GitHub → Vercel → Neon

This app is a Next.js (App Router) + Prisma + PostgreSQL project. Production
runs on **Vercel** with a **Neon** serverless Postgres database.

## 1. Database — Neon

1. Create a project at https://neon.tech and a database (e.g. `akshaya_patra`).
2. From the Neon dashboard copy **two** connection strings:
   - **Pooled** (host contains `-pooler`) → used as `DATABASE_URL` (app runtime).
   - **Direct** (no `-pooler`) → used as `DIRECT_URL` (migrations).
3. Append `?sslmode=require` to both. For the pooled URL also add
   `&pgbouncer=true&connection_limit=1`.

Example:

```
DATABASE_URL="postgresql://USER:PASS@ep-xxx-pooler.region.aws.neon.tech/akshaya_patra?sslmode=require&pgbouncer=true&connection_limit=1"
DIRECT_URL="postgresql://USER:PASS@ep-xxx.region.aws.neon.tech/akshaya_patra?sslmode=require"
```

The Prisma schema already reads both (`url` = `DATABASE_URL`, `directUrl` =
`DIRECT_URL`), so no schema change is needed.

## 2. Apply schema + seed (one time, from your machine)

```bash
# point .env at Neon (DATABASE_URL + DIRECT_URL above), then:
npx prisma migrate deploy   # creates all tables on Neon
npm run seed                # base data (users, branches, departments)
npm run seed:exams          # online-exam demo data (optional)
```

## 3. Hosting — Vercel

1. Push this repo to GitHub (already on `origin`).
2. At https://vercel.com → **Add New → Project** → import the GitHub repo.
3. Framework preset: **Next.js** (auto-detected). Build settings come from
   [`vercel.json`](vercel.json) — it runs `prisma generate && prisma migrate
   deploy && next build`, so migrations apply automatically on every deploy.
4. Add **Environment Variables** (Production + Preview):

   | Name           | Value                                             |
   | -------------- | ------------------------------------------------- |
   | `DATABASE_URL` | Neon **pooled** URL                               |
   | `DIRECT_URL`   | Neon **direct** URL                               |
   | `JWT_SECRET`   | a long random string (`openssl rand -base64 48`)  |
   | `NODE_ENV`     | `production`                                       |
   | `NEXTAUTH_URL` | your Vercel URL, e.g. `https://your-app.vercel.app`|

5. **Deploy.** Every push to the production branch redeploys automatically.

### CLI alternative

```bash
npm i -g vercel
vercel login
vercel link
vercel env add DATABASE_URL production   # repeat for each var above
vercel --prod
```

## Notes

- `.env` is gitignored — never commit real secrets. `.env.example` documents the
  required variables.
- If a deploy fails on `prisma migrate deploy`, confirm `DIRECT_URL` is the
  **non-pooled** Neon host and reachable from Vercel.
