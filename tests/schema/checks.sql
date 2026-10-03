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

-- Standings: the rewritten view must give exactly the old formula's numbers.
insert into endorsements (endorser_id, throne_id)
  select '00000000-0000-0000-0000-0000000000b2', id from thrones where user_id = '00000000-0000-0000-0000-0000000000b1';
update thrones set photos = array['x.jpg'] where user_id = '00000000-0000-0000-0000-0000000000b1';
insert into conquests (user_id, key, points) values ('00000000-0000-0000-0000-0000000000b1', 'first_blood', 5);
do $$
declare mismatch int;
begin
  select count(*) into mismatch
  from profiles p join standings s on s.id = p.id
  where s.score <> round(
      (select count(*) from thrones t where t.user_id = p.id) * 12
    + (select count(*) from fallen f where f.user_id = p.id) * 8
    + least((select coalesce(avg(char_length(t.decree)), 0) from thrones t where t.user_id = p.id), 240) / 4
    + (select count(*) from endorsements e join thrones t on t.id = e.throne_id where t.user_id = p.id) * 5
    + least((select count(*) from thrones t where t.user_id = p.id and cardinality(t.photos) > 0) * 3, 30)
    + least((select coalesce(sum(c.points), 0) from conquests c where c.user_id = p.id), 60));
  if mismatch > 0 then raise exception 'standings differs from the original formula for % people', mismatch; end if;
  if (select endorsements_received from standings where id = '00000000-0000-0000-0000-0000000000b1') <> 1 then
    raise exception 'standings endorsement count wrong';
  end if;
end $$;

-- "Did you mean?" search still finds a typo'd name using the trigram index.
insert into restaurants (source, source_id, name, address, neighbourhood, city)
values ('test', '1', 'Pizzeria Libretto', '221 Ossington Ave', 'Ossington', 'Toronto'),
       ('test', '2', 'Miznon', '1 King St', 'Downtown', 'Toronto');
do $$
begin
  if (select name from match_restaurant('Pizeria Libreto')) is distinct from 'Pizzeria Libretto' then
    raise exception 'match_restaurant did not find the typo''d name';
  end if;
  if (select count(*) from search_restaurants_fuzzy('Mizanara')) <> 0 then
    raise exception 'fuzzy search matched an unrelated place';
  end if;
end $$;

-- Row-level security still keeps a private Next in Line private.
insert into next_in_line (user_id, place_name) values ('00000000-0000-0000-0000-0000000000b1', 'Secret Spot');
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000000b2', false);
do $$
begin
  if (select count(*) from next_in_line where place_name = 'Secret Spot') <> 0 then
    raise exception 'someone else could see a private Next in Line entry';
  end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000000b1', false);
do $$
begin
  if (select count(*) from next_in_line where place_name = 'Secret Spot') <> 1 then
    raise exception 'the owner could not see their own Next in Line entry';
  end if;
end $$;
reset role;

-- Invite links: a brand-new account is connected to its inviter both ways,
-- once; an older account, a self-invite, or a block does nothing.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'd1@example.com'),
  ('00000000-0000-0000-0000-0000000000d2', 'd2@example.com'),
  ('00000000-0000-0000-0000-0000000000d3', 'd3@example.com');
update auth.users set created_at = now() - interval '2 hours' where id = '00000000-0000-0000-0000-0000000000d2';
update profiles set username = 'inviter', display_name = 'Ivy' where id = '00000000-0000-0000-0000-0000000000b1';
insert into blocks (blocker_id, blocked_id) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000d3');
set role authenticated;
do $$
declare got text; n int;
begin
  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000d1', false);
  got := claim_invite('Inviter');
  if got is distinct from 'Ivy' then raise exception 'claim_invite should return the inviter''s name, got %', got; end if;
  select count(*) into n from follows
    where (follower_id, followee_id) in (('00000000-0000-0000-0000-0000000000d1'::uuid, '00000000-0000-0000-0000-0000000000b1'::uuid),
                                         ('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-0000000000d1'::uuid));
  if n <> 2 then raise exception 'invite did not follow both ways (% rows)', n; end if;
  if claim_invite('inviter') is not null then raise exception 'an account was claimed by an invite twice'; end if;

  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000d2', false);
  if claim_invite('inviter') is not null then raise exception 'an older account was connected by an invite link'; end if;

  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000d3', false);
  if claim_invite('inviter') is not null then raise exception 'an invite connected two people across a block'; end if;

  perform set_config('app.uid', '00000000-0000-0000-0000-0000000000b1', false);
  if claim_invite('inviter') is not null then raise exception 'someone could invite themselves'; end if;
