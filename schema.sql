-- ============================================================
-- NOMARCHY: full database schema
-- Paste this whole file into the Supabase SQL Editor and run it once.
-- Safe to re-run: everything uses IF NOT EXISTS or CREATE OR REPLACE.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- One-time data fixes ("backfills") below are recorded here once they've
-- run, so pasting this whole file again never repeats them. Each is wrapped
-- in a DO block that checks for its name first.
create table if not exists schema_migrations (
  name   text primary key,
  ran_at timestamptz not null default now()
);
alter table schema_migrations enable row level security;

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
-- One-time: re-running this used to mark anyone halfway through the
-- username step as onboarded, so they'd skip it. Now it runs once only.
do $$
begin
  if not exists (select 1 from schema_migrations where name = 'backfill_onboarded') then
    update profiles set onboarded = true where onboarded = false;
    insert into schema_migrations (name) values ('backfill_onboarded');
  end if;
end $$;
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
-- The highest rank threshold (RANKS[].min in app/theme.js) this person has
-- already been shown the promotion celebration for - compared against
-- their live, computed score on each load so a crossing only ever
-- celebrates once. Defaults to 0 (Peckish Peasant, which everyone starts
-- at and never "gets promoted into"), so nobody sees a celebration for a
-- rank they were already sitting at before this shipped.
alter table profiles add column if not exists last_rank_min integer not null default 0;
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

-- "Vegan" already existed (added separately, not part of the original
-- seed array above) - the request was for a Vegan/Vegetarian pairing,
-- but "Vegan and Vegetarian" as a brand new row would have sat alongside
-- the existing "Vegan" as a near-duplicate, exactly the kind of overlap
-- already cleaned up once this session. Renamed rather than deleted for
-- the same reason as the four renames above - if anyone had already
-- crowned or shortlisted something under it in the few minutes before
-- this ran, a delete would have taken that with it.
update cuisines set name = 'Vegetarian' where name = 'Vegan and Vegetarian' and is_default = true;

