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
# The paste-in database check must report "All good" on a fully set-up
# database, and must spot something missing or out of date.
result=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tA -f database-check.sql)
case "$result" in
  "All good"*) ;;
  *) echo "database-check.sql did not report All good:"; echo "$result"; exit 1 ;;
esac
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "drop policy \"place pages readable\" on place_pages; delete from schema_migrations where name like 'schema-version:%';"
result=$(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -tA -f database-check.sql)
echo "$result" | grep -q 'place pages readable' || { echo "database-check.sql missed a removed access rule"; exit 1; }
echo "$result" | grep -q 'Latest version of schema.sql' || { echo "database-check.sql missed an out-of-date schema"; exit 1; }
echo "schema.sql: applied twice and all checks passed"
