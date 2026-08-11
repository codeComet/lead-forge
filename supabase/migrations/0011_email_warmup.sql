-- Send throttling + domain warm-up.
--
-- Cold outreach from a domain with no sending history gets spam-foldered no
-- matter how clean the headers are — Gmail scores the *sender*, and reputation
-- is earned from real engagement at a sane pace. So: sends are metered against
-- a ramping daily cap and spaced through a business-hours window, and a new
-- domain starts in a warm-up phase that only mails a seed list of addresses the
-- operator controls (who reply and mark "not spam"). Cold sends to real leads
-- unlock when warm-up graduates.

-- ── Per-org email sending config + warm-up state ───────────────────────
create table public.email_settings (
  org_id            uuid primary key references public.organizations (id) on delete cascade,
  -- 'idle'    → nothing configured yet; sends go out immediately (legacy behaviour)
  -- 'warming' → only seed contacts are mailable; leads are blocked
  -- 'live'    → warm-up graduated; leads mailable, cap still enforced
  mode              text not null default 'idle' check (mode in ('idle', 'warming', 'live')),
  warmup_started_at timestamptz,
  warmup_days       integer not null default 14 check (warmup_days between 1 and 60),
  -- IANA zone the send window is evaluated in.
  timezone          text not null default 'Europe/Stockholm',
  -- Send window, local to `timezone`. 9 → 17 means 09:00–16:59.
  window_start_hour integer not null default 9 check (window_start_hour between 0 and 23),
  window_end_hour   integer not null default 17 check (window_end_hour between 1 and 24),
  -- ISO weekdays allowed to send (1 = Monday … 7 = Sunday).
  send_days         integer[] not null default '{1,2,3,4,5}',
  -- Overrides the ramp curve when set (null = use the curve for the current day).
  daily_cap_override integer check (daily_cap_override > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint email_settings_window_valid check (window_end_hour > window_start_hour)
);

-- ── Warm-up seed recipients ────────────────────────────────────────────
-- Addresses the operator controls or trusts. During warm-up these are the only
-- allowed recipients; a reply from one is the signal that matters.
create table public.warmup_contacts (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  email        text not null,
  name         text,
  last_sent_at timestamptz,
  replied_at   timestamptz,
  created_at   timestamptz not null default now(),
  unique (org_id, email)
);
create index warmup_contacts_org_idx on public.warmup_contacts (org_id, last_sent_at nulls first);

-- ── emails: distinguish warm-up traffic from real outreach ─────────────
alter table public.emails
  add column if not exists kind text not null default 'outreach'
    check (kind in ('outreach', 'warmup'));

-- Daily-cap counting: "how many did this org send since midnight".
create index if not exists emails_org_sent_at_idx on public.emails (org_id, sent_at desc);
-- Due-queue scans for the scheduler.
create index if not exists emails_scheduled_idx on public.emails (status, scheduled_at)
  where status = 'queued';

-- ── RLS (same org-scoped shape as the other tables) ────────────────────
alter table public.email_settings  enable row level security;
alter table public.warmup_contacts enable row level security;

create policy email_settings_select on public.email_settings
  for select using (public.is_org_member(org_id));
create policy email_settings_insert on public.email_settings
  for insert with check (public.is_org_member(org_id));
create policy email_settings_update on public.email_settings
  for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create policy warmup_contacts_select on public.warmup_contacts
  for select using (public.is_org_member(org_id));
create policy warmup_contacts_insert on public.warmup_contacts
  for insert with check (public.is_org_member(org_id));
create policy warmup_contacts_update on public.warmup_contacts
  for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy warmup_contacts_delete on public.warmup_contacts
  for delete using (public.is_org_member(org_id));