-- Price/occasion tiers, orthogonal to cuisine - the point is giving a
-- genuinely great cheap or casual spot its own category to win, rather
-- than only ever competing head-to-head against fine dining within the
-- same cuisine bucket.
insert into cuisines (name, is_default)
select unnest(array['Cheap Eat', 'Special Occasion', 'Quick Bite']), true
on conflict (name, coalesce(created_by, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;

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

-- lower(...) on both sides, not a plain comparison: a same-restaurant
-- case change (like the CAPS LOCK sweep uppercasing every existing name)
-- must never look like a coup, or it wrongly archives every throne as if
-- it had just been dethroned.
drop trigger if exists on_throne_replaced on thrones;
create trigger on_throne_replaced
  before update on thrones
  for each row
  when (lower(old.place_name) is distinct from lower(new.place_name))
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

-- Groundwork for a "different city" filter - address/neighbourhood are
-- free text, too unreliable to parse a city back out of (the Lady
-- Marmalade address bug was exactly this class of problem). Populated
-- going forward from the city already typed into the "Look it up"
-- search box at crown/add time (see PlaceModal in app/page.js) - not
-- backfilled for existing rows, since nothing captured this before now
-- and guessing from profiles.city could easily be wrong for anyone who's
-- ever crowned somewhere while traveling.
alter table next_in_line add column if not exists city text;
alter table thrones add column if not exists city text;

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

-- Blocking is about the social graph, not app-wide public content -
-- Best in the Land and a public profile stay exactly as visible as they
-- were, since is_public is a broadcast setting, not a per-relationship
-- one. What a block actually does: removes any existing follow between
-- the two people (both directions - see the two follows policies below),
-- and stops a new one forming in either direction going forward.
create table if not exists blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

-- One row logged each time someone crosses a rank threshold (see the
-- promotion celebration's useEffect in app/page.js, which inserts here
-- right alongside persisting last_rank_min) - without this there's no way
-- to answer "who got promoted and when" for the notification feed, since
-- rank itself is just a live, computed value with no history of its own.
create table if not exists rank_promotions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  rank_min integer not null,
  rank_title text not null,
  promoted_at timestamptz not null default now()
);
create index if not exists rank_promotions_user_idx on rank_promotions(user_id, promoted_at);

-- The notification feed is computed fresh from live data on every load
-- (see loadNotifications in lib/data.js) rather than stored rows, which
-- is what makes a 30-day rolling history free to build - but it also
-- means "dismiss this" needs somewhere to persist, or a cleared item
-- would just reappear on the next load. item_key is a deterministic
-- string built from the notification's own fields (type/time/who/what),
-- not a foreign key to any one table, since the items here come from
-- five different tables with no single shared id to point at.
create table if not exists dismissed_notifications (
  user_id uuid not null references profiles(id) on delete cascade,
  item_key text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, item_key)
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
-- Adding a return column requires a drop first - unlike a view, CREATE OR
-- REPLACE FUNCTION refuses to change RETURNS TABLE's shape at all, append
-- or not.
drop function if exists match_restaurant(text);
create function match_restaurant(search_name text)
returns table (name text, address text, neighbourhood text, lat numeric, lng numeric, city text)
language sql
stable
as $$
  select r.name, r.address, r.neighbourhood, r.lat, r.lng, r.city
  from restaurants r
  where r.city = 'Toronto'
    and similarity(r.name, search_name) > 0.4
  order by similarity(r.name, search_name) desc
  limit 1;
$$;

-- "Did you mean?" suggestions for the place lookup - a looser threshold
-- than match_restaurant's 0.4 (which is tuned for "confidently the same
-- place", not "close enough to suggest"), and up to 3 candidates instead
-- of just the best one, so a typo'd name can still surface real matches
-- from the local Toronto dataset before ever falling through to an AI
-- web search. 0.3, not lower: a real typo (a letter swapped or dropped)
-- scores ~0.5+ against the correct name, but going much below 0.3 starts
-- matching on nothing but a shared short prefix (e.g. "Mizanara" typo'd
-- for "Mizunara" was scoring a coincidental 0.23 against the unrelated
-- "Miznon" chain, just from both starting "Miz") - genuinely misleading
-- rather than helpful, since at that point the honest answer is "not in
-- the local dataset" and it should fall through to the AI search instead
-- of confidently suggesting the wrong place.
create or replace function search_restaurants_fuzzy(search_name text)
returns table (name text, address text, neighbourhood text)
language sql
stable
as $$
  select r.name, r.address, r.neighbourhood
  from restaurants r
  where r.city = 'Toronto'
    and similarity(r.name, search_name) > 0.3
  order by similarity(r.name, search_name) desc
  limit 3;
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
alter table blocks       enable row level security;
alter table ai_calls     enable row level security;
alter table rank_promotions enable row level security;
alter table dismissed_notifications enable row level security;

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

-- Rank promotions: readable by yourself and anyone who follows you (so a
-- friend's promotion can show up in their followers' notification feed),
-- same "visible to anyone who follows you, not a vetted friends list"
-- caveat as next_in_line's visited picks above. Only ever insertable for
-- your own user_id, and never updatable/deletable - it's a log, not a
-- mutable record.
drop policy if exists "rank promotions readable" on rank_promotions;
create policy "rank promotions readable" on rank_promotions for select
  using (
    auth.uid() = user_id
    or exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = rank_promotions.user_id)
  );
drop policy if exists "own rank promotions insertable" on rank_promotions;
create policy "own rank promotions insertable" on rank_promotions for insert
  with check (auth.uid() = user_id);

