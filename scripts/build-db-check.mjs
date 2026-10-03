// Builds database-check.sql from schema.sql, and stamps schema.sql with a
// version so the check can tell whether this exact file has been run.
//
//   npm run db:check
//
// Run it after any change to schema.sql (the unit tests fail until you do).
// database-check.sql is what Steve pastes into the Supabase SQL Editor to
// see whether the live database is up to date - it changes nothing.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STAMP_RE = /\n-- -{60}\n-- VERSION STAMP[\s\S]*$/;

const q = (s) => `'${s.replace(/'/g, "''")}'`;

// The schema without its own stamp (and trailing blank lines), so the
// version is a hash of everything else.
export function schemaBody(schema) {
  return schema.replace(STAMP_RE, "").replace(/\s+$/, "");
}

export function schemaVersion(schema) {
  return createHash("sha256").update(schemaBody(schema)).digest("hex").slice(0, 12);
}

export function stampedSchema(schema) {
  const version = schemaVersion(schema);
  return schemaBody(schema) + `

-- ------------------------------------------------------------
-- VERSION STAMP
-- Records that this exact version of the file ran all the way through, so
-- database-check.sql can tell whether the live database is up to date.
-- Written by \`npm run db:check\` (scripts/build-db-check.mjs) - don't edit.
-- ------------------------------------------------------------
insert into schema_migrations (name) values ('schema-version:${version}') on conflict (name) do nothing;
`;
}

function all(re, text) {
  return [...text.matchAll(re)];
}

function unique(list, key) {
  const seen = new Set();
  return list.filter((x) => (seen.has(key(x)) ? false : seen.add(key(x))));
}

// Every object schema.sql creates, as [label, SQL that's true when it exists].
export function checksFor(schema) {
  const body = schemaBody(schema);
  const checks = [];
  const exists = (sql) => `exists (${sql})`;

  for (const [, t] of unique(all(/create table if not exists (\w+)\s*\(/g, body), (m) => m[1])) {
    checks.push([`Table: ${t}`, `to_regclass(${q(`public.${t}`)}) is not null`]);
  }
  for (const [, v] of unique(all(/create or replace view (\w+)/g, body), (m) => m[1])) {
    checks.push([`View: ${v}`, `to_regclass(${q(`public.${v}`)}) is not null`]);
  }
  for (const [, t, c] of unique(all(/alter table (\w+) add column if not exists (\w+)/g, body), (m) => `${m[1]}.${m[2]}`)) {
    checks.push([`Column: ${t}.${c}`, exists(`select 1 from information_schema.columns where table_schema = 'public' and table_name = ${q(t)} and column_name = ${q(c)}`)]);
  }
  for (const [, t, c] of unique(all(/alter table (\w+) drop column if exists (\w+)/g, body), (m) => `${m[1]}.${m[2]}`)) {
    checks.push([`Old column removed: ${t}.${c}`, `not ${exists(`select 1 from information_schema.columns where table_schema = 'public' and table_name = ${q(t)} and column_name = ${q(c)}`)}`]);
  }
  for (const [, f] of unique(all(/create (?:or replace )?function (\w+)\s*\(/g, body), (m) => m[1])) {
    checks.push([`Function: ${f}`, exists(`select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = ${q(f)}`)]);
  }
  for (const [, tg] of unique(all(/create trigger (\w+)/g, body), (m) => m[1])) {
    checks.push([`Trigger: ${tg}`, exists(`select 1 from pg_trigger where tgname = ${q(tg)} and not tgisinternal`)]);
  }
  for (const [, ix] of unique(all(/create (?:unique )?index if not exists (\w+)/g, body), (m) => m[1])) {
    checks.push([`Index: ${ix}`, `to_regclass(${q(`public.${ix}`)}) is not null`]);
  }
  const policyKey = (name, table) => `${table}|${name}`;
  const created = new Set();
  for (const [, name, table] of unique(all(/create policy "([^"]+)" on ([\w.]+)/g, body), (m) => policyKey(m[1], m[2]))) {
    created.add(policyKey(name, table));
    const [schemaName, tableName] = table.includes(".") ? table.split(".") : ["public", table];
    checks.push([`Access rule: "${name}" on ${table}`, exists(`select 1 from pg_policies where schemaname = ${q(schemaName)} and tablename = ${q(tableName)} and policyname = ${q(name)}`)]);
  }
  for (const [, name, table] of unique(all(/drop policy if exists "([^"]+)" on ([\w.]+)/g, body), (m) => policyKey(m[1], m[2]))) {
    if (created.has(policyKey(name, table))) continue;
    const [schemaName, tableName] = table.includes(".") ? table.split(".") : ["public", table];
    checks.push([`Old access rule removed: "${name}" on ${table}`, `not ${exists(`select 1 from pg_policies where schemaname = ${q(schemaName)} and tablename = ${q(tableName)} and policyname = ${q(name)}`)}`]);
  }

  // Privacy: signed-out visitors can read names, not personal settings.
  checks.push([
    "Privacy: profile settings are hidden from other people",
    `case when ${exists(`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'a11y_prefs'`)} then not has_column_privilege('anon', 'public.profiles', 'a11y_prefs', 'SELECT') else false end`,
  ]);
  // Uploads: only ordinary photos up to 5 MB.
  checks.push([
    "Uploads: photo buckets limited to images up to 5 MB",
    `(select count(*) from storage.buckets where id in ('avatars', 'review-photos') and file_size_limit = 5242880) = 2`,
  ]);
  return checks;
}

export function buildCheckSql(schema) {
  const version = schemaVersion(schema);
  const rows = checksFor(schema).map(([label, sql]) => `    (${q(label)}, ${sql})`);
  return `-- ============================================================
-- NOMARCHY: database check
-- Paste this whole file into the Supabase SQL Editor and press Run. It only
-- reads - it changes nothing. You'll get either one "All good" line, or a
-- list of what's missing. If anything is missing, paste and run the full
-- schema.sql (it's always safe to re-run), then run this check again.
--
-- Generated from schema.sql by \`npm run db:check\` - don't edit by hand.
-- ============================================================
with checks(item, ok) as (
  values
    (${q("Latest version of schema.sql has been run (" + version + ")")}, exists (select 1 from schema_migrations where name = ${q("schema-version:" + version)})),
${rows.join(",\n")}
)
select 'Missing or out of date: ' || item as result from checks where not ok
union all
select 'All good - your database matches the latest schema.sql (' || (select count(*) from checks) || ' checks passed)'
where not exists (select 1 from checks where not ok);
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = new URL("..", import.meta.url);
  const schemaPath = new URL("schema.sql", root);
  const stamped = stampedSchema(readFileSync(schemaPath, "utf8"));
  writeFileSync(schemaPath, stamped);
  writeFileSync(new URL("database-check.sql", root), buildCheckSql(stamped));
  console.log(`schema.sql stamped as ${schemaVersion(stamped)}; database-check.sql written (${checksFor(stamped).length + 1} checks).`);
}
