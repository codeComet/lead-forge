-- Storage buckets. Objects are keyed by org: "<org_id>/<business_id>/<file>".
-- Buckets are private; the worker writes with the service_role key and the web
-- app serves images via short-lived signed URLs. Members may also read directly.

insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false), ('logos', 'logos', false)
on conflict (id) do nothing;

-- Read: a member of the org that owns the object (first path segment = org_id).
create policy "member read screenshots" on storage.objects
  for select using (
    bucket_id in ('screenshots','logos')
    and public.is_org_member( (split_part(name, '/', 1))::uuid )
  );

-- Writes/updates/deletes from the browser are members-only; the worker uses
-- service_role and bypasses these.
create policy "member write screenshots" on storage.objects
  for insert with check (
    bucket_id in ('screenshots','logos')
    and public.is_org_member( (split_part(name, '/', 1))::uuid )
  );
create policy "member modify screenshots" on storage.objects
  for update using (
    bucket_id in ('screenshots','logos')
    and public.is_org_member( (split_part(name, '/', 1))::uuid )
  );
create policy "member delete screenshots" on storage.objects
  for delete using (
    bucket_id in ('screenshots','logos')
    and public.is_org_member( (split_part(name, '/', 1))::uuid )
  );