-- Dismissed notifications: entirely private bookkeeping, never anyone
-- else's business.
drop policy if exists "own dismissed notifications" on dismissed_notifications;
create policy "own dismissed notifications" on dismissed_notifications for all
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
-- The permissive policy above only ever lets you touch a row where
-- YOU'RE the follower - it can't remove someone else's follow of you,
-- which is exactly what blocking someone who already follows you needs.
-- A second permissive delete policy (Postgres OR's them together) adds
-- that one specific extra case without loosening anything else.
drop policy if exists "remove an incoming follow you've blocked" on follows;
create policy "remove an incoming follow you've blocked" on follows for delete
  using (
    auth.uid() = followee_id
    and exists (select 1 from blocks b where b.blocker_id = auth.uid() and b.blocked_id = follows.follower_id)
  );
-- Restrictive: combined with AND against the permissive insert policy
-- above, so a follow can never be created in either direction while a
-- block exists between the two people - enforced here, not just in app
-- code, so it can't be bypassed by calling the API directly.
drop policy if exists "no follows across a block" on follows;
create policy "no follows across a block" on follows as restrictive for insert
  with check (
    not exists (
      select 1 from blocks b
      where (b.blocker_id = follows.follower_id and b.blocked_id = follows.followee_id)
         or (b.blocker_id = follows.followee_id and b.blocked_id = follows.follower_id)
    )
  );

-- Blocks: you can see and manage only your own block list. Deliberately
-- not readable by the blocked person - "who's blocked you" isn't
-- information they need, same reasoning most platforms use.
drop policy if exists "own blocks readable" on blocks;
create policy "own blocks readable" on blocks for select
  using (auth.uid() = blocker_id);
drop policy if exists "own blocks writable" on blocks;
create policy "own blocks writable" on blocks for all
  using (auth.uid() = blocker_id) with check (auth.uid() = blocker_id);

-- AI calls: private, insert/read your own only
drop policy if exists "users log their own ai calls" on ai_calls;
create policy "users log their own ai calls" on ai_calls for insert
  with check (auth.uid() = user_id);
drop policy if exists "users read their own ai calls" on ai_calls;
create policy "users read their own ai calls" on ai_calls for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 8b. CONQUESTS (one-time achievements)
-- Checked live against data already on hand (thrones, fallen, follows,
-- endorsements) rather than fired by a trigger the instant something
-- happens - "have you ever held two different cuisines" is answerable
-- at any time, not an event that needs catching in the moment. Recorded
-- once true so it stays won even if the underlying fact later changes
-- (e.g. un-crowning something after "First Blood" was already earned).
-- The points value is written by the app at insert time (see
-- loadConquestProgress in lib/data.js) rather than looked up here, so
-- rebalancing a conquest's weight never needs a migration.
-- ------------------------------------------------------------
create table if not exists conquests (
  user_id      uuid not null references profiles(id) on delete cascade,
  key          text not null,
  points       integer not null default 0,
  completed_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table conquests enable row level security;

drop policy if exists "conquests readable" on conquests;
create policy "conquests readable" on conquests for select
  using (
    auth.uid() = user_id
    or exists (select 1 from profiles p where p.id = conquests.user_id and p.is_public)
  );

drop policy if exists "own conquests writable" on conquests;
create policy "own conquests writable" on conquests for insert
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 9. CREDIBILITY SCORE
-- Computed on read so it can never drift out of sync with reality.
-- Endorsements received are weighted heaviest: trust from others beats volume.
--
-- Photos are a flat per-throne bonus for bothering to document the visit
-- at all, not per-photo - cardinality > 0 rather than counting each of
-- the (max 3) photos, so this rewards the habit rather than volume, and
-- is capped in aggregate so it can only ever be a modest boost, never a
-- second decree-length-sized axis to grind.
--
-- security_invoker matters here: without it, a view created from the SQL
-- Editor runs as the postgres role, which bypasses row-level security
-- entirely - so a private profile's real thrones/coups counts would leak
-- into everyone's score regardless of the is_public policies above. With
-- it, the view's subqueries obey RLS for whoever is actually asking.
-- ------------------------------------------------------------
-- Column order matters here in a way it normally wouldn't: CREATE OR
-- REPLACE VIEW can only append new columns at the end of the list, never
-- insert them in the middle (Postgres error 42P16) - so thrones_with_photos
-- and conquest_points go after score, not grouped with their fellow
-- subqueries above it, even though that reads slightly out of order.
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
    + least((select count(*) from thrones t where t.user_id = p.id and cardinality(t.photos) > 0) * 3, 30)
    + least((select coalesce(sum(c.points), 0) from conquests c where c.user_id = p.id), 60)
  ) as score,
  (select count(*) from thrones t where t.user_id = p.id and cardinality(t.photos) > 0) as thrones_with_photos,
  (select coalesce(sum(c.points), 0) from conquests c where c.user_id = p.id) as conquest_points
from profiles p;

-- One-time backfill for existing scores at the moment last_rank_min was
-- added (see its own comment above, in section 1) - without this,
-- everyone already past Peckish Peasant would see a promotion
-- celebration for a rank they've held for a while, which would read as
-- stale rather than exciting. RANKS[].min values are hand-mirrored here
-- since the real ladder lives in app/theme.js, not the database - keep
-- these two in sync if the ladder's thresholds ever change. Only touches
-- rows still at the default 0, so it's a genuine one-time catch-up, not
-- something that re-runs on every script paste; the trade-off is that
-- anyone who crosses a threshold and then has this full script re-run
-- before they next open the app misses that one celebration - a minor,
-- cosmetic edge case worth accepting over a dedicated migrations table.
do $$
begin
  if not exists (select 1 from schema_migrations where name = 'backfill_last_rank_min') then
    update profiles p
    set last_rank_min = coalesce((
      select max(t.min) from (values (0),(30),(70),(120),(180),(270),(400),(580),(820)) as t(min)
      where t.min <= coalesce((select s.score from standings s where s.id = p.id), 0)
    ), 0)
    where p.last_rank_min = 0;
    insert into schema_migrations (name) values ('backfill_last_rank_min');
  end if;
end $$;

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

-- A policy's check can't safely query its OWN table directly - Postgres
-- has to apply next_in_line's row security to evaluate that subquery too,
-- which means re-running this very policy, which recurses forever
-- ("infinite recursion detected in policy for relation next_in_line").
-- A security definer function breaks the loop: it runs with the
-- function owner's privileges rather than the caller's row security, so
-- its internal count query never re-triggers this policy.
create or replace function next_in_line_recent_count(uid uuid)
returns bigint
language sql
stable
security definer set search_path = public
as $$
  select count(*) from next_in_line where user_id = uid and added_at > now() - interval '1 hour';
$$;

drop policy if exists "next in line insert rate limit" on next_in_line;
create policy "next in line insert rate limit" on next_in_line as restrictive for insert
  with check (next_in_line_recent_count(auth.uid()) < 50);

-- Separate from the existing 3-photos-per-pick cap - this limits how many
-- NEW photos get uploaded across all picks combined in an hour, so someone
-- can't run up storage by spreading uploads across many different picks.
-- Restrictive policies apply table-wide, so this only engages for the
-- review-photos bucket specifically - the "bucket_id <> ..." branch leaves
-- every other bucket (avatars) untouched.
-- Same self-referencing-policy trap as next_in_line above, just against
-- storage.objects instead - wrapped in a security definer function for
-- the same reason (breaks the recursive RLS re-check).
create or replace function review_photos_recent_count(uid uuid)
returns bigint
language sql
stable
security definer set search_path = public
as $$
  select count(*) from storage.objects
  where bucket_id = 'review-photos'
    and (storage.foldername(name))[1] = uid::text
    and created_at > now() - interval '1 hour';
$$;

drop policy if exists "review photos insert rate limit" on storage.objects;
create policy "review photos insert rate limit" on storage.objects as restrictive for insert
  with check (
    bucket_id <> 'review-photos'
    or review_photos_recent_count(auth.uid()) < 30
  );

-- ------------------------------------------------------------
-- 11. RESTAURANT PAGE VISIT COUNT
-- next_in_line's own RLS only ever lets a viewer see their own rows plus
-- rows from people THEY follow (see "followers see visited picks" above) -
-- so a plain query from a restaurant's page would only ever show a
-- fraction of everyone who's actually been, not a real app-wide number.
-- A security definer function returns just a COUNT, nothing else - no
-- individual rows, no names, no notes - so it can safely bypass that
-- narrower visibility for this one number without changing who can see
-- an actual review anywhere else in the app. Deliberately a simpler,
-- case-insensitive exact match rather than reusing placeKey's full
-- normalization (postal codes, punctuation, etc.) - reasonable for a
-- supplementary "how many have been" stat, not the crown count itself.
-- Counts by Google place ID when one is given (exact), and otherwise - or
-- for saved entries that have no ID - by name and address as before. Two
-- different Google IDs are never counted as the same place. p_place_id
-- defaults to null so an older caller passing three values still works.
-- The old three-value version has to be dropped first: leaving both would
-- make a three-value call ambiguous.
drop function if exists restaurant_visit_count(text, text, text);
create or replace function restaurant_visit_count(p_name text, p_address text, p_area text, p_place_id text default null)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::integer
  from next_in_line n
  where n.visited_at is not null
    and (
      (p_place_id is not null and n.google_place_id = p_place_id)
      or (
        (p_place_id is null or n.google_place_id is null)
        and lower(trim(n.place_name)) = lower(trim(p_name))
        and (
          (p_address is not null and n.address is not null and lower(trim(n.address)) = lower(trim(p_address)))
          or (p_area is not null and n.neighbourhood is not null and lower(trim(n.neighbourhood)) = lower(trim(p_area)))
          or (p_address is null and p_area is null)
        )
      )
    );
$$;

-- Same idea, other half of next_in_line: people who've added this place
-- but haven't marked it visited yet - "X want to try this", a third stat
-- alongside crowns and "been, not crowned" so a restaurant page isn't
-- stuck at just two thin numbers.
drop function if exists restaurant_wanting_count(text, text, text);
create or replace function restaurant_wanting_count(p_name text, p_address text, p_area text, p_place_id text default null)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select count(*)::integer
  from next_in_line n
  where n.visited_at is null
    and (
      (p_place_id is not null and n.google_place_id = p_place_id)
      or (
        (p_place_id is null or n.google_place_id is null)
        and lower(trim(n.place_name)) = lower(trim(p_name))
        and (
          (p_address is not null and n.address is not null and lower(trim(n.address)) = lower(trim(p_address)))
          or (p_area is not null and n.neighbourhood is not null and lower(trim(n.neighbourhood)) = lower(trim(p_area)))
          or (p_address is null and p_area is null)
        )
      )
    );
$$;

-- ------------------------------------------------------------
-- SIGNUP SOURCES (where each new signup came from)
-- A separate table rather than a column on profiles: every profile is
-- readable by any signed-in user (see "profiles readable" above), so a
-- source tag stored there would be visible to everyone. Here only the
-- owner can read it, and nobody can write to it directly - the only way
-- a row gets in is record_signup_source() below, which enforces the
-- rules itself rather than trusting whatever the browser sends.
--
-- One row per person, ever (user_id is the primary key and the insert is
-- "do nothing" on conflict), so a source can never be overwritten.
-- People who signed up before this existed simply have no row, which the
-- Admin tab shows as "unknown".
-- ------------------------------------------------------------
create table if not exists signup_sources (
  user_id    uuid primary key references profiles(id) on delete cascade,
  source     text not null check (source ~ '^[a-z0-9_]{1,32}$'),
  created_at timestamptz not null default now()
);

alter table signup_sources enable row level security;

drop policy if exists "owner reads signup sources" on signup_sources;
create policy "owner reads signup sources" on signup_sources for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner));

