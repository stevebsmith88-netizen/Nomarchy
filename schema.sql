-- ============================================================
-- NOMARCHY: full database schema
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: everything uses IF NOT EXISTS or CREATE OR REPLACE.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. PROFILES
-- One row per user. Created automatically on signup by the trigger below.
-- ------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text unique not null,
  display_name text,
  city        text default 'Toronto',
  created_at  timestamptz default now()
);

-- Auto-create a profile whenever someone signs up.
-- Username is always the email prefix plus a random suffix, so it can never collide.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, username, display_name)
  values (
    new.id,
    lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9]+', '-', 'g'))
      || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 4),
    split_part(new.email, '@', 1)
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ------------------------------------------------------------
-- 2. CUISINES
-- Shared defaults plus user-created ones. Everyone can read every cuisine
-- (so the whole friend group converges on the same names for Court), but
-- you can only create your own.
-- ------------------------------------------------------------
create table if not exists cuisines (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  is_default boolean default false,
  created_by uuid references profiles(id) on delete cascade
);

-- A plain `unique (name, created_by)` column constraint does NOT stop
-- duplicate defaults on re-run: Postgres treats every NULL created_by as
-- distinct, so two "Pizza" rows with created_by = NULL never collide. This
-- partial + expression index closes that gap for both defaults and
-- per-user customs.
create unique index if not exists cuisines_unique_name_per_owner
  on cuisines (name, coalesce(created_by, '00000000-0000-0000-0000-000000000000'::uuid));

