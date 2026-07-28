-- Row Level Security. The service_role key (worker + trusted server routes)
-- bypasses RLS entirely; these policies govern the anon/authenticated client
-- used in the browser and in user-scoped server actions.

-- Enable RLS everywhere.
alter table public.organizations  enable row level security;
alter table public.profiles        enable row level security;
alter table public.org_members     enable row level security;
alter table public.searches        enable row level security;
alter table public.businesses      enable row level security;
alter table public.audits          enable row level security;
alter table public.leads           enable row level security;
alter table public.proposals       enable row level security;
alter table public.email_accounts  enable row level security;
alter table public.emails          enable row level security;
alter table public.email_events    enable row level security;
alter table public.suppressions    enable row level security;

-- ─── organizations ───────────────────────────────────────────
create policy org_select on public.organizations
  for select using (public.is_org_member(id));
create policy org_update on public.organizations
  for update using (public.is_org_member(id)) with check (public.is_org_member(id));

-- ─── profiles ────────────────────────────────────────────────
-- See your own profile and those of people you share an org with.
create policy profile_select on public.profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.org_members me
      join public.org_members them on them.org_id = me.org_id
      where me.user_id = auth.uid() and them.user_id = profiles.id
    )
  );
create policy profile_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ─── org_members ─────────────────────────────────────────────
create policy member_select on public.org_members
  for select using (public.is_org_member(org_id));

-- ─── generic org-scoped tables ───────────────────────────────
-- Same shape for every table that has an org_id column.
do $$
declare t text;
begin
  foreach t in array array[
    'searches','businesses','audits','leads','proposals',
    'email_accounts','emails','email_events','suppressions'
  ] loop
    execute format($f$
      create policy %1$s_select on public.%1$s
        for select using (public.is_org_member(org_id));
      create policy %1$s_insert on public.%1$s
        for insert with check (public.is_org_member(org_id));
      create policy %1$s_update on public.%1$s
        for update using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
      create policy %1$s_delete on public.%1$s
        for delete using (public.is_org_member(org_id));
    $f$, t);
  end loop;
end $$;
