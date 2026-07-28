-- LeadForge initial schema.
-- Multi-tenant: every domain row carries org_id; RLS restricts rows to members
-- of that org. auth.users is managed by Supabase Auth.

create extension if not exists "pgcrypto";

-- ─── updated_at helper ───────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── Tenancy ─────────────────────────────────────────────────
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.org_members (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner','admin','member')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members (user_id);

-- Membership check used by every RLS policy. SECURITY DEFINER + a stable search
-- path so policies can call it without recursive RLS evaluation.
create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.org_members m
    where m.org_id = target_org and m.user_id = auth.uid()
  );
$$;

-- ─── Search + businesses ─────────────────────────────────────
create table public.searches (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  created_by    uuid references auth.users (id) on delete set null,
  country       text,
  city          text,
  radius_m      integer not null default 5000,
  business_type text not null,
  status        text not null default 'pending' check (status in ('pending','running','done','failed')),
  result_count  integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index searches_org_idx on public.searches (org_id, created_at desc);

create table public.businesses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  search_id     uuid references public.searches (id) on delete set null,
  place_id      text not null,
  name          text not null,
  business_type text,
  rating        numeric(2,1),
  reviews       integer,
  address       text,
  city          text,
  phone         text,
  website       text,
  opening_hours jsonb,
  lat           double precision,
  lng           double precision,
  maps_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Dedupe a place within an org (same place can belong to different orgs).
  unique (org_id, place_id)
);
create index businesses_org_idx on public.businesses (org_id, created_at desc);
create index businesses_search_idx on public.businesses (search_id);

-- ─── Audits ──────────────────────────────────────────────────
create table public.audits (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations (id) on delete cascade,
  business_id       uuid not null references public.businesses (id) on delete cascade,
  status            text not null default 'pending' check (status in ('pending','running','done','failed')),
  website           jsonb,   -- { exists, https, ssl, mobileFriendly, responsive, fast, modern, brokenPages, contactForm, cta, trustIndicators, loadTimeMs }
  seo               jsonb,   -- { metaTitle, metaDescription, h1, missingAltCount, sitemap, robots, pageSpeedScore, seoScore, accessibilityScore, structuredData }
  tech              jsonb,   -- { stack:[], age, obsolete }
  gbp               jsonb,   -- { photos, reviews, rating, responseRate, hasDescription, categories }
  social            jsonb,   -- { facebook, instagram, linkedin, tiktok, youtube }
  website_score     integer,
  seo_score         integer,
  overall_score     integer,
  screenshot_desktop text,   -- storage path
  screenshot_mobile  text,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (business_id)
);
create index audits_org_idx on public.audits (org_id);

-- ─── Leads (CRM) ─────────────────────────────────────────────
create table public.leads (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  business_id   uuid not null references public.businesses (id) on delete cascade,
  lead_score    integer not null default 0,
  color         text check (color in ('green','orange','red')),
  reasons       jsonb not null default '[]'::jsonb,
  insight       jsonb,   -- { summary, problems[], improvements[], estimatedMissedCustomersPerMonth, estimatedLostRevenuePerMonth }
  status        text not null default 'new' check (status in ('new','contacted','opened','replied','meeting','won','lost')),
  tags          text[] not null default '{}',
  notes         text,
  contact_email text,
  email_confidence text check (email_confidence in ('verified','likely','unknown')),
  opted_out     boolean not null default false,
  reminder_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (business_id)
);
create index leads_org_idx on public.leads (org_id, status);
create index leads_score_idx on public.leads (org_id, lead_score desc);

-- ─── Proposals ───────────────────────────────────────────────
create table public.proposals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  lead_id       uuid not null references public.leads (id) on delete cascade,
  subject       text,
  body          text not null,
  model         text,
  tokens        integer,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index proposals_lead_idx on public.proposals (lead_id, created_at desc);

-- ─── Email ───────────────────────────────────────────────────
create table public.email_accounts (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  provider      text not null default 'resend' check (provider in ('resend','smtp','ses','sendgrid','google','microsoft')),
  from_email    text not null,
  from_name     text,
  config        jsonb,  -- provider-specific (encrypted at rest by app before store)
  is_default    boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index email_accounts_org_idx on public.email_accounts (org_id);

create table public.emails (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations (id) on delete cascade,
  lead_id        uuid references public.leads (id) on delete set null,
  proposal_id    uuid references public.proposals (id) on delete set null,
  to_email       text not null,
  subject        text not null,
  body_html      text not null,
  status         text not null default 'queued' check (status in ('queued','sent','failed','bounced')),
  provider_id    text,   -- id returned by Resend
  tracking_id    uuid not null default gen_random_uuid(),
  scheduled_at   timestamptz,
  sent_at        timestamptz,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index emails_org_idx on public.emails (org_id, created_at desc);
create index emails_tracking_idx on public.emails (tracking_id);

create table public.email_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  email_id      uuid not null references public.emails (id) on delete cascade,
  type          text not null check (type in ('sent','opened','clicked','replied','bounced','complained')),
  meta          jsonb,
  created_at    timestamptz not null default now()
);
create index email_events_email_idx on public.email_events (email_id);
create index email_events_org_idx on public.email_events (org_id, type);

-- Global suppression / opt-out list per org (compliance).
create table public.suppressions (
  org_id      uuid not null references public.organizations (id) on delete cascade,
  email       text not null,
  reason      text,
  created_at  timestamptz not null default now(),
  primary key (org_id, email)
);

-- ─── updated_at triggers ─────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'organizations','profiles','searches','businesses','audits',
    'leads','proposals','email_accounts','emails'
  ] loop
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ─── New-user onboarding: profile + personal org + membership ─
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare new_org uuid;
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email));

  insert into public.organizations (name)
  values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)) || '''s workspace')
  returning id into new_org;

  insert into public.org_members (org_id, user_id, role)
  values (new_org, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