insert into cuisines (name, is_default)
select unnest(array[
  'Pizza','Thai','Sushi','Mexican','Italian','Indian','Chinese',
  'Burgers','Ramen','Caribbean','Breakfast','Coffee','Dessert','Shawarma'
]), true
on conflict (name, coalesce(created_by, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;

-- ------------------------------------------------------------
-- 3. THRONES
-- The heart of it. The unique constraint is what makes Nomarchy work:
-- the database physically cannot hold 2 pizza spots for one person.
-- ------------------------------------------------------------
create table if not exists thrones (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  cuisine_id      uuid not null references cuisines(id) on delete cascade,
  google_place_id text,
  place_name      text not null,
  address         text,
  neighbourhood   text,
  rating          numeric,
  maps_url        text,
  lat             numeric,
  lng             numeric,
  decree          text not null check (char_length(trim(decree)) >= 30),
  crowned_at      timestamptz default now(),
  unique (user_id, cuisine_id)
);

create index if not exists thrones_user_idx on thrones(user_id);

-- ------------------------------------------------------------
-- 4. FALLEN
-- Dethroned picks, kept forever with their original decrees.
-- ------------------------------------------------------------
create table if not exists fallen (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  cuisine_id    uuid not null references cuisines(id) on delete cascade,
  place_name    text not null,
  address       text,
  neighbourhood text,
  decree        text,
  crowned_at    timestamptz,
  dethroned_at  timestamptz default now()
);

create index if not exists fallen_user_idx on fallen(user_id);

-- The coup trigger: any time a throne row is replaced by a DIFFERENT
-- restaurant, the old monarch is copied into fallen automatically. Editing
-- the decree or rating for the SAME restaurant is not a coup and does not
-- archive anything.
create or replace function archive_dethroned()
returns trigger
language plpgsql
as $$
begin
  insert into fallen (user_id, cuisine_id, place_name, address, neighbourhood, decree, crowned_at)
  values (old.user_id, old.cuisine_id, old.place_name, old.address, old.neighbourhood, old.decree, old.crowned_at);
  return new;
end;
$$;

drop trigger if exists on_throne_replaced on thrones;
create trigger on_throne_replaced
  before update on thrones
  for each row
  when (old.place_name is distinct from new.place_name)
  execute function archive_dethroned();

-- ------------------------------------------------------------
-- 5. NEXT IN LINE (the want-to-visit shortlist)
-- ------------------------------------------------------------
create table if not exists next_in_line (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  cuisine_id      uuid references cuisines(id) on delete set null,
  google_place_id text,
  place_name      text not null,
  address         text,
  neighbourhood   text,
  rating          numeric,
  maps_url        text,
  note            text,
  added_at        timestamptz default now()
);

create index if not exists nil_user_idx on next_in_line(user_id);

-- ------------------------------------------------------------
-- 6. ENDORSEMENTS AND FOLLOWS
-- ------------------------------------------------------------
create table if not exists endorsements (
  endorser_id uuid not null references profiles(id) on delete cascade,
  throne_id   uuid not null references thrones(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (endorser_id, throne_id)
);

create table if not exists follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

-- ------------------------------------------------------------
-- 7. AI_CALLS
-- One row per call to /api/ai, used to enforce a per-user hourly rate
-- limit from the server route. The route only holds the anon key, so
-- this table's own RLS policies (below) are what keep the count honest -
-- an in-memory counter in the route would not survive a restart or be
-- shared across serverless instances.
-- ------------------------------------------------------------
create table if not exists ai_calls (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  called_at  timestamptz not null default now()
);

create index if not exists ai_calls_user_id_called_at_idx on ai_calls (user_id, called_at);

-- ------------------------------------------------------------
-- 8. ROW LEVEL SECURITY
-- Do NOT skip this. Without it every table is wide open and anyone
-- can overwrite anyone else's kingdom.
-- ------------------------------------------------------------
alter table profiles     enable row level security;
alter table cuisines     enable row level security;
alter table thrones      enable row level security;
alter table fallen       enable row level security;
alter table next_in_line enable row level security;
alter table endorsements enable row level security;
alter table follows      enable row level security;
alter table ai_calls     enable row level security;

-- Profiles: everyone can read, you can only edit your own
drop policy if exists "profiles readable" on profiles;
create policy "profiles readable" on profiles for select using (true);
drop policy if exists "own profile writable" on profiles;
create policy "own profile writable" on profiles for update using (auth.uid() = id);

-- Cuisines: everyone reads, signed-in users can add custom ones
drop policy if exists "cuisines readable" on cuisines;
create policy "cuisines readable" on cuisines for select using (true);
drop policy if exists "cuisines insertable" on cuisines;
create policy "cuisines insertable" on cuisines for insert with check (auth.uid() = created_by);

-- Thrones: public to read (that's the whole point), private to write
drop policy if exists "thrones readable" on thrones;
create policy "thrones readable" on thrones for select using (true);
drop policy if exists "own thrones writable" on thrones;
create policy "own thrones writable" on thrones for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Fallen: same as thrones
drop policy if exists "fallen readable" on fallen;
create policy "fallen readable" on fallen for select using (true);
drop policy if exists "own fallen writable" on fallen;
create policy "own fallen writable" on fallen for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Next in line: PRIVATE. Your shortlist is nobody else's business.
drop policy if exists "own list only" on next_in_line;
create policy "own list only" on next_in_line for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Endorsements: readable by all, and you can never endorse your own pick
drop policy if exists "endorsements readable" on endorsements;
create policy "endorsements readable" on endorsements for select using (true);
drop policy if exists "own endorsements writable" on endorsements;
create policy "own endorsements writable" on endorsements for all
  using (auth.uid() = endorser_id)
  with check (
    auth.uid() = endorser_id
    and not exists (select 1 from thrones t where t.id = throne_id and t.user_id = auth.uid())
  );

-- Follows
drop policy if exists "follows readable" on follows;
create policy "follows readable" on follows for select using (true);
drop policy if exists "own follows writable" on follows;
create policy "own follows writable" on follows for all
  using (auth.uid() = follower_id) with check (auth.uid() = follower_id);

-- AI calls: private, insert/read your own only
drop policy if exists "users log their own ai calls" on ai_calls;
create policy "users log their own ai calls" on ai_calls for insert
  with check (auth.uid() = user_id);
drop policy if exists "users read their own ai calls" on ai_calls;
create policy "users read their own ai calls" on ai_calls for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 9. CREDIBILITY SCORE
-- Computed on read so it can never drift out of sync with reality.
-- Endorsements received are weighted heaviest: trust from others beats volume.
-- ------------------------------------------------------------
create or replace view standings as
select
  p.id,
  p.username,
  p.display_name,
  (select count(*) from thrones t where t.user_id = p.id)                as thrones,
  (select count(*) from fallen f where f.user_id = p.id)                 as coups,
  (select coalesce(avg(char_length(t.decree)), 0) from thrones t where t.user_id = p.id) as avg_decree,
  (select count(*) from endorsements e
     join thrones t on t.id = e.throne_id where t.user_id = p.id)        as endorsements_received,
  round(
      (select count(*) from thrones t where t.user_id = p.id) * 12
    + (select count(*) from fallen f where f.user_id = p.id) * 8
    + least((select coalesce(avg(char_length(t.decree)), 0) from thrones t where t.user_id = p.id), 240) / 4
    + (select count(*) from endorsements e
         join thrones t on t.id = e.throne_id where t.user_id = p.id) * 5
  ) as score
from profiles p;
