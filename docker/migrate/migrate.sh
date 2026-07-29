#!/usr/bin/env sh
# Applies the app's SQL migrations (supabase/migrations/*.sql) to the self-hosted
# Postgres, once, in order. Runs as a one-shot container AFTER gotrue (auth) and
# storage-api have created their schemas, because 0001 FKs to auth.users and
# 0003 touches storage.*. Idempotent: tracks applied files in public.schema_migrations.
set -eu

: "${POSTGRES_HOST:=db}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_DB:=postgres}"
export PGPASSWORD="$POSTGRES_PASSWORD"

# -A -t = unaligned, tuples-only (clean scalar output for shell tests).
Q="psql -v ON_ERROR_STOP=1 -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -d $POSTGRES_DB -qAt"

echo "[migrate] waiting for postgres ..."
until $Q -c "select 1" >/dev/null 2>&1; do sleep 2; done

echo "[migrate] waiting for auth.users (gotrue migrations) ..."
until [ "$($Q -c "select to_regclass('auth.users') is not null")" = "t" ]; do sleep 2; done

echo "[migrate] waiting for storage.objects (storage-api migrations) ..."
until [ "$($Q -c "select to_regclass('storage.objects') is not null")" = "t" ]; do sleep 2; done

# 0004/0005 do `alter publication supabase_realtime ...`; make sure it exists.
$Q -c "do \$\$ begin if not exists (select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if; end \$\$;"

# Ledger of applied migrations.
$Q -c "create table if not exists public.schema_migrations (version text primary key, applied_at timestamptz not null default now());"

any=0
for f in /migrations/*.sql; do
  [ -e "$f" ] || continue
  v="$(basename "$f")"
  if [ "$($Q -c "select 1 from public.schema_migrations where version='$v'")" = "1" ]; then
    echo "[migrate] skip   $v"
    continue
  fi
  echo "[migrate] apply  $v"
  psql -v ON_ERROR_STOP=1 -h "$POSTGRES_HOST" -p "$POSTGRES_PORT" -U postgres -d "$POSTGRES_DB" -f "$f"
  $Q -c "insert into public.schema_migrations(version) values ('$v')"
  any=1
done

[ "$any" = "1" ] && echo "[migrate] migrations applied." || echo "[migrate] nothing to do."
echo "[migrate] done."