end $$;
reset role;
do $$
begin
  if (select count(*) from invites) <> 1 then raise exception 'expected exactly one invite row'; end if;
  if (select source from signup_sources where user_id = '00000000-0000-0000-0000-0000000000d1') is distinct from 'invite' then
    raise exception 'an invited signup was not recorded as source "invite"';
  end if;
end $$;

-- Restaurant pages: every Google place gets a readable address once;
-- clashes get the neighbourhood, then a number; and only Public
-- kingdoms' crowns ever appear on a page.
insert into next_in_line (user_id, place_name, neighbourhood, city, google_place_id) values
  ('00000000-0000-0000-0000-0000000000b2', 'Rudy''s Café', null, 'Toronto', 'GID_RUDY1'),
  ('00000000-0000-0000-0000-0000000000b2', 'Rudy''s Café', 'Annex', 'Toronto', 'GID_RUDY2'),
  ('00000000-0000-0000-0000-0000000000b2', 'Rudy''s Café', 'Annex', 'Toronto', 'GID_RUDY3'),
  ('00000000-0000-0000-0000-0000000000b2', 'Rudy''s Café', 'Annex', 'Toronto', 'GID_RUDY1');
do $$
declare page jsonb;
begin
  if (select slug from place_pages where google_place_id = 'GID_RUDY1') is distinct from 'rudys-cafe-toronto' then
    raise exception 'unexpected slug %', (select slug from place_pages where google_place_id = 'GID_RUDY1');
  end if;
  if (select slug from place_pages where google_place_id = 'GID_RUDY2') is distinct from 'rudys-cafe-annex-toronto' then
    raise exception 'a clashing name did not get its neighbourhood';
  end if;
  if (select slug from place_pages where google_place_id = 'GID_RUDY3') is distinct from 'rudys-cafe-annex-toronto-2' then
    raise exception 'a second clash did not get a number';
  end if;
  if (select count(*) from place_pages where google_place_id = 'GID_RUDY1') <> 1 then
    raise exception 'one place got two pages';
  end if;
  if (select slug from place_pages where google_place_id = 'GID_LIB') is distinct from 'pizzeria-libretto' then
    raise exception 'a crown saved before pages existed was not given one';
  end if;
end $$;
set role anon;
select set_config('app.uid', '', false);
do $$
declare page jsonb;
begin
  page := place_page('pizzeria-libretto');
  if (page->>'crown_count')::int <> 1 then raise exception 'expected 1 public crown, got %', page->>'crown_count'; end if;
  if (page->>'best_rank')::int <> 1 then raise exception 'expected Best in the Land rank 1, got %', page->>'best_rank'; end if;
  if page->'crowns'->0->>'decree' is null then raise exception 'the crown''s decree is missing'; end if;
  if (place_page('rudys-cafe-toronto')->>'crown_count')::int <> 0 then raise exception 'an uncrowned place shows crowns'; end if;
  if (place_page('rudys-cafe-toronto')->>'want_count')::int <> 2 then raise exception 'want-to-try count wrong'; end if;
  if place_page('no-such-place') is not null then raise exception 'a missing page returned something'; end if;
  if (select count(*) from place_pages_for_sitemap()) <> 1 then raise exception 'sitemap should list only crowned places'; end if;
end $$;
reset role;
update profiles set is_public = false where id = '00000000-0000-0000-0000-0000000000b1';
set role anon;
do $$
begin
  if (place_page('pizzeria-libretto')->>'crown_count')::int <> 0 then
    raise exception 'a Private kingdom''s crown appeared on a restaurant page';
  end if;
end $$;
reset role;

