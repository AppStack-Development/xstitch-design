-- Permission tests for 0017_usernames.sql: @usernames, the 30-day rule, reserved names and the verified badge.
--
-- Safe on the real database: one transaction that always ends in an error (the summary), so nothing is kept.
-- Run the whole file in the SQL Editor after the migration; the error message is the result.
--
-- People: A and B share patterns, C has no public name yet, M is a moderator.

begin;

create schema t_test;
grant usage on schema t_test to anon, authenticated;
create table t_test.results (id serial primary key, label text, passed boolean, detail text);
grant all on t_test.results to anon, authenticated;
grant usage on sequence t_test.results_id_seq to anon, authenticated;

create function t_test.ok(label text, cond boolean, detail text default '') returns void
language sql as $$ insert into t_test.results (label, passed, detail) values (label, coalesce(cond, false), detail); $$;

create function t_test.fails(label text, stmt text, expect text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    insert into t_test.results (label, passed, detail) values (label, sqlerrm ilike '%' || expect || '%', sqlerrm);
    return;
  end;
  insert into t_test.results (label, passed, detail) values (label, false, 'no error (expected: ' || expect || ')');
end $$;

create function t_test.me(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
end $$;
-- (reads as the owner, whatever the current role can see)
create function t_test.c(uid uuid) returns public.creators language sql security definer as $$ select * from public.creators where user_id = $1 $$;
grant execute on all functions in schema t_test to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'creator-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'creator-b@example.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'no-name-yet@example.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'moderator@example.test')
on conflict (id) do nothing;
insert into public.moderators (user_id) values ('00000000-0000-4000-8000-0000000000d1') on conflict do nothing;

-- ================= everyone already sharing has a username =================
select t_test.ok('every existing creator has a username', not exists (select 1 from public.creators where username is null));
select t_test.ok('the official account is @xstitch',
  not exists (select 1 from public.creators where official)
  or exists (select 1 from public.creators where official and username = 'xstitch'));

-- ================= A: a public name without choosing a username =================
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
insert into public.creators (user_id, display_name) values ('00000000-0000-4000-8000-0000000000a1', 'Test Creator A');
select t_test.ok('A gets a maker1234 username', (t_test.c('00000000-0000-4000-8000-0000000000a1')).username ~ '^maker[0-9]{4,}$',
  (t_test.c('00000000-0000-4000-8000-0000000000a1')).username);
select t_test.ok('…marked as not chosen yet', not (t_test.c('00000000-0000-4000-8000-0000000000a1')).username_chosen);

-- the first change of your own is free
update public.creators set username = 'test_alice.st' where user_id = '00000000-0000-4000-8000-0000000000a1';
select t_test.ok('A chooses @test_alice.st', (t_test.c('00000000-0000-4000-8000-0000000000a1')).username = 'test_alice.st');
select t_test.ok('…and the change is recorded', (t_test.c('00000000-0000-4000-8000-0000000000a1')).username_chosen
  and (t_test.c('00000000-0000-4000-8000-0000000000a1')).username_changed_at is not null);
select t_test.fails('A can''t change it again within 30 days',
  $$update public.creators set username = 'test_alice2' where user_id = '00000000-0000-4000-8000-0000000000a1'$$, 'changed recently');
update public.creators set display_name = 'Test Creator A (new)' where user_id = '00000000-0000-4000-8000-0000000000a1';
select t_test.ok('…but can still change the display name', (t_test.c('00000000-0000-4000-8000-0000000000a1')).display_name = 'Test Creator A (new)');
update public.creators set display_name = 'Test Creator A', username = 'test_alice.st' where user_id = '00000000-0000-4000-8000-0000000000a1';
select t_test.ok('saving the same username again isn''t a change', (t_test.c('00000000-0000-4000-8000-0000000000a1')).display_name = 'Test Creator A');

-- ================= what a username may be =================
select t_test.me('00000000-0000-4000-8000-0000000000b1');
select t_test.fails('B can''t take A''s username',
  $$insert into public.creators (user_id, display_name, username) values ('00000000-0000-4000-8000-0000000000b1', 'B', 'test_alice.st')$$, 'creators_username');
select t_test.fails('no capital letters',
  $$insert into public.creators (user_id, display_name, username) values ('00000000-0000-4000-8000-0000000000b1', 'B', 'Test_Bob')$$, 'creators_username_format');
select t_test.fails('at least 3 characters',
  $$insert into public.creators (user_id, display_name, username) values ('00000000-0000-4000-8000-0000000000b1', 'B', 'tb')$$, 'creators_username_format');
select t_test.fails('at most 20 characters',
  $$insert into public.creators (user_id, display_name, username) values ('00000000-0000-4000-8000-0000000000b1', 'B', 'test_bob_with_a_long_name')$$, 'creators_username_format');
select t_test.fails('no spaces or Thai letters',
  $$insert into public.creators (user_id, display_name, username) values ('00000000-0000-4000-8000-0000000000b1', 'B', 'test บ็อบ')$$, 'creators_username_format');
select t_test.fails('no dot at the start',
  $$insert into public.creators (user_id, display_name, username) values ('00000000-0000-4000-8000-0000000000b1', 'B', '.testbob')$$, 'creators_username_format');
select t_test.fails('no two dots in a row',
  $$insert into public.creators (user_id, display_name, username) values ('00000000-0000-4000-8000-0000000000b1', 'B', 'test..bob')$$, 'creators_username_format');
select t_test.fails('reserved: support',
  $$insert into public.creators (user_id, display_name, username) values ('00000000-0000-4000-8000-0000000000b1', 'B', 'support')$$, 'not allowed');
select t_test.fails('reserved: anything with xstitch',
  $$insert into public.creators (user_id, display_name, username) values ('00000000-0000-4000-8000-0000000000b1', 'B', 'the_xstitch_team')$$, 'not allowed');
select t_test.fails('a display name that passes for the team',
  $$insert into public.creators (user_id, display_name) values ('00000000-0000-4000-8000-0000000000b1', 'X-Stitch Official')$$, 'name not allowed');
select t_test.fails('…in any case',
  $$insert into public.creators (user_id, display_name) values ('00000000-0000-4000-8000-0000000000b1', 'xstitch.design')$$, 'name not allowed');
insert into public.creators (user_id, display_name, username) values ('00000000-0000-4000-8000-0000000000b1', 'Max Stitch', 'test_bob.makes');
select t_test.ok('"Max Stitch" is fine, and a username given at the start counts as chosen',
  (t_test.c('00000000-0000-4000-8000-0000000000b1')).username = 'test_bob.makes' and (t_test.c('00000000-0000-4000-8000-0000000000b1')).username_chosen);
select t_test.fails('B can''t rename into the team either',
  $$update public.creators set display_name = 'XStitch' where user_id = '00000000-0000-4000-8000-0000000000b1'$$, 'name not allowed');

-- ================= what stays out of reach =================
select t_test.fails('B can''t verify themselves',
  $$update public.creators set verified = true where user_id = '00000000-0000-4000-8000-0000000000b1'$$, 'permission denied');
select t_test.fails('…or insert as verified',
  $$insert into public.creators (user_id, display_name, verified) values ('00000000-0000-4000-8000-0000000000c1', 'C', true)$$, 'permission denied');
select t_test.fails('…or become official',
  $$update public.creators set official = true where user_id = '00000000-0000-4000-8000-0000000000b1'$$, 'permission denied');
select t_test.fails('…or reset the 30-day clock',
  $$update public.creators set username_changed_at = null where user_id = '00000000-0000-4000-8000-0000000000b1'$$, 'permission denied');
select t_test.fails('…or mark a username as not chosen',
  $$update public.creators set username_chosen = false where user_id = '00000000-0000-4000-8000-0000000000b1'$$, 'permission denied');
select t_test.fails('B can''t use the verify switch',
  $$select public.set_creator_verified('test_bob.makes', true)$$, 'not allowed');
update public.creators set username = 'test_hijack' where user_id = '00000000-0000-4000-8000-0000000000a1';
select t_test.ok('B can''t rename A', (t_test.c('00000000-0000-4000-8000-0000000000a1')).username = 'test_alice.st');
select t_test.fails('B can''t blank a username',
  $$update public.creators set username = null where user_id = '00000000-0000-4000-8000-0000000000b1'$$, '');
select t_test.ok('…it is still there', (t_test.c('00000000-0000-4000-8000-0000000000b1')).username = 'test_bob.makes');

-- ================= moderators verify =================
select t_test.me('00000000-0000-4000-8000-0000000000d1');
select public.set_creator_verified(' Test_Bob.Makes ', true);
select t_test.ok('M verifies @test_bob.makes (any case, spaces trimmed)', (t_test.c('00000000-0000-4000-8000-0000000000b1')).verified
  and (t_test.c('00000000-0000-4000-8000-0000000000b1')).verified_at is not null);
select public.set_creator_verified('test_bob.makes', false);
select t_test.ok('…and takes it back', not (t_test.c('00000000-0000-4000-8000-0000000000b1')).verified
  and (t_test.c('00000000-0000-4000-8000-0000000000b1')).verified_at is null);
select public.set_creator_verified('test_bob.makes', true);
select t_test.fails('an unknown username',
  $$select public.set_creator_verified('test_nobody_here', true)$$, 'no such creator');

-- ================= what everyone sees =================
reset role;
set local role anon;
select t_test.me(null);
select t_test.ok('signed out: username and badge are public',
  (select username = 'test_bob.makes' and verified from public.creators where user_id = '00000000-0000-4000-8000-0000000000b1'));
select t_test.fails('signed out: no verify switch',
  $$select public.set_creator_verified('test_bob.makes', false)$$, 'permission denied');
select t_test.fails('signed out: can''t create a public name',
  $$insert into public.creators (user_id, display_name) values ('00000000-0000-4000-8000-0000000000c1', 'C')$$, 'permission denied');

-- ================= 30 days later =================
reset role;
update public.creators set username_changed_at = now() - interval '31 days' where user_id = '00000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
update public.creators set username = 'test_alice2' where user_id = '00000000-0000-4000-8000-0000000000a1';
select t_test.ok('after 30 days A can change it again', (t_test.c('00000000-0000-4000-8000-0000000000a1')).username = 'test_alice2');

-- the team, from SQL, can still give out reserved names
reset role;
select t_test.me(null);
update public.creators set username = 'support' where user_id = '00000000-0000-4000-8000-0000000000b1';
select t_test.ok('SQL can set a reserved username', (t_test.c('00000000-0000-4000-8000-0000000000b1')).username = 'support');

-- ================= summary (ends the transaction: nothing is kept) =================
reset role;
do $$
declare n int; f int; list text;
begin
  select count(*), count(*) filter (where not passed),
         string_agg(case when not passed then '- ' || label || ': ' || detail end, E'\n' order by id)
    into n, f, list from t_test.results;
  if f = 0 then
    raise exception 'ALL % PERMISSION TESTS PASSED (rolled back, nothing kept)', n;
  else
    raise exception '% of % FAILED (rolled back, nothing kept):%', f, n, E'\n' || list;
  end if;
end $$;
