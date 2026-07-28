-- Enable Postgres realtime for the tables the search UI subscribes to.
-- Without this, audit/lead status changes never reach the client and the UI
-- appears frozen (see components/search/search-client.jsx). Idempotent.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'audits'
  ) then
    alter publication supabase_realtime add table public.audits;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
  ) then
    alter publication supabase_realtime add table public.leads;
  end if;
end $$;

-- Emit full old-row data on updates/deletes so filtered subscriptions work.
alter table public.audits replica identity full;
alter table public.leads replica identity full;
