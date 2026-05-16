# Akshaya Patra — Best Employee of the Quarter

Employee Evaluation System (Jaipur Branch Pilot)

## Tech Stack
- **Frontend + API**: Next.js (App Router)
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: JWT + bcrypt

## Getting Started

```bash
# Install dependencies
npm install

# Set up your .env file (see .env.example)
# Then run Prisma migrations
npx prisma migrate dev --name init

# Start the dev server
npm run dev
```

## Environment Variables
Copy `.env.example` to `.env` and fill in your values.

## Deployment (Vercel)

Vercel auto-detects Next.js and runs the `build` script in `package.json`:

```
prisma generate && prisma migrate deploy && next build
```

This applies committed migrations from `prisma/migrations/` — it does **not**
use `db push` and **never** drops data. The previous build script (`prisma db
push --accept-data-loss`) was destructive on every deploy and is no longer used.

### Required Vercel environment variables

Set these under **Project Settings → Environment Variables** for every
environment that should run the app (Production, Preview, Development):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Neon **pooled** connection string (same string used locally in `.env`). |
| `DIRECT_URL`   | Neon **direct** (non-pooler) connection string. Required by `prisma migrate deploy`. |
| `JWT_SECRET`   | Must match the secret that signed existing cookies, or every session will invalidate on deploy. |
| `JWT_EXPIRES_IN` | Access-token TTL (e.g. `8h`). Same as `.env`. |
| `BLOB_READ_WRITE_TOKEN` | Optional. Required **only** if HR Excel uploads should persist in production via Vercel Blob. Without it, the route falls back to writing under `public/uploads/`, which fails silently on Vercel's read-only filesystem. |

A `vercel.json` is **not** required.

### Re-uploading branch employees

Bulk-upload defaults to **merge** mode — existing employees in the DB are
preserved and the sheet is unioned in. To remove employees who are no longer
in the sheet, send the request with `mode=replace` to:

```
POST /api/admin/branches/[branchId]/employees/bulk-upload
  form-data: file=<sheet.csv>, mode=replace
```

Stale employees move to the `ArchivedEmployee` table; departments left
without any active employee are deleted. Use merge mode for incremental
adds, replace mode for a full reset.

