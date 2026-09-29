-- ============================================================
-- NOMARCHY: full database schema
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: everything uses IF NOT EXISTS or CREATE OR REPLACE.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ------------------------------------------------------------
-- 1. PROFILES
-- One row per user. Created automatically on signup by the trigger below.
-- ------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users on delete cascade,
  username    text unique not null,
  display_name text,
  city        text default 'Toronto',
  created_at  timestamptz default now(),
  is_owner    boolean not null default false,
  is_public   boolean not null default true,
  notifications_seen_at timestamptz not null default now()
);

-- Re-running this file against a database from before these columns existed
-- needs this - `create table if not exists` above is a no-op once the
-- table is already there, so it never adds new columns on its own.
-- Defaulting is_public to true keeps existing users' pages working exactly
-- as before until they choose to go private.
alter table profiles add column if not exists is_owner boolean not null default false;
alter table profiles add column if not exists is_public boolean not null default true;
alter table profiles add column if not exists avatar_url text;
-- Whether someone's been through the one-time "pick a username" welcome
-- step - defaults false so it only ever shows for brand-new signups, not
-- retroactively for existing accounts, which is why the very next line
-- immediately backfills every row that already existed to true. New
-- signups still get the column default (false) since handle_new_user()
-- doesn't set it explicitly.
alter table profiles add column if not exists onboarded boolean not null default false;
update profiles set onboarded = true where onboarded = false;
-- Separate from is_public: is_public controls whether your kingdom link
-- and Court visibility work at all; discoverable controls whether you
-- show up in the "Find people" directory for anyone to browse. Off by
-- default - being findable by strangers is an opt-in, "public figure"
-- choice, not the default for a private beta of friends.
alter table profiles add column if not exists discoverable boolean not null default false;
-- The automated monthly content digest was tried and removed in favor of
-- Steve sending updates manually - this line undoes its opt-out column
-- for anyone who already ran the version of this file that added it.
-- Harmless no-op if you never ran that version.
alter table profiles drop column if exists digest_opt_out;
-- A random, unguessable value (distinct from the profile's own id) is
-- what an unsubscribe link carries - so clicking it needs no sign-in,
-- and it can't be used to do anything but turn one email off. Shared by
-- any future one-click-unsubscribe email, not tied to one feature.
alter table profiles add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_unsubscribe_token_idx on profiles(unsubscribe_token);
-- On by default (see digest_opt_out's comment history above for why that
-- pattern was reconsidered - this one's a per-person lifecycle nudge,
-- not a broadcast, so it stays) - a monthly check emails anyone quiet for
-- 30+ days (no sign-in, or nothing new crowned/added) to bring them back.
alter table profiles add column if not exists reminders_opt_out boolean not null default false;
-- Defaults to now() so existing follows/crowns from before this feature
-- shipped don't all flood in as a backlog of "new" notifications.
alter table profiles add column if not exists notifications_seen_at timestamptz not null default now();
-- Per-type opt-outs for the in-app notification bell (separate from the
-- reminders_opt_out email above) - default true so nobody's notifications
-- go quiet just because this shipped after they signed up.
alter table profiles add column if not exists notify_follows boolean not null default true;
alter table profiles add column if not exists notify_crowns boolean not null default true;
alter table profiles add column if not exists notify_reviews boolean not null default true;
alter table profiles add column if not exists notify_endorsements boolean not null default true;
-- Cuisines the user has chosen to hide from their Kingdom grid (empty
-- thrones only - a cuisine currently holding a crowned favourite is never
-- actually hidden, since a throne with a real pick in it isn't clutter).
-- Just an id list on the profile row, not a join table - simplest thing
-- that works for a per-user preference this small.
alter table profiles add column if not exists hidden_cuisine_ids uuid[] not null default '{}';

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

-- The "Founder" badge flag. RLS's "own profile writable" policy below only
-- restricts which ROW you can touch, not which columns - without this, any
-- signed-in user could set their own is_owner to true via a raw API call.
-- The Supabase SQL Editor runs as the `postgres` role, so this only blocks
-- the app's own update path, not you setting it by hand.
create or replace function protect_is_owner()
returns trigger
language plpgsql
as $$
begin
  if new.is_owner is distinct from old.is_owner and current_user <> 'postgres' then
    new.is_owner := old.is_owner;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_is_owner_trigger on profiles;
create trigger protect_is_owner_trigger
  before update on profiles
  for each row execute function protect_is_owner();

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
  'Breakfast and Brunch','Burgers','Pizza','Coffee','Sushi','Italian','Chinese','Indian',
  'Shawarma and Middle Eastern','Thai','Japanese and Ramen','Mexican','Caribbean','Greek',
  'Korean','Vietnamese','Steak','Dessert and Bakery','Persian','Portuguese','Filipino',
  'Sri Lankan','Ethiopian','Jewish Deli','Polish and Eastern European'
]), true
on conflict (name, coalesce(created_by, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;

-- Renaming rather than delete+recreate: these four replace earlier default
-- names ('Breakfast', 'Shawarma', 'Ramen', 'Dessert'). A rename keeps the
-- same cuisine_id, so anyone who already crowned a throne or has a
-- next_in_line item under the old name keeps it intact under the new one -
-- deleting the old row instead would cascade-delete their data. A no-op
-- once already renamed, safe to re-run.
update cuisines set name = 'Breakfast and Brunch' where name = 'Breakfast' and is_default = true;
update cuisines set name = 'Shawarma and Middle Eastern' where name = 'Shawarma' and is_default = true;
update cuisines set name = 'Japanese and Ramen' where name = 'Ramen' and is_default = true;
update cuisines set name = 'Dessert and Bakery' where name = 'Dessert' and is_default = true;

-- A reserved, shared cuisine every user gets exactly one throne on (via the
-- normal unique(user_id, cuisine_id) constraint below) - the app treats it
-- as "Overall Favourite" rather than a real cuisine, and hides it from the
-- ordinary cuisine picker/grid.
insert into cuisines (name, is_default)
values ('Overall Favourite', true)
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
  added_at        timestamptz default now(),
  visited_at      timestamptz
);

-- Re-running this file against a database from before visited_at existed
-- needs this - `create table if not exists` above is a no-op once the
-- table is already there, so it never adds new columns on its own.
alter table next_in_line add column if not exists visited_at timestamptz;
-- For the "next in line" map view (want-to-go pins alongside crowned
-- ones) - populated going forward on add, and backfilled for existing
-- rows by app/api/next-in-line/backfill-coords, same pattern as thrones.
alter table next_in_line add column if not exists lat numeric;
alter table next_in_line add column if not exists lng numeric;
-- A quick, deliberately non-negative sentiment on a review - keeps this a
-- "did this work for you" signal rather than a place to rate/roast a
-- restaurant. Null means no opinion given.
alter table next_in_line add column if not exists verdict text
  check (verdict in ('worth_it', 'not_for_me'));

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
-- 7b. PLACE_LOOKUP_CACHE
-- The first person to search for a restaurant triggers the real (slow)
-- AI web search; the result is cached here by a normalized query+city key
-- so every search after that - by anyone - is instant. Not user-specific
-- data, so it's shared and writable by any signed-in user.
-- ------------------------------------------------------------
create table if not exists place_lookup_cache (
  query_key  text primary key,
  results    jsonb not null,
  created_at timestamptz not null default now()
);

alter table place_lookup_cache enable row level security;

drop policy if exists "lookup cache readable" on place_lookup_cache;
create policy "lookup cache readable" on place_lookup_cache for select using (true);
drop policy if exists "signed-in users populate the cache" on place_lookup_cache;
create policy "signed-in users populate the cache" on place_lookup_cache for insert
  with check (auth.uid() is not null);
drop policy if exists "signed-in users refresh the cache" on place_lookup_cache;
create policy "signed-in users refresh the cache" on place_lookup_cache for update
  using (auth.uid() is not null) with check (auth.uid() is not null);

-- ------------------------------------------------------------
-- 7bb. RESTAURANTS (pre-loaded local reference data)
-- A fast, local first stop for "Look it up" in the crown/add-a-place
-- flow, populated from the City of Toronto's open DineSafe dataset (see
-- app/api/restaurants/import) instead of hitting Claude's slow web
-- search for every single restaurant someone might type. No rating -
-- DineSafe is health-inspection data, not reviews - and only Toronto for
-- now; anywhere else still falls back to the AI search exactly as before.
-- ------------------------------------------------------------
create table if not exists restaurants (
  id            uuid primary key default gen_random_uuid(),
  source        text not null default 'dinesafe',
  source_id     text,
  name          text not null,
  address       text,
  neighbourhood text,
  city          text not null default 'Toronto',
  lat           numeric,
  lng           numeric,
  updated_at    timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists restaurants_name_trgm_idx on restaurants using gin (name gin_trgm_ops);
create index if not exists restaurants_city_idx on restaurants (city);

alter table restaurants enable row level security;
drop policy if exists "restaurants readable" on restaurants;
create policy "restaurants readable" on restaurants for select using (true);

-- Fuzzy name match against the local Toronto table, used both by the bulk
-- import flow (importToNextInLine in lib/data.js - fills in a real
-- address/coords at import time instead of leaving them blank) and the
-- next_in_line backfill route (for older rows that were imported before
-- this existed). Plain `language sql`, not `security definer` - it only
-- reads a table that's already readable by anyone, so it runs fine under
-- the caller's own normal permissions.
create or replace function match_restaurant(search_name text)
returns table (name text, address text, neighbourhood text, lat numeric, lng numeric)
language sql
stable
as $$
  select r.name, r.address, r.neighbourhood, r.lat, r.lng
  from restaurants r
  where r.city = 'Toronto'
    and similarity(r.name, search_name) > 0.4
  order by similarity(r.name, search_name) desc
  limit 1;
$$;

-- ------------------------------------------------------------
-- 7c. FEEDBACK
-- One shared channel for beta testers instead of scattered DMs/texts.
-- user_agent/page are captured automatically client-side so a report
-- already carries "what device/screen was this on" without asking.
-- ------------------------------------------------------------
create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete set null,
  message    text not null,
  user_agent text,
  page       text,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

-- Private by default: you can see your own submissions, and the owner
-- can see everyone's (to actually triage them) - nobody else's business.
drop policy if exists "feedback insert own" on feedback;
create policy "feedback insert own" on feedback for insert
  with check (auth.uid() = user_id);
drop policy if exists "feedback read own or owner" on feedback;
create policy "feedback read own or owner" on feedback for select
  using (
    auth.uid() = user_id
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner)
  );