-- Called by the app right after someone signs in. Quietly does nothing
-- (never raises) unless ALL of these hold, so a bad or stale value can
-- never block a sign-in:
--   - the caller is signed in
--   - the value is 1-32 letters, numbers or underscores (lowercased)
--   - the account was created within the last hour, so an existing user
--     who later clicks a tagged link can't be retroactively attributed
--   - they don't already have a source saved
create or replace function record_signup_source(p_ref text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  clean text := lower(coalesce(p_ref, ''));
  account_created timestamptz;
begin
  if auth.uid() is null then return; end if;
  if clean !~ '^[a-z0-9_]{1,32}$' then return; end if;

  select u.created_at into account_created from auth.users u where u.id = auth.uid();
  if account_created is null or account_created < now() - interval '1 hour' then return; end if;

  insert into signup_sources (user_id, source)
  values (auth.uid(), clean)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function record_signup_source(text) from public;
grant execute on function record_signup_source(text) to authenticated;

-- ------------------------------------------------------------
-- GOOGLE USAGE (a count of our own calls to Google)
-- One row per request our server sends to Google, so the Admin tab can
-- show usage before a bill does. Only the server writes here (with the
-- service role - there is deliberately no insert policy), and only the
-- owner can read it, through google_usage_summary() below. Google's own
-- billing page remains the source of truth for what you're charged.
-- kind is free text so new kinds (coordinate refreshes, map loads) can be
-- added later without a schema change.
-- ------------------------------------------------------------
create table if not exists google_api_calls (
  id         bigint generated always as identity primary key,
  kind       text not null,
  user_id    uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists google_api_calls_kind_created_idx on google_api_calls (kind, created_at);

alter table google_api_calls enable row level security;

-- Owner-only totals per kind: today, this month, all time (UTC days and
-- months - Google bills on Pacific time, so month edges can differ by a
-- few hours). Returns nothing at all to anyone who isn't the owner.
create or replace function google_usage_summary()
returns table (kind text, today bigint, this_month bigint, all_time bigint)
language sql
stable
security definer set search_path = public
as $$
  select
    c.kind,
    count(*) filter (where c.created_at >= date_trunc('day', now())),
    count(*) filter (where c.created_at >= date_trunc('month', now())),
    count(*)
  from google_api_calls c
  where exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner)
  group by c.kind
  order by c.kind;
$$;

revoke all on function google_usage_summary() from public;
grant execute on function google_usage_summary() to authenticated;

-- ------------------------------------------------------------
-- COORDINATE REFRESH (keeping stored Google coordinates fresh)
-- Google's terms allow keeping a place's coordinates for only about 30
-- days, so a daily job (app/api/refresh-coords) re-confirms them. This
-- records when each saved place's coordinates were last confirmed.
-- Null means "not confirmed yet", which the job treats as due first.
-- ------------------------------------------------------------
alter table thrones add column if not exists coords_refreshed_at timestamptz;
alter table next_in_line add column if not exists coords_refreshed_at timestamptz;

-- Stamps the time automatically whenever coordinates are first saved or
-- change (a new crown, a new Next in Line entry), unless the caller set
-- the time itself (the refresh job does).
create or replace function stamp_coords_refreshed()
returns trigger
language plpgsql
as $$
begin
  if new.lat is null or new.lng is null then return new; end if;
  if tg_op = 'INSERT' then
    if new.coords_refreshed_at is null then new.coords_refreshed_at := now(); end if;
  elsif (new.lat is distinct from old.lat or new.lng is distinct from old.lng)
        and new.coords_refreshed_at is not distinct from old.coords_refreshed_at then
    new.coords_refreshed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_coords_thrones on thrones;
create trigger stamp_coords_thrones
  before insert or update on thrones
  for each row execute function stamp_coords_refreshed();

drop trigger if exists stamp_coords_nil on next_in_line;
create trigger stamp_coords_nil
  before insert or update on next_in_line
  for each row execute function stamp_coords_refreshed();

-- Places Google could no longer find when the job asked. Left exactly as
-- they are in people's kingdoms; listed here (owner-only) so the owner can
-- decide what to do. Only the server writes to it.
create table if not exists place_refresh_issues (
  google_place_id text primary key,
  place_name      text not null,
  noted_at        timestamptz not null default now()
);

alter table place_refresh_issues enable row level security;

drop policy if exists "owner reads place refresh issues" on place_refresh_issues;
create policy "owner reads place refresh issues" on place_refresh_issues for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner));

