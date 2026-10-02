-- Run after schema.sql has been applied twice. Each check raises an error
-- (failing the CI job) if something is wrong.
\set ON_ERROR_STOP on

-- A new signup halfway through the username step must stay "not onboarded"
-- even after the file is pasted again.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'new@example.com');

-- Best in the Land: a crown with no Google ID joins the matching Google place
-- ("Avenue" vs "Ave", city added), so two people = one line with two crowns.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b1', 'b1@example.com'), ('00000000-0000-0000-0000-0000000000b2', 'b2@example.com');
update profiles set is_public = true;
insert into thrones (user_id, cuisine_id, place_name, address, google_place_id, decree)
values
  ('00000000-0000-0000-0000-0000000000b1', (select id from cuisines where name = 'Pizza' and is_default), 'Pizzeria Libretto', '221 Ossington Ave', 'GID_LIB', 'a decree that is long enough to pass'),
  ('00000000-0000-0000-0000-0000000000b2', (select id from cuisines where name = 'Pizza' and is_default), 'Pizzeria Libretto', '221 Ossington Avenue, Toronto', null, 'a decree that is long enough to pass');

do $$
declare n int; c bigint;
begin
  select count(*) into n from schema_migrations where name in ('backfill_onboarded', 'backfill_last_rank_min');
  if n <> 2 then raise exception 'one-time backfills were not recorded'; end if;

  select count(*), max(crown_count) into n, c from best_in_land();
  if n <> 1 or c <> 2 then raise exception 'best_in_land grouped wrongly: % rows, max %', n, c; end if;

  if place_text_key('Lady Marmalade', '898 Queen Street East, Toronto, ON M4M 3B7', null)
     <> place_text_key('Lady Marmalade', '898 Queen St E', null) then
    raise exception 'place_text_key does not normalise addresses';
  end if;
end $$;

-- Error reports: repeats within an hour are counted on one row, and empty
-- reports are ignored.
select report_error('client', 'Boom', 'stack', '/', 'ua');
select report_error('client', 'Boom', 'stack', '/', 'ua');
select report_error('client', '   ', 'stack', '/', 'ua');
select report_error('weird', 'Server thing', null, '/api/x', 'server');
do $$
declare n int; occ int; src text;
begin
  select count(*) into n from app_errors;
  if n <> 2 then raise exception 'expected 2 error rows, got %', n; end if;
  select occurrences into occ from app_errors where message = 'Boom';
  if occ <> 2 then raise exception 'repeat errors were not counted together (%)', occ; end if;
  select source into src from app_errors where message = 'Server thing';
  if src <> 'client' then raise exception 'unknown source should be stored as client, got %', src; end if;
end $$;