-- ------------------------------------------------------------
-- 7d. REVIEW PHOTOS
-- Up to 3 photos per throne decree or next_in_line review, stored in
-- Supabase Storage (a public bucket - a photo of a restaurant isn't
-- sensitive, and public URLs mean the app never needs signed-URL logic
-- to display one) rather than an external image host.
-- ------------------------------------------------------------
alter table thrones add column if not exists photos text[] not null default '{}';
alter table thrones drop constraint if exists thrones_photos_limit;
alter table thrones add constraint thrones_photos_limit check (cardinality(photos) <= 3);

alter table next_in_line add column if not exists photos text[] not null default '{}';
alter table next_in_line drop constraint if exists nil_photos_limit;
alter table next_in_line add constraint nil_photos_limit check (cardinality(photos) <= 3);

insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', true)
on conflict (id) do nothing;

-- Uploads are keyed as "{user_id}/{filename}" - storage.foldername(name)
-- splits that path into segments, so segment 1 being the caller's own
-- id is what keeps one person from writing into another's folder.
drop policy if exists "review photos readable" on storage.objects;
create policy "review photos readable" on storage.objects for select
  using (bucket_id = 'review-photos');
drop policy if exists "review photos insertable by owner" on storage.objects;
create policy "review photos insertable by owner" on storage.objects for insert
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "review photos deletable by owner" on storage.objects;
create policy "review photos deletable by owner" on storage.objects for delete
  using (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Profile photos: same "{user_id}/filename" path convention, but a
-- re-upload overwrites the same path (one avatar per person), so this
-- bucket also needs an UPDATE policy, unlike review-photos above where
-- every upload gets a fresh filename and nothing is ever overwritten.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars readable" on storage.objects;
create policy "avatars readable" on storage.objects for select
  using (bucket_id = 'avatars');
drop policy if exists "avatars insertable by owner" on storage.objects;
create policy "avatars insertable by owner" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars updatable by owner" on storage.objects;
create policy "avatars updatable by owner" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "avatars deletable by owner" on storage.objects;
create policy "avatars deletable by owner" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

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

-- Thrones: readable by the owner, or by anyone if the profile is public.
-- NOT gated by "am I followed by them" - following here needs no approval
-- from the person being followed (anyone who knows a username can follow
-- it), so treating a follow as consent to share would let anyone unlock a
-- private profile just by following it. Going private means only you can
-- see your picks, including in a friend's Court, until you go public again.
-- Owner bypass added for the admin dashboard's content stats (most-crowned
-- places/cuisines across everyone) - same pattern as feedback's own-or-owner
-- policy below. Deliberately not extended to next_in_line, which stays
-- "nobody else's business" per its own comment - the owner didn't ask to
-- see everyone's private shortlists, just aggregate throne/decree stats.
drop policy if exists "thrones readable" on thrones;
create policy "thrones readable" on thrones for select
  using (
    auth.uid() = thrones.user_id
    or exists (select 1 from profiles p where p.id = thrones.user_id and p.is_public)
    or exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner)
  );
