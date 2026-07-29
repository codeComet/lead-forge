# Deploying LeadForge (Docker + Dokploy on Hostinger)

This ships the **whole platform in one `docker compose`** — Postgres, the Supabase
API layer (auth / rest / realtime / storage / gateway), Redis, the Next.js web
app, and the BullMQ worker. No external Supabase or Redis needed.

```
db        supabase/postgres  — your data (roles, auth & storage schemas built in)
auth      GoTrue             — email + password login
rest      PostgREST          — serves the app's data queries
realtime  Realtime           — live dashboard / pipeline updates
storage   storage-api        — screenshots + logos (file backend, on a volume)
kong      Kong               — single Supabase endpoint the app talks to
redis     Redis              — BullMQ job queues
migrator  one-shot           — applies supabase/migrations/*.sql, then exits
web       Next.js            — the dashboard
worker    Node + Playwright  — audits, AI, screenshots, email
studio    Supabase Studio    — OPTIONAL admin UI (profile: studio)
```

---

## 0. Resource note (Hostinger KVM 2)

KVM 2 (≈2 vCPU / 8 GB) fits the base stack. Leave Studio off in normal operation
(it's behind a profile, so it doesn't start unless you ask for it).

---

## 1. Two domains

Point two (sub)domains at the server:

| Domain                     | Routes to      | Purpose                    |
| -------------------------- | -------------- | -------------------------- |
| `app.example.com`          | `web` : 3000   | the dashboard              |
| `supabase.example.com`     | `kong` : 8000  | auth / data / storage API  |

The browser talks to **both**, so they must be public. `supabase.example.com`
exposing the Supabase API is by design — the anon key is public and RLS protects
the data; the `service_role` key stays server-side only.

---

## 2. Configure

On your machine or the server, from the repo root:

```bash
cp .env.docker.example .env
node scripts/gen-secrets.mjs        # fills POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, SECRET_KEY_BASE, DASHBOARD_PASSWORD
```

Then edit `.env` and set:

- `SITE_URL=https://app.example.com`
- `SUPABASE_PUBLIC_URL=https://supabase.example.com`
- `ADDITIONAL_REDIRECT_URLS=https://app.example.com/**`
- `ANTHROPIC_API_KEY`, `GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `PAGESPEED_API_KEY`
- `SMTP_*` + `EMAIL_FROM` (outbound outreach email)

> `NEXT_PUBLIC_*` values are baked into the web image **at build time**. Change a
> domain or the anon key ⇒ rebuild `web` (`docker compose up -d --build web`).

---

## 3A. Deploy with Dokploy (recommended)

1. **Create app → Docker Compose**, point it at this Git repo (branch `main`),
   compose path `docker-compose.yml`.
2. **Environment**: paste the contents of your `.env` into Dokploy's env editor
   (Dokploy injects it as the compose env file). Don't commit `.env`.
3. **Domains**: add two domains on this compose app —
   - `app.example.com` → service `web`, port `3000`
   - `supabase.example.com` → service `kong`, port `8000`
   Enable HTTPS (Let's Encrypt) on both. Dokploy's Traefik joins the compose
   network and routes by domain; the `ports:` in the compose file are only for
   bare-Docker use and can be ignored.
4. **Deploy**. First deploy builds `web` + `worker` (a few minutes; the worker
   image is large because of Playwright/Chromium).

`migrator` runs automatically after `auth` + `storage` are healthy, applies the
SQL migrations, and exits. `web`/`worker` wait for it to finish before starting.

## 3B. Deploy with plain Docker

```bash
docker compose up -d --build
docker compose logs -f migrator   # watch migrations apply, then exit 0
```

Put your own reverse proxy (Caddy/nginx/Traefik) in front, mapping the two
domains to `web:3000` and `kong:8000`, or just use the published host ports
(`WEB_PORT`, `KONG_HTTP_PORT`).

---

## 4. Migrate data from your old Supabase project

Do this **after** the stack is up and `migrator` has finished (schema exists).

### 4a. Database rows (incl. users + passwords)

Get the **direct** connection string from the Supabase dashboard → Project
Settings → Database → Connection string → URI (not the pooler).

```bash
SOURCE_DB_URL='postgres://postgres:YOUR_DB_PW@db.fbercyitxusxjhlesoor.supabase.co:5432/postgres?sslmode=require' \
  bash scripts/migrate-from-supabase.sh
```

This copies `auth.users` (preserving bcrypt passwords — users keep their logins),
recreates their email identities, and copies every `public.*` row. It loads with
`session_replication_role = replica` so foreign-key order and the signup trigger
don't interfere.

### 4b. Storage files (screenshots + logos)

```bash
SOURCE_SUPABASE_URL='https://fbercyitxusxjhlesoor.supabase.co' \
SOURCE_SERVICE_ROLE_KEY='<old project service_role key>' \
TARGET_SUPABASE_URL='https://supabase.example.com' \
TARGET_SERVICE_ROLE_KEY='<SERVICE_ROLE_KEY from your .env>' \
  node scripts/migrate-storage.mjs
```

Keys are preserved, so existing `audits.screenshot_*` paths keep resolving.

> Fresh install with no old data? Skip step 4 entirely.

---

## 5. Verify

```bash
docker compose ps                       # all healthy; migrator = exited (0)
curl -sS https://supabase.example.com/auth/v1/health   # {"...":"GoTrue..."}
```

Open `https://app.example.com`, sign up (or log in with a migrated account),
run a search, and confirm audits/leads stream in live.

---

## Operations

| Task                    | Command                                                        |
| ----------------------- | -------------------------------------------------------------- |
| Rebuild after code pull | `docker compose up -d --build`                                 |
| Open Studio (temp)      | `docker compose --profile studio up -d studio` → `:${STUDIO_PORT}` |
| Re-run migrations       | `docker compose up migrator` (idempotent — skips applied ones) |
| DB shell                | `docker compose exec db psql -U postgres`                      |
| Backup DB               | `docker compose exec -T db pg_dump -U postgres postgres > backup.sql` |
| Logs                    | `docker compose logs -f web worker`                            |

### Notes / gotchas

- **Build needs internet** — `next/font` (Inter) is fetched from Google Fonts at
  build time, and Playwright's base image pulls Chromium. Dokploy build hosts
  have network, so this is fine.
- **New migrations**: drop `0006_*.sql` into `supabase/migrations/` and run
  `docker compose up migrator`. The ledger table `public.schema_migrations`
  tracks what's applied.
- **Email confirmation**: `ENABLE_EMAIL_AUTOCONFIRM=true` makes new accounts
  usable immediately without SMTP. Set it `false` once real SMTP is configured
  if you want to require confirmation.
- **Secrets**: never commit `.env`. `ANON_KEY`/`SERVICE_ROLE_KEY` are HS256 JWTs
  signed with `JWT_SECRET`; regenerating `JWT_SECRET` invalidates both keys and
  all existing sessions.
