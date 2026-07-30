-- Reusable, industry-themed website templates.
--
-- Generating a full demo site with an LLM is the most expensive job in the
-- system (large HTML output). Most leads in a scan share an industry
-- (dentists, restaurants, gyms, …) and a template-quality site differs only in
-- business name, city, phone, rating, and brand colour. So we generate ONE
-- template per (org, industry) — with placeholder tokens ({{BUSINESS_NAME}} …)
-- and a small CSS-variable palette — then fill it per business in code, with no
-- further model calls. The first business of an industry pays for the template;
-- every later same-industry business is free.

create table public.website_templates (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  industry    text not null,               -- normalized business_type (lower/trim)
  html        text not null,               -- template markup WITH {{TOKENS}}
  model       text,
  tokens      integer,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (org_id, industry)
);

alter table public.website_templates enable row level security;

-- Org-scoped access for the authenticated client (same shape as website_demos).
-- The worker uses the service-role key and bypasses these; they exist so the
-- web app can read/manage templates directly if needed.
create policy website_templates_select on public.website_templates
  for select using (public.is_org_member(org_id));
create policy website_templates_insert on public.website_templates
  for insert with check (public.is_org_member(org_id));
create policy website_templates_update on public.website_templates
  for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy website_templates_delete on public.website_templates
  for delete using (public.is_org_member(org_id));
