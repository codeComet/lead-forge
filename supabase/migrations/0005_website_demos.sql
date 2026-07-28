-- AI-generated demo websites for no-website (or weak-website) leads.
-- The worker fills `html`; it's served publicly (unguessable id) at /preview/[id]
-- and the link is dropped into outreach emails.

create table public.website_demos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  status      text not null default 'pending' check (status in ('pending','running','done','failed')),
  html        text,
  model       text,
  tokens      integer,
  error       text,
  views       integer not null default 0,
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index website_demos_business_idx on public.website_demos (business_id, created_at desc);

alter table public.website_demos enable row level security;

-- Org-scoped access for the authenticated client (same shape as other tables).
create policy website_demos_select on public.website_demos
  for select using (public.is_org_member(org_id));
create policy website_demos_insert on public.website_demos
  for insert with check (public.is_org_member(org_id));
create policy website_demos_update on public.website_demos
  for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy website_demos_delete on public.website_demos
  for delete using (public.is_org_member(org_id));

-- Live status updates in the UI (see realtime notes for audits/leads).
alter publication supabase_realtime add table public.website_demos;
alter table public.website_demos replica identity full;