-- ------------------------------------------------------------
-- CLOSED PLACES (places the owner has confirmed are permanently closed)
-- Marked by hand from the Admin tab after the closure check - never
-- automatically, so a wrong status from Google can't label anyone's crown.
-- Keyed on the Google place ID, so every crown or list entry for that
-- place is covered, whoever saved it. Readable by anyone (a place ID and
-- the fact it closed aren't sensitive; the app needs it to grey things out
-- and hide pins); only the server, acting for the owner, writes to it.
-- ------------------------------------------------------------
create table if not exists closed_places (
  google_place_id text primary key,
  place_name      text not null,
  closed_at       timestamptz not null default now()
);

alter table closed_places enable row level security;

drop policy if exists "closed places readable" on closed_places;
create policy "closed places readable" on closed_places for select using (true);

-- ------------------------------------------------------------
-- FIRST-TIME TOUR
-- When someone finished or skipped the walkthrough, so it only starts by
-- itself once per account. Null means not yet. No backfill: the app only
-- auto-starts it for accounts created after it launched, so existing
-- people are never interrupted (they can replay it from Your Profile).
-- ------------------------------------------------------------
alter table profiles add column if not exists tour_seen_at timestamptz;

-- ------------------------------------------------------------
-- UPLOAD LIMITS (security hardening)
-- The browser already checks size and type, but anyone can call the
-- storage API directly, so the buckets themselves refuse anything that
-- isn't an ordinary photo up to 5 MB. Without this, someone could host
-- arbitrary files (HTML, scripts, large videos) in the public buckets.
-- ------------------------------------------------------------
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
where id in ('avatars', 'review-photos');

