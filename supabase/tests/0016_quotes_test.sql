-- Permission tests for 0016_quotes.sql: asking a shop for a price, quoting, accepting, and quotes that lapse.
--
-- Safe on the real database: one transaction that always ends in an error (the summary), so nothing is kept.
-- Run the whole file in the SQL Editor after the migration; the error message is the result.
--
-- People: A has a shop that quotes fabric, B a shop that doesn't quote; C1–C3 are customers, M is a moderator.

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

-- an order (or, with quote, a quote request) of a square design `cols` stitches wide at `pitch` mm
create function t_test.order_sql(code text, shop text, product text, cols int, pitch numeric, quote boolean, qty int default 1) returns text
language sql as $$
  select format($f$insert into public.orders (code, title, cols, rows, pitch_mm, colors, stitches, data, product, quantity,
    ship_name, ship_phone, ship_address, ship_postcode, terms_version, rights_confirmed, shop_id, is_quote)
    values (%L, 'Test', %s, %s, %s, 3, 200, 'test-pattern-data', %L, %s, 'Customer', '0811111111',
            '9 Private Road, Secret Town', '10110', '2026-11-22', true, %s, %L)$f$,
    code, cols, cols, pitch, product, qty, coalesce(shop, 'null'), quote);
$$;
-- (reads as the owner: checks look at every column, which customers and shops can't select)
create function t_test.o(code text) returns public.orders language sql security definer as $$ select * from public.orders where code = $1 $$;
grant execute on all functions in schema t_test to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'shop-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'shop-b@example.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'customer-1@example.test'),
  ('00000000-0000-4000-8000-0000000000c2', 'customer-2@example.test'),
  ('00000000-0000-4000-8000-0000000000c3', 'customer-3@example.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'moderator@example.test')
on conflict (id) do nothing;
insert into public.moderators (user_id) values ('00000000-0000-4000-8000-0000000000d1') on conflict do nothing;

-- shop A quotes fabric and lists a small fabric kit; shop B doesn't quote
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
insert into public.shops (name, seller_terms, quote_materials) values ('Test shop A', '2026-11-22', '{fabric}');
select set_config('t.shop_a', (select id::text from public.shops where owner_id = auth.uid()), true);
insert into public.shop_payment (shop_id, promptpay_id) values (current_setting('t.shop_a')::bigint, '0812345678');
insert into public.shop_rates (shop_id, product, size, price_thb) values (current_setting('t.shop_a')::bigint, 'fabric_kit', 'S', 300);
select t_test.fails('a shop can only quote 3D and fabric',
  format('update public.shops set quote_materials = ''{wood}'' where id = %s', current_setting('t.shop_a')), 'quote_materials');
select t_test.me('00000000-0000-4000-8000-0000000000b1');
insert into public.shops (name, seller_terms) values ('Test shop B', '2026-11-22');
select set_config('t.shop_b', (select id::text from public.shops where owner_id = auth.uid()), true);
insert into public.shop_payment (shop_id, promptpay_id) values (current_setting('t.shop_b')::bigint, '0898765432');

set local role anon;
select t_test.me(null);
select t_test.ok('anyone sees which shops take fabric quote requests',
  exists (select 1 from public.quote_shops('fabric') where shop_id = current_setting('t.shop_a')::bigint)
  and not exists (select 1 from public.quote_shops('fabric') where shop_id = current_setting('t.shop_b')::bigint));
select t_test.ok('a shop that quotes only fabric is not listed for 3D',
  not exists (select 1 from public.quote_shops('3d') where shop_id = current_setting('t.shop_a')::bigint));

-- ================= asking =================
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.fails('no quote request to a shop that doesn''t quote',
  t_test.order_sql('XSD-ZZQB01', current_setting('t.shop_b'), 'fabric_kit', 120, 3, true), 'not taking quotes');
select t_test.fails('no quote request for a material the shop doesn''t quote',
  t_test.order_sql('XSD-ZZQA3D', current_setting('t.shop_a'), 'kit', 30, 2, true), 'not taking quotes');
select t_test.fails('nothing over 1 m, even on a quote',
  t_test.order_sql('XSD-ZZQBIG', current_setting('t.shop_a'), 'fabric_kit', 400, 3, true), 'piece too large');
select t_test.fails('a piece larger than the size table still needs a quote',
  t_test.order_sql('XSD-ZZQXL0', current_setting('t.shop_a'), 'fabric_kit', 120, 3, false), 'piece too large');
select t_test.fails('the customer cannot write the quote',
  format($f$insert into public.orders (code, title, cols, rows, pitch_mm, colors, stitches, data, product, quantity,
    ship_name, ship_phone, ship_address, ship_postcode, terms_version, rights_confirmed, shop_id, is_quote, quote_note)
    values ('XSD-ZZQNOT', 'Test', 120, 120, 3, 3, 200, 'x', 'fabric_kit', 1, 'C', '0811111111', '9 Private Road, Town',
            '10110', '2026-11-22', true, %s, true, 'free!')$f$, current_setting('t.shop_a')), 'permission denied');

select t_test.run(t_test.order_sql('XSD-ZZQ001', current_setting('t.shop_a'), 'fabric_kit', 120, 3, true, 2));
select t_test.ok('a quote request for a large piece: size XL, no price yet, waiting for the shop',
  (select status = 'quote_requested' and is_quote and size = 'XL' and total_thb = 0 and unit_thb = 0 and accepted_at is null
     from t_test.o('XSD-ZZQ001')));

-- ================= quoting =================
select t_test.fails('the customer cannot accept before there''s a quote',
  'select public.order_accept_quote(''XSD-ZZQ001'', 0)', 'no quote to accept');
select t_test.fails('the customer cannot quote their own request',
  'select public.shop_quote(''XSD-ZZQ001'', 1, 0, '''')', 'order not found');
select t_test.me('00000000-0000-4000-8000-0000000000b1');
select t_test.fails('another shop cannot quote', 'select public.shop_quote(''XSD-ZZQ001'', 100, 50, '''')', 'order not found');
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.fails('a quote needs a price', 'select public.shop_quote(''XSD-ZZQ001'', 0, 50, '''')', 'price 1 to 100000');
select t_test.fails('the shop cannot "accept" a quote request without a price',
  format('select public.shop_order_action(%L, %L)', 'XSD-ZZQ001', 'accept'), 'not waiting for the shop');
select public.shop_quote('XSD-ZZQ001', 1500, 120, '  Linen 28ct, wooden hoop included  ');
select t_test.ok('the shop quotes: price per piece × 2 + shipping, with its note',
  (select status = 'quoted' and unit_thb = 1500 and shipping_thb = 120 and total_thb = 3120
          and quote_note = 'Linen 28ct, wooden hoop included' and quoted_at is not null from t_test.o('XSD-ZZQ001')));

select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.fails('another customer cannot accept the quote', 'select public.order_accept_quote(''XSD-ZZQ001'', 3120)', 'order not found');
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select public.shop_quote('XSD-ZZQ001', 1400, 120, 'Linen 28ct');
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.fails('accepting a price that has since changed fails', 'select public.order_accept_quote(''XSD-ZZQ001'', 3120)', 'price changed');
select public.order_accept_quote('XSD-ZZQ001', 2920);
select t_test.ok('accepting the revised quote makes it an ordinary order waiting for payment',
  (select status = 'awaiting_payment' and total_thb = 2920 and accepted_at is not null from t_test.o('XSD-ZZQ001')));
select t_test.ok('and the customer now sees where to pay', (select count(*) = 1 from public.order_payment('XSD-ZZQ001')));
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.fails('the shop cannot change the price once accepted', 'select public.shop_quote(''XSD-ZZQ001'', 9999, 0, '''')', 'not a quote request');

-- ================= declining and withdrawing =================
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.run(t_test.order_sql('XSD-ZZQ002', current_setting('t.shop_a'), 'fabric_framed', 120, 3, true));
select t_test.run(t_test.order_sql('XSD-ZZQ003', current_setting('t.shop_a'), 'fabric_stitched', 120, 3, true));
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.fails('declining a request needs a reason', format('select public.shop_order_action(%L, %L)', 'XSD-ZZQ002', 'decline'), 'reason needed');
select public.shop_order_action('XSD-ZZQ002', 'decline', 'We don''t frame this size');
select t_test.ok('the shop declines a request', (select status = 'cancelled' and cancelled_by = 'shop' from t_test.o('XSD-ZZQ002')));
select public.shop_quote('XSD-ZZQ003', 2000, 100, '');
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select public.order_cancel('XSD-ZZQ003');
select t_test.ok('the customer turns a quote down', (select status = 'cancelled' and cancelled_by = 'customer' from t_test.o('XSD-ZZQ003')));

-- ================= ordinary orders are unchanged =================
select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.run(t_test.order_sql('XSD-ZZQ004', current_setting('t.shop_a'), 'fabric_kit', 40, 2, false));
select t_test.run(t_test.order_sql('XSD-ZZQ005', current_setting('t.shop_a'), 'fabric_kit', 250, 1.2, true));
select t_test.ok('a design over 181 × 181 stitches can be ordered (no smallint overflow)', (select status = 'quote_requested' from t_test.o('XSD-ZZQ005')));
select t_test.ok('an ordinary order still takes the rate card price',
  (select status = 'awaiting_accept' and not is_quote and size = 'S' and unit_thb = 300 from t_test.o('XSD-ZZQ004')));
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.fails('an ordinary order cannot be re-priced as a quote', 'select public.shop_quote(''XSD-ZZQ004'', 1, 0, '''')', 'not a quote request');

-- ================= the team cannot change another shop's quoting =================
select t_test.me('00000000-0000-4000-8000-0000000000d1');
update public.shops set quote_materials = '{3d,fabric}' where id = current_setting('t.shop_a')::bigint;
select t_test.ok('a moderator cannot change what another shop quotes',
  (select quote_materials = '{fabric}' from public.shops where id = current_setting('t.shop_a')::bigint));

-- ================= requests and quotes that lapse (at the team's shop) =================
reset role;
update public.shops set quote_materials = '{fabric}' where official;
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c3');
select t_test.run(t_test.order_sql('XSD-ZZQEX1', null, 'fabric_kit', 120, 3, true));
select t_test.ok('a quote request to the team is not accepted by itself', (select status = 'quote_requested' from t_test.o('XSD-ZZQEX1')));
select t_test.run(t_test.order_sql('XSD-ZZQEX2', null, 'fabric_kit', 120, 3, true));
select t_test.run(t_test.order_sql('XSD-ZZQEX3', null, 'fabric_kit', 120, 3, true));
reset role;
-- 1: nobody quoted for 4 days; 2: quoted 4 days ago, never accepted; 3: quoted yesterday
update public.orders set created_at = now() - interval '4 days' where code = 'XSD-ZZQEX1';
update public.orders set status = 'quoted', total_thb = 500, quoted_at = now() - interval '4 days' where code = 'XSD-ZZQEX2';
update public.orders set status = 'quoted', total_thb = 500, quoted_at = now() - interval '1 day' where code = 'XSD-ZZQEX3';
select public.expire_stale_orders();
select t_test.ok('a request nobody quoted in 3 days is cancelled by the system',
  (select status = 'cancelled' and cancelled_by = 'system' and cancel_reason like '%quote within 3 days%' from t_test.o('XSD-ZZQEX1')));
select t_test.ok('a quote not accepted in 3 days is cancelled',
  (select status = 'cancelled' and cancelled_by = 'system' and cancel_reason like '%accepted within 3 days%' from t_test.o('XSD-ZZQEX2')));
select t_test.ok('a quote from yesterday is left alone', (select status = 'quoted' from t_test.o('XSD-ZZQEX3')));
select t_test.ok('an accepted quote waiting for payment is not touched', (select status = 'awaiting_payment' from t_test.o('XSD-ZZQ001')));

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
