#!/usr/bin/env bash
# Applies schema.sql twice to an empty Postgres (proving it is safe to
# re-paste), then runs the checks. Needs DATABASE_URL.
set -euo pipefail
cd "$(dirname "$0")/../.."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f tests/schema/stubs.sql
as_supabase() { { echo "set role supabase_like;"; cat "$1"; } | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q; }
as_supabase schema.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1', 'midway@example.com');"
as_supabase schema.sql
as_supabase tests/schema/checks.sql
onboarded=$(psql "$DATABASE_URL" -tA -c "select onboarded from profiles where id = '00000000-0000-0000-0000-0000000000c1'")
if [ "$onboarded" != "f" ]; then echo "re-running schema.sql marked a new signup as onboarded"; exit 1; fi
echo "schema.sql: applied twice and all checks passed"
