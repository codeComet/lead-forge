#!/usr/bin/env bash
# Migrate DATA from a hosted Supabase project into this self-hosted stack.
# Schema is already created by the `migrator` service — this only moves rows.
#
# Prerequtes: the stack is up (docker compose up -d) and migrations ran.
# Run from the repo root:
#
#   SOURCE_DB_URL='postgres://postgres:PW@db.<ref>.supabase.co:5432/postgres' \
#     bash scripts/migrate-from-supabase.sh
#
# Get SOURCE_DB_URL from Supabase dashboard → Project Settings → Database →
# Connection string (URI, "Direct connection", NOT the pooler). Use the DB
# password, and add sslmode=require if prompted.
#
# What it does:
#   1. Copies auth.users (curated stable columns) from cloud → local.
#   2. Synthesises an 'email' identity per user (so password login works).
#   3. Copies all public.* rows (data-only) from cloud → local.
# All loads run with session_replication_role=replica so FK checks and the
# on_auth_user_created trigger stay out of the way.

set -euo pipefail

: "${SOURCE_DB_URL:?Set SOURCE_DB_URL to the hosted Supabase direct connection string}"
PGIMG="postgres:17-alpine"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Long-stable GoTrue columns — present across versions, avoids schema drift.
USER_COLS="id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, banned_until, deleted_at"

echo "==> 1/4  Exporting auth.users from cloud"
docker run --rm -e SRC="$SOURCE_DB_URL" "$PGIMG" \
  psql "$SOURCE_DB_URL" -v ON_ERROR_STOP=1 \
  -c "\copy (select ${USER_COLS} from auth.users where deleted_at is null) to stdout with csv" \
  > "$TMP/users.csv"
echo "    $(wc -l < "$TMP/users.csv") user row(s)"

echo "==> 2/4  Exporting public schema (data only) from cloud"
docker run --rm "$PGIMG" \
  pg_dump "$SOURCE_DB_URL" --data-only --schema=public \
    --exclude-table=public.schema_migrations \
    --no-owner --no-privileges --no-comments \
  > "$TMP/public.sql"
echo "    $(wc -c < "$TMP/public.sql") bytes"

echo "==> 3/4  Loading auth.users + synthesising identities into local db"
docker compose exec -T db psql -U postgres -d "${POSTGRES_DB:-postgres}" -v ON_ERROR_STOP=1 \
  -c "set session_replication_role = replica; \copy auth.users(${USER_COLS}) from stdin with csv" \
  < "$TMP/users.csv"

docker compose exec -T db psql -U postgres -d "${POSTGRES_DB:-postgres}" -v ON_ERROR_STOP=1 <<'SQL'
insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email is not null
  and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');
SQL

echo "==> 4/4  Loading public.* rows into local db"
{ echo "set session_replication_role = replica;"; cat "$TMP/public.sql"; } | \
  docker compose exec -T db psql -U postgres -d "${POSTGRES_DB:-postgres}" -v ON_ERROR_STOP=1 -f -

echo
echo "Done. Row counts:"
docker compose exec -T db psql -U postgres -d "${POSTGRES_DB:-postgres}" -tA -c \
  "select 'auth.users '||count(*) from auth.users
   union all select 'businesses '||count(*) from public.businesses
   union all select 'leads '||count(*) from public.leads
   union all select 'audits '||count(*) from public.audits
   union all select 'website_demos '||count(*) from public.website_demos;"
echo
echo "Next: migrate storage files -> node scripts/migrate-storage.mjs"
