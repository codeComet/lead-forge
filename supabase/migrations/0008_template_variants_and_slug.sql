-- Two changes:
--  1. Multiple template VARIANTS per industry (was one). Each business is pinned
--     to a variant slot by hash, so same-industry demos get 2-3 distinct looks
--     instead of one. Replace unique(org,industry) with unique(org,industry,variant).
--  2. Short public preview code (slug) for website_demos, so proposal links are
--     /p/<8-char> instead of /preview/<uuid>.

-- ── 1. Template variants ──
alter table public.website_templates
  add column if not exists variant integer not null default 0;

alter table public.website_templates
  drop constraint if exists website_templates_org_id_industry_key;

alter table public.website_templates
  add constraint website_templates_org_industry_variant_key
  unique (org_id, industry, variant);

-- ── 2. Short preview slug ──
alter table public.website_demos
  add column if not exists slug text;

-- Unique but nullable (existing rows stay NULL and fall back to the uuid path).
create unique index if not exists website_demos_slug_key
  on public.website_demos (slug);