-- ------------------------------------------------------------
-- CUISINE ICONS (a picked emoji for a cuisine someone created)
-- Shown on that cuisine's map pins. Null means "use the default icon".
-- The creator may change the icon, and ONLY the icon: the trigger below
-- refuses any other change, so nobody can rename a cuisine under their
-- friends or turn their own into a shared default.
-- ------------------------------------------------------------
alter table cuisines add column if not exists emoji text;
alter table cuisines drop constraint if exists cuisines_emoji_length;
alter table cuisines add constraint cuisines_emoji_length check (emoji is null or char_length(emoji) <= 8);

drop policy if exists "cuisines icon updatable by creator" on cuisines;
create policy "cuisines icon updatable by creator" on cuisines for update
  using (auth.uid() = created_by) with check (auth.uid() = created_by);

create or replace function protect_cuisine_fields()
returns trigger
language plpgsql
as $$
begin
  if current_user <> 'postgres'
     and (new.name is distinct from old.name
          or new.is_default is distinct from old.is_default
          or new.created_by is distinct from old.created_by) then
    raise exception 'Only the icon of a cuisine can be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_cuisine_fields_trigger on cuisines;
create trigger protect_cuisine_fields_trigger
  before update on cuisines
  for each row execute function protect_cuisine_fields();