drop policy if exists "own thrones writable" on thrones;
create policy "own thrones writable" on thrones for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Fallen: same visibility rule as thrones
drop policy if exists "fallen readable" on fallen;
create policy "fallen readable" on fallen for select
  using (
    auth.uid() = fallen.user_id
    or exists (select 1 from profiles p where p.id = fallen.user_id and p.is_public)
  );
drop policy if exists "own fallen writable" on fallen;
create policy "own fallen writable" on fallen for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Next in line: PRIVATE. Your shortlist is nobody else's business.
drop policy if exists "own list only" on next_in_line;
create policy "own list only" on next_in_line for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- A visited (not necessarily crowned) place with a note is effectively a
-- review, and shown to followers - unvisited "want to go" items stay fully
-- private, seen only by the owner via the policy above. Following needs no
-- approval here, so this is "visible to anyone who follows you," not a
-- vetted friends list - worth being clear-eyed about that boundary.
drop policy if exists "followers see visited picks" on next_in_line;
create policy "followers see visited picks" on next_in_line for select
  using (
    visited_at is not null
    and exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = next_in_line.user_id)
  );

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
--
-- security_invoker matters here: without it, a view created from the SQL
-- Editor runs as the postgres role, which bypasses row-level security
-- entirely - so a private profile's real thrones/coups counts would leak
-- into everyone's score regardless of the is_public policies above. With
-- it, the view's subqueries obey RLS for whoever is actually asking.
-- ------------------------------------------------------------
create or replace view standings
with (security_invoker = true)
as
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

