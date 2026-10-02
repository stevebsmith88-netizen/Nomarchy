-- Stand-ins for the parts of Supabase that schema.sql relies on, so the
-- whole file can be run against a plain Postgres in CI.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text, created_at timestamptz default now());
create or replace function auth.uid() returns uuid language sql as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table if not exists storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid, created_at timestamptz default now());
create or replace function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;

-- Supabase's SQL Editor runs as a role that is NOT a superuser, so some
-- things a superuser could do are refused there. The tests run schema.sql
-- as this equivalent role so those refusals are caught here first.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_like') then
    create role supabase_like nosuperuser createrole;
  end if;
end $$;
grant create on database postgres to supabase_like;
grant all on schema public to supabase_like;
grant usage, create on schema auth, storage to supabase_like;
alter table auth.users owner to supabase_like;
alter table storage.buckets owner to supabase_like;
alter table storage.objects owner to supabase_like;
alter function auth.uid() owner to supabase_like;
alter function storage.foldername(text) owner to supabase_like;
grant anon, authenticated, service_role to supabase_like;