-- ------------------------------------------------------------
-- PERFORMANCE INDEXES
-- Lookups the app makes often that had no index, so each one read the
-- whole table. Invisible while small; these keep pages fast as it grows.
-- Safe to add at any time and to re-run.
-- ------------------------------------------------------------
-- "who follows me": follower counts, notifications, block clean-up
create index if not exists follows_followee_idx on follows (followee_id);
-- endorsement counts per crown, and the standings score
create index if not exists endorsements_throne_idx on endorsements (throne_id);
-- the "no follows across a block" check looks both ways
create index if not exists blocks_blocked_idx on blocks (blocked_id);
-- restaurant pages, closures and the daily coordinate refresh match on Google IDs
create index if not exists thrones_google_place_idx on thrones (google_place_id) where google_place_id is not null;
create index if not exists nil_google_place_idx on next_in_line (google_place_id) where google_place_id is not null;
-- someone's own custom cuisines
create index if not exists cuisines_created_by_idx on cuisines (created_by) where created_by is not null;
-- Best in the Land filters crowns by date
create index if not exists thrones_crowned_at_idx on thrones (crowned_at);

-- ------------------------------------------------------------
-- ACCESSIBILITY CHOICES (Your Profile > Accessibility)
-- Reduce motion, calmer celebrations, larger text, messages that stay -
-- saved on the account so they follow the person to any device. Empty
-- means "all defaults".
-- ------------------------------------------------------------
alter table profiles add column if not exists a11y_prefs jsonb not null default '{}';

-- ------------------------------------------------------------
-- BEST IN THE LAND (ranked in the database)
-- Used to download every crown in the app to each phone and rank them
-- there; this ranks them here and sends back only the top places.
-- Same rules as before (groupCrownedThrones in lib/data.js): one line per
-- real restaurant by Google ID, a crown with no ID joins the one Google
-- place with the same name and address, closed places are left out, and a
-- person counts once per place. Runs with the caller's own permissions, so
-- it only ever counts crowns that person can already see.
-- ------------------------------------------------------------

-- Same normalisation as placeKey() in lib/data.js: name, then the street
-- part of the address (postal code, punctuation and "Street"/"St" style
-- differences removed), falling back to the neighbourhood.
create or replace function place_street_key(p_text text)
returns text
language sql
immutable
as $$
  select coalesce(string_agg(coalesce(m.short, w.word), ' ' order by w.ord), '')
  from unnest(string_to_array(
         trim(regexp_replace(regexp_replace(regexp_replace(
           lower(split_part(coalesce(p_text, ''), ',', 1)),
           '[a-z][0-9][a-z]\s?[0-9][a-z][0-9]\s*$', ''),
           '[^a-z0-9_\s]', '', 'g'),
           '\s+', ' ', 'g')),
         ' ')) with ordinality as w(word, ord)
  left join (values ('street','st'),('avenue','ave'),('boulevard','blvd'),('drive','dr'),('road','rd'),
                    ('place','pl'),('lane','ln'),('court','ct'),('crescent','cres'),('terrace','terr'),
                    ('west','w'),('east','e'),('north','n'),('south','s')) as m(long, short)
    on m.long = w.word
  where w.word <> '';
$$;

create or replace function place_text_key(p_name text, p_address text, p_area text)
returns text
language sql
immutable
as $$
  select regexp_replace(regexp_replace(lower(trim(coalesce(p_name, ''))), '[\s\-–—:,.]+$', ''), '\s+', ' ', 'g')
    || '|' || coalesce(nullif(place_street_key(p_address), ''), place_street_key(p_area));
$$;

