# OKÜ Group Platform (Replit / Vercel-ready) — Starter Kit

This folder contains a complete, runnable scaffold:
- Next.js (App Router) + TypeScript
- Auth.js (NextAuth) with Google/Facebook (optional to enable)
- Prisma + Postgres (Neon/Supabase)
- Authorize.net payments (Accept.js tokenization + server capture/refund stubs)
- Transaction-safe capacity enforcement (atomic soldCount updates)
- Commission ledger automation (earned/reversed/paid via payout batch)
- BullMQ background queue (Redis) + worker service
- Seed script + role bootstrap
- Vercel deployment config + notes

## What you do (non-technical steps)
1) **Upload this folder to Replit** (or unzip it and import to Replit).
2) Create a Postgres database (Neon recommended).
3) Copy `.env.example` to `.env` and fill the values.
4) In Replit Shell:
   - `npm install`
   - `npx prisma migrate dev`
   - `npm run seed`
   - `npm run dev`

Then open the web preview.

## Important hosting note
Vercel cannot run long-lived BullMQ workers.
- Host the **web** on Vercel.
- Host the **worker** on Railway/Fly.io/Render.
- Use **Upstash Redis** for `REDIS_URL`.

## Where things are
- Prisma schema: `prisma/schema.prisma`
- Seed script: `prisma/seed.ts`
- Auth config: `src/lib/auth.ts`
- Prisma client: `src/lib/prisma.ts`
- RBAC: `src/lib/permissions.ts` + `src/lib/rbac.ts`
- Payments (Authorize.net): `src/server/authorizeNet/*`
- Checkout routes: `src/app/api/v1/checkout/*`
- Admin routes: `src/app/api/v1/admin/*`
- Worker: `worker/index.ts`

## Minimal demo flow
1) Create a Series + Session + TicketType in Admin endpoints (or seed provides sample).
2) Visit `/series` and open a series detail page.
3) Create checkout intent and confirm (server stubs; Authorize.net capture ready when keys provided).
