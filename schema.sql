-- Nomarchy schema. Safe to re-run: every object is created "if not exists"
-- (or replaced, for functions/triggers) so paste this into the Supabase SQL
-- editor whenever the app's data model changes.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users row, created automatically on signup.
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles are viewable by everyone" on profiles;
create policy "profiles are viewable by everyone"
  on profiles for select
  using (true);

drop policy if exists "users can update their own profile" on profiles;
create policy "users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- Username base: the local part of the email, lowercased and stripped down
-- to letters/digits/hyphen. On collision, append 4 random alnum characters
-- (steve -> steve-a4f2) rather than fail the signup.
create or replace function handle_new_user()
returns trigger as $$
declare
  base_username text;
  candidate text;
  suffix text;
begin
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9]+', '-', 'g'));
  base_username := trim(both '-' from base_username);
  if base_username = '' then
    base_username := 'user';
  end if;

  candidate := base_username;

  if exists (select 1 from profiles where username = candidate) then
    suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 4);
    candidate := base_username || '-' || suffix;
  end if;

  insert into profiles (id, username) values (new.id, candidate);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- cuisines: the categories a user's kingdom is organized into.
-- ---------------------------------------------------------------------------
create table if not exists cuisines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists cuisines_user_id_idx on cuisines (user_id);

alter table cuisines enable row level security;

drop policy if exists "users manage their own cuisines" on cuisines;
create policy "users manage their own cuisines"
  on cuisines for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- thrones: the current reigning restaurant for a cuisine. One per cuisine.
-- ---------------------------------------------------------------------------
create table if not exists thrones (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cuisine_id uuid not null unique references cuisines (id) on delete cascade,
  restaurant_name text not null,
  restaurant_place_id text,
  restaurant_address text,
  decree text not null check (char_length(decree) >= 30),
  crowned_at timestamptz not null default now()
);

create index if not exists thrones_user_id_idx on thrones (user_id);

alter table thrones enable row level security;

drop policy if exists "users manage their own thrones" on thrones;
create policy "users manage their own thrones"
  on thrones for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- throne_history: past reigns, archived automatically by the coup trigger.
-- Only fires on UPDATE (a coup dethroning a sitting restaurant). The first
-- crowning of a cuisine is a plain INSERT and has nothing to archive.
-- ---------------------------------------------------------------------------
create table if not exists throne_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cuisine_id uuid not null references cuisines (id) on delete cascade,
  restaurant_name text not null,
  restaurant_place_id text,
  restaurant_address text,
  decree text not null,
  reign_started_at timestamptz not null,
  reign_ended_at timestamptz not null default now()
);

create index if not exists throne_history_user_id_idx on throne_history (user_id);
create index if not exists throne_history_cuisine_id_idx on throne_history (cuisine_id);

alter table throne_history enable row level security;

drop policy if exists "users view their own throne history" on throne_history;
create policy "users view their own throne history"
  on throne_history for select
  using (auth.uid() = user_id);

-- Only the trigger below inserts into throne_history, running as the owning
-- user's own security context (not security definer), so it needs an
-- explicit insert policy too.
drop policy if exists "users archive their own reigns" on throne_history;
create policy "users archive their own reigns"
  on throne_history for insert
  with check (auth.uid() = user_id);

create or replace function archive_previous_reign()
returns trigger as $$
begin
  insert into throne_history (
    user_id, cuisine_id, restaurant_name, restaurant_place_id,
    restaurant_address, decree, reign_started_at, reign_ended_at
  ) values (
    old.user_id, old.cuisine_id, old.restaurant_name, old.restaurant_place_id,
    old.restaurant_address, old.decree, old.crowned_at, now()
  );
  return new;
end;
$$ language plpgsql;

drop trigger if exists on_throne_coup on thrones;
create trigger on_throne_coup
  after update on thrones
  for each row execute function archive_previous_reign();

-- ---------------------------------------------------------------------------
-- next_in_line: candidates waiting to be crowned for a cuisine.
-- ---------------------------------------------------------------------------
create table if not exists next_in_line (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cuisine_id uuid not null references cuisines (id) on delete cascade,
  restaurant_name text not null,
  restaurant_place_id text,
  restaurant_address text,
  note text,
  added_at timestamptz not null default now()
);

create index if not exists next_in_line_user_id_idx on next_in_line (user_id);
create index if not exists next_in_line_cuisine_id_idx on next_in_line (cuisine_id);

alter table next_in_line enable row level security;

drop policy if exists "users manage their own next in line" on next_in_line;
create policy "users manage their own next in line"
  on next_in_line for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- ai_calls: one row per call to /api/ai, used to enforce the per-user
-- hourly rate limit from the server route (which only holds the anon key,
-- so this table's own RLS policies are what keep the count honest).
-- ---------------------------------------------------------------------------
create table if not exists ai_calls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  called_at timestamptz not null default now()
);

create index if not exists ai_calls_user_id_called_at_idx on ai_calls (user_id, called_at);

alter table ai_calls enable row level security;

drop policy if exists "users log their own ai calls" on ai_calls;
create policy "users log their own ai calls"
  on ai_calls for insert
  with check (auth.uid() = user_id);

drop policy if exists "users read their own ai calls" on ai_calls;
create policy "users read their own ai calls"
  on ai_calls for select
  using (auth.uid() = user_id);
