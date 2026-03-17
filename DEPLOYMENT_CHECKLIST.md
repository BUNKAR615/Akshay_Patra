# Akshaya Patra Deployment Checklist

Before going live to production with the Evaluation Portal, follow this step-by-step checklist to ensure stability, proper database connections, and secure secret configurations.

## 1. Environment & Secrets
- [ ] Make sure your hosting environment (Vercel, AWS, etc) has the exact same configuration keys found in `.env.example`.
- [ ] Set `NODE_ENV` equal to `production`. (If using Vercel, it does this by default on your `main` branch deployments).
- [ ] Rotate `JWT_SECRET` to a strong, high-entropy random hex-string. Do NOT use the default developer secret.
- [ ] Provide your live PostgreSQL `DATABASE_URL`. Ensure its connection settings specify any required direct-connect bounds or PgBouncer/Supabase connection string layouts as appropriate.

## 2. Dependencies & Build
- [ ] Delete `node_modules/` and completely clear `package-lock.json` if building locally before uploading.
- [ ] Run `npm install` for a completely fresh dependency graph.
- [ ] Ensure `npm run build` exits with a `0` code (no NextJS route compilation errors). 

## 3. Database Syncing
- [ ] Push the Prisma schema directly to your production database using `npx prisma db push` (or `npx prisma migrate deploy` if migrating).
- [ ] (*Optional*) Seed the production defaults. Only run `npm run seed` if the live database is completely empty and you need the initial generic Admins and dummy departments in place.

## 4. Final Security Audits
- [ ] Confirm no local `.env` files matching `*local*` or containing passwords are inadvertently committed to the GitHub repository logs.
- [ ] Verify that HTTP cookies natively handle sessions (since `localStorage` has been removed). Wait around ~8 hours to test the organic sign-out bounds.
- [ ] Open the app in Incognito bounds to ensure unauthorized routes actively redirect back to login strings matching `?error=Session expired...`. 

Your deployment is secure, responsive, and completely ready to pilot!