create or replace function best_in_land(
  p_since timestamptz default null,
  p_user_ids uuid[] default null,
  p_city text default null,
  p_search text default null,
  p_limit int default 25
)
returns table (name text, area text, address text, rating numeric, maps_url text, google_place_id text, crown_count bigint)
language sql
stable
as $$
  with crowns as (
    select t.user_id, t.place_name, t.address, t.neighbourhood, t.rating, t.maps_url, t.google_place_id, t.crowned_at,
           place_text_key(t.place_name, t.address, t.neighbourhood) as tkey
    from thrones t
    where (p_since is null or t.crowned_at >= p_since)
      and (p_user_ids is null or t.user_id = any(p_user_ids))
      and (t.google_place_id is null
           or not exists (select 1 from closed_places c where c.google_place_id = t.google_place_id))
  ),
  one_id_per_text as (
    select tkey, min(google_place_id) as only_id
    from crowns
    where google_place_id is not null
    group by tkey
    having count(distinct google_place_id) = 1
  ),
  keyed as (
    select c.*,
           case when c.google_place_id is not null then 'gid:' || c.google_place_id
                when o.only_id is not null then 'gid:' || o.only_id
                else 'text:' || c.tkey end as gkey
    from crowns c
    left join one_id_per_text o on c.google_place_id is null and o.tkey = c.tkey
  ),
  grouped as (
    select (array_agg(place_name order by crowned_at))[1] as name,
           (array_agg(neighbourhood order by crowned_at))[1] as area,
           (array_agg(address order by crowned_at))[1] as address,
           (array_agg(rating order by crowned_at))[1] as rating,
           (array_agg(maps_url order by crowned_at))[1] as maps_url,
           (array_agg(google_place_id order by crowned_at) filter (where google_place_id is not null))[1] as google_place_id,
           count(distinct user_id) as crown_count
    from keyed
    group by gkey
  )
  select g.name, g.area, g.address, g.rating, g.maps_url, g.google_place_id, g.crown_count
  from grouped g
  where (p_search is null or g.name ilike '%' || p_search || '%')
    and (p_city is null or g.area ilike '%' || p_city || '%' or g.address ilike '%' || p_city || '%')
  order by g.crown_count desc, lower(g.name)
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

-- ------------------------------------------------------------
-- ERROR REPORTS (built-in error monitoring)
-- When something breaks in someone's app (or on the server), a short
-- report lands here: what went wrong, on which page, and the browser type
-- - never who it was. Repeats of the same error within an hour are counted
-- on one row rather than filling the table. Only the owner can read or
-- clear them (Admin > Errors), a daily email flags new ones, and anything
-- older than 90 days is removed by that same daily job.
-- ------------------------------------------------------------
create table if not exists app_errors (
  id          bigint generated always as identity primary key,
  source      text not null default 'client' check (source in ('client', 'server')),
  message     text not null,
  stack       text,
  page        text,
  user_agent  text,
  occurrences integer not null default 1,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

create index if not exists app_errors_last_seen_idx on app_errors (last_seen);

alter table app_errors enable row level security;

drop policy if exists "owner reads errors" on app_errors;
create policy "owner reads errors" on app_errors for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner));
drop policy if exists "owner clears errors" on app_errors;
create policy "owner clears errors" on app_errors for delete
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_owner));

-- The only way a report gets in. Anyone's app can call it (an error can
-- happen before sign-in), so it trims every field and caps new reports at
-- 300 an hour across the whole app, so it can't be used to flood the table.
create or replace function report_error(p_source text, p_message text, p_stack text, p_page text, p_user_agent text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  msg text := left(trim(coalesce(p_message, '')), 500);
  pg text := left(coalesce(p_page, ''), 200);
  existing bigint;
begin
  if msg = '' then return; end if;
  select id into existing from app_errors
    where message = msg and coalesce(page, '') = pg and last_seen > now() - interval '1 hour'
    order by last_seen desc limit 1;
  if existing is not null then
    update app_errors set occurrences = occurrences + 1, last_seen = now() where id = existing;
    return;
  end if;
  if (select count(*) from app_errors where created_at > now() - interval '1 hour') >= 300 then return; end if;
  insert into app_errors (source, message, stack, page, user_agent)
  values (case when p_source = 'server' then 'server' else 'client' end, msg, left(p_stack, 4000), nullif(pg, ''), left(p_user_agent, 300));
end;
$$;

grant execute on function report_error(text, text, text, text, text) to anon, authenticated;
