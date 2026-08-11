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
- `TRACKING_URL=https://track.example.com` (optional but recommended — see
  [Email deliverability](#email-deliverability))

> `NEXT_PUBLIC_*` values are baked into the web image **at build time**. Change a
> domain or the anon key ⇒ rebuild `web` (`docker compose up -d --build web`).
> Plain env vars (`EMAIL_FROM`, `SMTP_*`, `TRACKING_URL`) are read at runtime —
> but a running container keeps the values it started with, so recreate it after
> an edit: `docker compose up -d --force-recreate web worker`.

---

## Email deliverability

Cold outreach lands in Gmail's **Promotions** tab when the message carries
bulk-mail markers. The send path avoids them: no open-tracking pixel, a
`text/plain` part alongside the HTML, a plain `--` signature instead of a styled
marketing footer, and no `List-Unsubscribe` headers by default. Two things still
have to be configured on the domain:

1. **Link domain alignment.** Tracked links (click tracker + unsubscribe) point
   at `TRACKING_URL`. If that's the app domain while mail comes `From` a
   different domain, the mismatch is a promotions/spam signal. Set
   `TRACKING_URL=https://track.<sending-domain>` and route that hostname to
   `web:3000` (same target as `SITE_URL`). Unset ⇒ falls back to `SITE_URL`.
2. **SPF, DKIM, DMARC** on the sending domain. Without them Gmail distrusts the
   `From` display name (it shows the local part instead of the name in
   `EMAIL_FROM`) and filters harder.

`EMAIL_LIST_UNSUBSCRIBE=true` re-enables the RFC 8058 one-click headers. Only
worth it above ~5k messages/day, where Gmail requires them — below that they
just mark the mail as bulk. The unsubscribe link in the body keeps the opt-out
compliant either way.

Open tracking is intentionally gone: Apple Mail Privacy Protection preloads
images (phantom opens) and Gmail blocks or proxies them (missed opens). Clicks,
demo-preview views (`website_demos.views`) and replies are the real signals.

### Warm-up and send pacing

Clean headers don't buy inbox placement on their own — Gmail scores the *sender*,
and a domain with no history that suddenly emits cold mail gets spam-foldered.
So sending is metered (Settings → **Domain warm-up & send pacing**):

* **Warm-up** — only addresses on the warm-up contact list are mailable; sends to
  real leads are refused with "warm-up in progress". The worker mails one seed
  contact per due slot with a short personal note asking for a reply, and flips
  the org to `live` after `warmup_days` (default 14).
* **Daily cap** — ramps 8/day (week 1) → 15 → 25 → 40 → 50 ceiling, counted per
  org per local day, warm-up mail included. `daily_cap_override` pins it.
* **Window** — sends only Mon–Fri inside the configured local hours, spaced with
  randomized gaps. Anything that doesn't fit rolls to the next day's window.
* **Replies** — the worker polls INBOX every 5 min, matches `In-Reply-To` /
  `References` against `emails.provider_id`, records a `replied` event, moves the
  lead to *Replied*, and marks the warm-up contact as having answered.

Requires the **worker + Redis**: scheduled sends live in BullMQ's delayed set, so
a send that isn't due immediately returns 503 if the worker is down. Reply
detection and the Sent-folder copy need `IMAP_*` set on the worker (falls back to
the SMTP credentials — same mailbox in most setups). `IMAP_INBOX_FOLDER` defaults
to `INBOX`.

Warm-up contacts must be real people who will actually reply and drag the message
out of spam if it lands there — that engagement is what moves reputation. Google
Postmaster Tools (add `devbishal.com`, verify by TXT) is the only way to see
whether it's working.

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
# Layer docker-compose.ports.yml to publish host ports for web + kong
# (the base compose publishes none — see note below).
docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d --build
docker compose logs -f migrator   # watch migrations apply, then exit 0
```

Put your own reverse proxy (Caddy/nginx/Traefik) in front, mapping the two
domains to `web:3000` and `kong:8000`, or use the published host ports from
`docker-compose.ports.yml` (`WEB_PORT`, `KONG_HTTP_PORT`).

> **Why no ports in the base compose?** On Dokploy/PaaS, Traefik joins the
> compose network and routes to `web:3000` / `kong:8000` by domain — and the
> host's 3000/8000 are already taken by the platform (Dokploy's own dashboard
> runs on 3000), so publishing them collides. Bare Docker without a proxy layers
> `docker-compose.ports.yml` to get the host bindings back.

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
