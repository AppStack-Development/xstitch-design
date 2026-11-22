-- Permission tests for 0015_trust.sql: reviews, shop reports, and cancelling orders nobody answered or paid.
--
-- Safe on the real database: one transaction that always ends in an error (the summary), so nothing is kept.
-- Run the whole file in the SQL Editor after the migration; the error message is the result.
--
-- People: A and B have shops, C1 and C2 are customers, M is a moderator.

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

create function t_test.run(stmt text) returns void language plpgsql as $$ begin execute stmt; end $$;

create function t_test.me(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
end $$;

-- a 3D kit (40 x 40 at 2 mm, size M) for the signed-in customer, at a shop (null = the team's)
create function t_test.order_sql(code text, shop text) returns text
language sql as $$
  select format($f$insert into public.orders (code, title, cols, rows, pitch_mm, colors, stitches, data, product, quantity,
    ship_name, ship_phone, ship_address, ship_postcode, terms_version, rights_confirmed, shop_id)
    values (%L, 'Test', 40, 40, 2, 3, 200, 'test-pattern-data', 'kit', 1, 'Customer', '0811111111',
            '9 Private Road, Secret Town', '10110', '2026-11-22', true, %s)$f$, code, coalesce(shop, 'null'));
$$;
create function t_test.id_of(code text) returns bigint language sql as $$ select id from public.orders where code = $1 $$;
grant execute on all functions in schema t_test to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'shop-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'shop-b@example.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'customer-1@example.test'),
  ('00000000-0000-4000-8000-0000000000c2', 'customer-2@example.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'moderator@example.test')
on conflict (id) do nothing;
insert into public.moderators (user_id) values ('00000000-0000-4000-8000-0000000000d1') on conflict do nothing;

-- shops A and B, and an order from C1 at A
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
insert into public.shops (name, seller_terms) values ('Test shop A', '2026-11-22');
select set_config('t.shop_a', (select id::text from public.shops where owner_id = auth.uid()), true);
insert into public.shop_payment (shop_id, promptpay_id) values (current_setting('t.shop_a')::bigint, '0812345678');
insert into public.shop_rates (shop_id, product, size, price_thb) values (current_setting('t.shop_a')::bigint, 'kit', 'M', 200);
select t_test.me('00000000-0000-4000-8000-0000000000b1');
insert into public.shops (name, seller_terms) values ('Test shop B', '2026-11-22');
select set_config('t.shop_b', (select id::text from public.shops where owner_id = auth.uid()), true);

select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.run(t_test.order_sql('XSD-ZZTST1', current_setting('t.shop_a')));
insert into public.order_messages (order_id, body) values (t_test.id_of('XSD-ZZTST1'), 'Where is my parcel?');
select set_config('t.o1', t_test.id_of('XSD-ZZTST1')::text, true);

-- ================= reviews =================
select t_test.fails('an order cannot be reviewed before it''s received',
  format('insert into public.order_reviews (order_id, rating, body) values (%s, 5, ''x'')', current_setting('t.o1')), 'not received');
reset role;
update public.orders set status = 'done' where code = 'XSD-ZZTST1';
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.fails('another customer cannot review someone''s order',
  format('insert into public.order_reviews (order_id, rating, body) values (%s, 1, ''bad'')', current_setting('t.o1')), 'order not found');
select t_test.me('00000000-0000-4000-8000-0000000000c1');
insert into public.order_reviews (order_id, rating, body) values (current_setting('t.o1')::bigint, 5, '  Lovely kit  ');
reset role;
select t_test.ok('the customer reviews a received order; the shop and reviewer are set by the database',
  (select rating = 5 and body = 'Lovely kit' and shop_id = current_setting('t.shop_a')::bigint and user_id = '00000000-0000-4000-8000-0000000000c1'
     from public.order_reviews where order_id = current_setting('t.o1')::bigint));
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.fails('one review per order', format('insert into public.order_reviews (order_id, rating) values (%s, 1)', current_setting('t.o1')), 'duplicate');
select t_test.fails('the customer cannot write the shop''s reply',
  format('update public.order_reviews set reply = ''from me'' where order_id = %s', current_setting('t.o1')), 'permission denied');

set local role anon;
select t_test.me(null);
select t_test.ok('anyone sees the shop''s reviews, with the product',
  (select count(*) = 1 and bool_and(product = 'kit' and rating = 5) from public.shop_reviews(current_setting('t.shop_a')::bigint)));
select t_test.fails('nobody sees who wrote a review', 'select user_id from public.order_reviews', 'permission denied');

set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000b1');
select t_test.fails('another shop cannot reply', format('select public.review_reply(%s, ''thanks'')', current_setting('t.o1')), 'review not found');
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select public.review_reply(current_setting('t.o1')::bigint, 'Thank you!');
select t_test.ok('the shop replies', (select reply = 'Thank you!' and replied_at is not null from public.order_reviews where order_id = current_setting('t.o1')::bigint));
select t_test.fails('the shop replies only once', format('select public.review_reply(%s, ''again'')', current_setting('t.o1')), 'already replied');
select t_test.fails('only moderators hide reviews', format('select public.review_hide(%s, true)', current_setting('t.o1')), 'not allowed');

select t_test.me('00000000-0000-4000-8000-0000000000d1');
select public.review_hide(current_setting('t.o1')::bigint, true);
set local role anon;
select t_test.me(null);
select t_test.ok('a hidden review is gone for visitors',
  (select count(*) = 0 from public.shop_reviews(current_setting('t.shop_a')::bigint))
  and (select count(*) = 0 from public.order_reviews where order_id = current_setting('t.o1')::bigint));
select t_test.ok('and from the shop''s rating', (select reviews = 0 and delivered = 1 from public.shop_stats(array[current_setting('t.shop_a')::bigint])));
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.ok('the customer still sees their own hidden review', (select count(*) = 1 from public.order_reviews where order_id = current_setting('t.o1')::bigint));
select t_test.me('00000000-0000-4000-8000-0000000000d1');
select public.review_hide(current_setting('t.o1')::bigint, false);
set local role anon;
select t_test.me(null);
select t_test.ok('shown again, it counts toward the rating', (select reviews = 1 and rating = 5.0 from public.shop_stats(array[current_setting('t.shop_a')::bigint])));

-- ================= reports =================
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.fails('a report can only name your own order',
  format('insert into public.shop_reports (shop_id, order_id, reason) values (%s, %s, ''not_shipped'')', current_setting('t.shop_a'), current_setting('t.o1')), 'order not found');
insert into public.shop_reports (shop_id, reason, note) values (current_setting('t.shop_a')::bigint, 'rude', 'Was rude in chat');
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.fails('the order named must be from that shop',
  format('insert into public.shop_reports (shop_id, order_id, reason) values (%s, %s, ''not_shipped'')', current_setting('t.shop_b'), current_setting('t.o1')), 'order not found');
insert into public.shop_reports (shop_id, order_id, reason, note) values (current_setting('t.shop_a')::bigint, current_setting('t.o1')::bigint, 'wrong_item', 'Wrong colours');
select t_test.ok('reporters see only their own reports', (select count(*) = 1 and bool_and(reporter = auth.uid()) from public.shop_reports));
update public.shop_reports set resolution = 'dismissed', resolved_at = now();
reset role;
select t_test.ok('reporters cannot mark a report handled (their update changes nothing)',
  (select bool_and(resolved_at is null and resolution is null) from public.shop_reports where reporter = '00000000-0000-4000-8000-0000000000c1'));
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.ok('the reported shop does not see the reports', (select count(*) = 0 from public.shop_reports));

-- the team, on a reported order
select t_test.me('00000000-0000-4000-8000-0000000000d1');
select t_test.ok('a moderator sees the reports', (select count(*) >= 2 from public.shop_reports where shop_id = current_setting('t.shop_a')::bigint));
select t_test.ok('and the reported order, with its messages',
  (select count(*) = 1 from public.orders where code = 'XSD-ZZTST1')
  and (select count(*) = 1 from public.order_messages where order_id = current_setting('t.o1')::bigint));
select t_test.ok('but not its delivery address', (select count(*) = 0 from public.order_addresses(array['XSD-ZZTST1'])));
update public.shop_reports set resolution = 'suspended', resolved_at = now() where order_id = current_setting('t.o1')::bigint;
select t_test.ok('a moderator marks a report handled', (select resolution = 'suspended' from public.shop_reports where order_id = current_setting('t.o1')::bigint));

-- an order nobody reported stays closed to the team
select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.run(t_test.order_sql('XSD-ZZTST2', current_setting('t.shop_a')));
select t_test.me('00000000-0000-4000-8000-0000000000d1');
select t_test.ok('a moderator cannot see a shop''s order nobody reported', (select count(*) = 0 from public.orders where code = 'XSD-ZZTST2'));

select t_test.me('00000000-0000-4000-8000-0000000000c2');
insert into public.shop_reports (shop_id, reason) select current_setting('t.shop_b')::bigint, 'other' from generate_series(1, 4);
select t_test.fails('at most 5 reports a day', format('insert into public.shop_reports (shop_id, reason) values (%s, ''other'')', current_setting('t.shop_b')), 'too many reports');

-- ================= cancelling orders nobody answered or paid =================
select t_test.fails('the app cannot run the expiry itself', 'select public.expire_stale_orders()', 'permission denied');
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.run(t_test.order_sql('XSD-ZZEXP1', null));
select t_test.run(t_test.order_sql('XSD-ZZEXP2', null));
-- (C2 places the other two: one customer may place 5 orders an hour)
select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.run(t_test.order_sql('XSD-ZZEXP3', null));
select t_test.run(t_test.order_sql('XSD-ZZEXP4', null));
reset role;
-- 1: the shop never answered (4 days); 2: accepted 3 days ago, unpaid; 3: accepted yesterday;
-- 4: accepted 3 days ago, but a slip was turned down yesterday
update public.orders set status = 'awaiting_accept', accepted_at = null, created_at = now() - interval '4 days' where code = 'XSD-ZZEXP1';
update public.orders set accepted_at = now() - interval '3 days', created_at = now() - interval '3 days' where code = 'XSD-ZZEXP2';
update public.orders set accepted_at = now() - interval '1 day', created_at = now() - interval '1 day' where code = 'XSD-ZZEXP3';
update public.orders set accepted_at = now() - interval '3 days', created_at = now() - interval '3 days', slip_at = now() - interval '1 day' where code = 'XSD-ZZEXP4';
select public.expire_stale_orders();
select t_test.ok('an order the shop didn''t answer in 3 days is cancelled by the system',
  (select status = 'cancelled' and cancelled_by = 'system' and cancel_reason like '%3 days%' from public.orders where code = 'XSD-ZZEXP1'));
select t_test.ok('an order unpaid 2 days after acceptance is cancelled',
  (select status = 'cancelled' and cancelled_by = 'system' from public.orders where code = 'XSD-ZZEXP2'));
select t_test.ok('an order accepted yesterday is left alone', (select status = 'awaiting_payment' from public.orders where code = 'XSD-ZZEXP3'));
select t_test.ok('a turned-down slip restarts the 2 days', (select status = 'awaiting_payment' from public.orders where code = 'XSD-ZZEXP4'));
select t_test.ok('received orders are never touched', (select status = 'done' from public.orders where code = 'XSD-ZZTST1'));

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