-- Privacy: other people can read names, not settings; your own full
-- profile comes from my_profile(); the owner's user list from
-- admin_profiles() (nobody else gets anything).
set role anon;
select set_config('app.uid', '', false);
do $$
begin
  perform username, display_name, avatar_url, city, is_public from profiles limit 1;
  begin
    perform a11y_prefs from profiles limit 1;
    raise exception 'a signed-out visitor could read accessibility settings';
  exception when insufficient_privilege then null;
  end;
  begin
    perform unsubscribe_token from profiles limit 1;
    raise exception 'a signed-out visitor could read unsubscribe codes';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000000b2', false);
do $$
declare me jsonb;
begin
  begin
    perform notifications_seen_at from profiles where id = '00000000-0000-0000-0000-0000000000b1';
    raise exception 'a member could read when someone else last checked notifications';
  exception when insufficient_privilege then null;
  end;
  me := my_profile();
  if me->>'id' is distinct from '00000000-0000-0000-0000-0000000000b2' or not (me ? 'a11y_prefs') then
    raise exception 'my_profile did not return the caller''s own settings';
  end if;
  if me ? 'unsubscribe_token' then raise exception 'my_profile leaked the unsubscribe code'; end if;
  if (select count(*) from admin_profiles()) <> 0 then raise exception 'a non-owner got the admin user list'; end if;
  -- Saving your own profile still works without being able to read it back.
  update profiles set display_name = 'Bee', a11y_prefs = '{"largerText": true}' where id = '00000000-0000-0000-0000-0000000000b2';
  if (my_profile()->'a11y_prefs'->>'largerText') is distinct from 'true' then raise exception 'own settings did not save'; end if;
end $$;

-- Usernames: format and the site's own page names are enforced when a
-- username changes.
do $$
begin
  begin
    update profiles set username = 'faq' where id = '00000000-0000-0000-0000-0000000000b2';
    raise exception 'a reserved username was accepted';
  exception when check_violation then null;
  end;
  begin
    update profiles set username = 'Not Valid!' where id = '00000000-0000-0000-0000-0000000000b2';
    raise exception 'a badly formed username was accepted';
  exception when check_violation then null;
  end;
  update profiles set username = 'bee-two' where id = '00000000-0000-0000-0000-0000000000b2';
end $$;

-- Scores can't be faked: past crowns come only from a real coup, and the
-- shared search cache can't be written by members.
do $$
declare before_count int;
begin
  begin
    insert into fallen (user_id, cuisine_id, place_name) values ('00000000-0000-0000-0000-0000000000b2', (select id from cuisines where name = 'Sushi' and is_default), 'Fake coup');
    raise exception 'a member could write fake past crowns';
  exception when insufficient_privilege then null;
  end;
  insert into thrones (user_id, cuisine_id, place_name, decree)
  values ('00000000-0000-0000-0000-0000000000b2', (select id from cuisines where name = 'Sushi' and is_default), 'First Sushi', 'a decree that is long enough to pass');
  select count(*) into before_count from fallen where user_id = '00000000-0000-0000-0000-0000000000b2';
  update thrones set place_name = 'Better Sushi' where user_id = '00000000-0000-0000-0000-0000000000b2' and place_name = 'First Sushi';
  if (select count(*) from fallen where user_id = '00000000-0000-0000-0000-0000000000b2') <> before_count + 1 then
    raise exception 'a real coup no longer archives the old crown';
  end if;
  begin
    insert into place_lookup_cache (query_key, results) values ('x|toronto', '[]');
    raise exception 'a member could plant search results in the shared cache';
  exception when insufficient_privilege then null;
  end;
  if next_in_line_recent_count('00000000-0000-0000-0000-0000000000b1') <> 0 then
    raise exception 'a member could see someone else''s activity count';
  end if;
end $$;
reset role;

-- New signups get a neutral username with nothing from their email.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1', 'jane.private.1985@example.com');
do $$
declare u text; d text;
begin
  select username, display_name into u, d from profiles where id = '00000000-0000-0000-0000-0000000000e1';
  if u !~ '^member-[0-9a-f]{8}$' or d is not null then raise exception 'new profile still built from the email: %, %', u, d; end if;
end $$;