-- ------------------------------------------------------------
-- 10. ANTI-ABUSE WRITE-RATE LIMITS
-- These live as RESTRICTIVE RLS policies rather than app-level checks
-- deliberately: the browser talks to Supabase directly for these actions
-- (no server route in between to gate them, unlike the AI routes' own
-- hourly cap), so anything enforced only in app code could be bypassed by
-- calling the API directly. A RESTRICTIVE policy is combined with AND
-- against the existing permissive policy on the same table, so both must
-- pass - it narrows what's already allowed rather than replacing it.
--
-- Thrones themselves don't need a plain insert cap: the one-throne-per-
-- cuisine unique constraint already bounds a single user to (at most) the
-- number of cuisines that exist. The real unbounded vector is repeated
-- coups on the SAME cuisine - each one archives a row into `fallen`, so
-- that's what's actually rate-limited below. A generous limit (a real
-- person crowning/adding this much in an hour is implausible) that a
-- script or someone being deliberately disruptive would hit fast.
-- ------------------------------------------------------------
drop policy if exists "thrones coup rate limit" on thrones;
create policy "thrones coup rate limit" on thrones as restrictive for update
  with check (
    (select count(*) from fallen f where f.user_id = auth.uid() and f.dethroned_at > now() - interval '1 hour') < 50
  );

drop policy if exists "next in line insert rate limit" on next_in_line;
create policy "next in line insert rate limit" on next_in_line as restrictive for insert
  with check (
    (select count(*) from next_in_line n where n.user_id = auth.uid() and n.added_at > now() - interval '1 hour') < 50
  );

-- Separate from the existing 3-photos-per-pick cap - this limits how many
-- NEW photos get uploaded across all picks combined in an hour, so someone
-- can't run up storage by spreading uploads across many different picks.
-- Restrictive policies apply table-wide, so this only engages for the
-- review-photos bucket specifically - the "bucket_id <> ..." branch leaves
-- every other bucket (avatars) untouched.
drop policy if exists "review photos insert rate limit" on storage.objects;
create policy "review photos insert rate limit" on storage.objects as restrictive for insert
  with check (
    bucket_id <> 'review-photos'
    or (
      select count(*) from storage.objects o
      where o.bucket_id = 'review-photos'
        and (storage.foldername(o.name))[1] = auth.uid()::text
        and o.created_at > now() - interval '1 hour'
    ) < 30
  );
