# LeadForge

AI Website Lead Finder & Outreach Platform — find local businesses that need a
new website, audit them with AI, score leads, generate proposals, and send
tracked outreach. Monorepo: Next.js 15 (JavaScript) web app + a Node worker for
heavy jobs, backed by Supabase.

## Stack

- **Web** — Next.js 15 (App Router, JS), Tailwind, hand-rolled shadcn-style UI, Framer Motion, TanStack Query
- **Backend** — Supabase (Postgres + Auth + Storage + RLS)
- **Worker** — Node + BullMQ + Redis, Playwright, cheerio, PageSpeed Insights
- **AI** — Anthropic Claude (`@anthropic-ai/sdk`)
- **Email** — Resend

## Layout

```
apps/web        Next.js app (UI, auth, API routes, job enqueue)
apps/worker     Background worker (audits, screenshots, AI, email)
packages/shared Pure shared logic (constants, scoring, prompts)
supabase/       SQL migrations (schema + RLS + storage)
```

## Setup

1. **Install** (Node ≥ 22, pnpm ≥ 11):
   ```bash
   pnpm install
   ```

2. **Supabase project** — create one at supabase.com, then apply migrations in
   order (SQL editor, or `supabase db push` with the CLI):
   ```
   supabase/migrations/0001_init.sql
   supabase/migrations/0002_rls.sql
   supabase/migrations/0003_storage.sql
   ```
   Enable the Google auth provider in Supabase → Authentication → Providers if
   you want "Continue with Google".

3. **Env** — copy `.env.example` to `.env` and fill in keys:
   ```bash
   cp .env.example .env
   ```

4. **Run**:
   ```bash
   pnpm dev          # web on http://localhost:3000
   pnpm dev:worker   # background worker (needs Redis + keys)
   ```

## MVP status — complete

- **P0 ✅** Monorepo, schema + RLS, auth (email + Google), app shell, dashboard
- **P1 ✅** Business search (Google Places) + results table + map + filters
- **P2 ✅** Worker + queue + audit pipeline (Playwright, SEO, PageSpeed, tech)
- **P3 ✅** Lead scoring + AI insights + business detail
- **P4 ✅** AI proposal generator (synchronous in-app + worker job)
- **P5 ✅** Email (Resend) + open/click/unsubscribe tracking + CRM board + dashboard analytics

### End-to-end flow
Search (`/search`) → businesses stored + audit jobs queued → worker audits
(Playwright screenshots, SEO, PageSpeed, tech, social) → deterministic lead
score + Claude insight → business detail (`/leads/[id]`) → generate proposal →
send tracked email → pixel/click tracking updates the CRM board (`/leads`) and
dashboard stats.

### What needs your credentials to run live
1. A Supabase project — apply the three migrations in `supabase/migrations/`.
2. `.env` filled from `.env.example` (Supabase keys required; Google/Anthropic/
   Resend/Redis enable search, AI, email, and background audits respectively).
3. `pnpm dev` (web) and, for audits/queued jobs, Redis + `pnpm dev:worker`.

Proposals and email send run **synchronously in the Next.js API routes**, so
they work without Redis/worker; only the audit pipeline requires the worker.

Deferred (post-MVP): AI website generator, competitor analysis, outreach
sequences, PDF proposals, templates, billing, browser extension.
