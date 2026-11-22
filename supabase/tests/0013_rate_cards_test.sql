-- Permission tests for 0013_rate_cards.sql: opening a shop, rate cards, quotes, ordering from any shop,
-- and who can read delivery addresses.
--
-- Safe on the real database: one transaction that always ends in an error (the summary), so nothing is kept.
-- Run the whole file in the SQL Editor after the migration; the error message is the result.
--
-- People: A and B open shops, C1 and C2 are customers, M is a moderator.

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

-- an order as the signed-in customer: 3D pieces are 40 x 40 cells at 2 mm (8 cm, size M),
-- fabric pieces 100 x 100 at 1.814 mm (18 cm, size M); 200 stitches
create function t_test.order_sql(code text, product text, shop text, terms text, rights boolean) returns text
language sql as $$
  select format($f$insert into public.orders (code, title, cols, rows, pitch_mm, colors, stitches, data, product, quantity,
    ship_name, ship_phone, ship_address, ship_postcode, terms_version, rights_confirmed, shop_id)
    values (%L, 'Test', %s, %s, %s, 3, 200, 'test-pattern-data', %L, 1, 'Customer', '0811111111',
            '9 Private Road, Secret Town', '10110', %L, %L, %s)$f$,
    code, case when product like 'fabric%' then 100 else 40 end, case when product like 'fabric%' then 100 else 40 end,
    case when product like 'fabric%' then '1.814' else '2' end, product, terms, rights, coalesce(shop, 'null'));
$$;
grant execute on all functions in schema t_test to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'shop-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'shop-b@example.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'customer-1@example.test'),
  ('00000000-0000-4000-8000-0000000000c2', 'customer-2@example.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'moderator@example.test')
on conflict (id) do nothing;
insert into public.moderators (user_id) values ('00000000-0000-4000-8000-0000000000d1') on conflict do nothing;

-- ================= the team's prices moved to its shop =================
select t_test.ok('the team shop has its prices (from order_config)',
  (select count(*) from public.shop_rates r join public.shops s on s.id = r.shop_id where s.official) >= 3);
select t_test.ok('the team shop keeps its per-stitch rate', (select stitch_rate > 0 from public.shops where official));

-- ================= opening shops =================
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.fails('a shop cannot open without accepting the seller terms',
  $$insert into public.shops (name) values ('Test shop A')$$, 'seller terms not accepted');
insert into public.shops (name, seller_terms, shipping_thb, stitch_rate) values ('Test shop A', '2026-11-22', 40, 0.5);
select set_config('t.shop_a', (select id::text from public.shops where owner_id = auth.uid()), true);
insert into public.shop_rates (shop_id, product, size, price_thb) values
  (current_setting('t.shop_a')::bigint, 'kit', 'M', 200),
  (current_setting('t.shop_a')::bigint, 'stitched', 'M', 300),
  (current_setting('t.shop_a')::bigint, 'fabric_kit', 'M', 400);
update public.shops set seller_terms = '' where owner_id = auth.uid();
select t_test.ok('the seller terms, once accepted, cannot be cleared', (select seller_terms = '2026-11-22' from public.shops where owner_id = auth.uid()));

select t_test.me('00000000-0000-4000-8000-0000000000b1');
insert into public.shops (name, seller_terms) values ('Test shop B', '2026-11-22');
select set_config('t.shop_b', (select id::text from public.shops where owner_id = auth.uid()), true);
insert into public.shop_rates (shop_id, product, size, price_thb) values (current_setting('t.shop_b')::bigint, 'kit', 'M', 100);
update public.shop_rates set price_thb = 1 where shop_id = current_setting('t.shop_a')::bigint;
delete from public.shop_rates where shop_id = current_setting('t.shop_a')::bigint;
select t_test.fails('shop B cannot add prices to shop A',
  format('insert into public.shop_rates (shop_id, product, size, price_thb) values (%s, ''blank'', ''S'', 1)', current_setting('t.shop_a')), 'row-level security');
reset role;
select t_test.ok('shop B''s edits to shop A''s prices changed nothing',
  (select count(*) = 3 and min(price_thb) = 200 from public.shop_rates where shop_id = current_setting('t.shop_a')::bigint));

set local role anon;
select t_test.me(null);
select t_test.ok('signed-out visitors see shop prices', (select count(*) from public.shop_rates where shop_id = current_setting('t.shop_a')::bigint) = 3);
select t_test.fails('signed-out visitors cannot change prices',
  format('update public.shop_rates set price_thb = 1 where shop_id = %s', current_setting('t.shop_a')), 'permission denied');

-- ================= quotes =================
select t_test.ok('a shop without PromptPay is not offered',
  (select count(*) from public.shop_quotes('3d', 40, 40, 2, 200) where shop_id = current_setting('t.shop_a')::bigint) = 0);
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
insert into public.shop_payment (shop_id, promptpay_id, promptpay_name) values (current_setting('t.shop_a')::bigint, '0812345678', 'Shop A');
set local role anon;
select t_test.me(null);
select t_test.ok('with PromptPay, shop A is offered at its own price',
  (select unit_thb = 200 from public.shop_quotes('3d', 40, 40, 2, 200) where shop_id = current_setting('t.shop_a')::bigint and product = 'kit'));
select t_test.ok('stitched adds the per-stitch rate, rounded up to end in 9 (300 + 0.5 x 200 = 400 -> 409)',
  (select unit_thb = 409 from public.shop_quotes('3d', 40, 40, 2, 200) where shop_id = current_setting('t.shop_a')::bigint and product = 'stitched'));
select t_test.ok('the team shop is offered too', (select count(*) > 0 from public.shop_quotes('3d', 40, 40, 2, 200) where official));
select t_test.ok('only sizes a shop prices are offered (no fabric S at shop A)',
  (select count(*) from public.shop_quotes('fabric', 52, 47, 1.814, 200) where shop_id = current_setting('t.shop_a')::bigint) = 0);
select t_test.ok('fabric prices go with fabric sizes (fabric M at shop A)',
  (select unit_thb = 400 from public.shop_quotes('fabric', 100, 100, 1.814, 200) where shop_id = current_setting('t.shop_a')::bigint));
select t_test.ok('3D quotes never list fabric products', (select count(*) from public.shop_quotes('3d', 40, 40, 2, 200) where product like 'fabric%') = 0);
select t_test.ok('a shop with prices but no PromptPay (B) is not offered',
  (select count(*) from public.shop_quotes('3d', 40, 40, 2, 200) where shop_id = current_setting('t.shop_b')::bigint) = 0);

-- ================= ordering from shop A =================
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.fails('another shop needs the customer''s word on the design''s rights',
  t_test.order_sql('XSD-ZZTST1', 'kit', current_setting('t.shop_a'), '2026-11-22', false), 'rights not confirmed');
select t_test.fails('another shop needs the new order terms (sharing the address)',
  t_test.order_sql('XSD-ZZTST1', 'kit', current_setting('t.shop_a'), '2026-11-21', true), 'order terms not accepted');
select t_test.fails('a product the shop doesn''t price cannot be ordered',
  t_test.order_sql('XSD-ZZTST1', 'blank', current_setting('t.shop_a'), '2026-11-22', true), 'no price set');
select t_test.fails('a shop without PromptPay takes no orders',
  t_test.order_sql('XSD-ZZTST1', 'kit', current_setting('t.shop_b'), '2026-11-22', true), 'shop not taking orders');
select t_test.run(t_test.order_sql('XSD-ZZTST1', 'kit', current_setting('t.shop_a'), '2026-11-22', true));
select t_test.ok('an order at shop A: its price and shipping, waiting for the shop',
  (select unit_thb = 200 and shipping_thb = 40 and total_thb = 240 and status = 'awaiting_accept' and size = 'M' and rights_confirmed
     from public.orders where code = 'XSD-ZZTST1'));
select t_test.run(t_test.order_sql('XSD-ZZTST2', 'fabric_kit', current_setting('t.shop_a'), '2026-11-22', true));
select t_test.ok('a fabric order is sized and priced as fabric',
  (select unit_thb = 400 and size = 'M' from public.orders where code = 'XSD-ZZTST2'));
select t_test.run(t_test.order_sql('XSD-ZZTST3', 'kit', null, '2026-11-21', false));
select t_test.ok('the team shop still takes orders the old way (older app: no shop, older terms)',
  (select s.official and o.status = 'awaiting_payment' from public.orders o join public.shops s on s.id = o.shop_id where o.code = 'XSD-ZZTST3'));

-- ================= addresses =================
select t_test.fails('delivery address columns are no longer readable directly',
  $$select ship_address from public.orders where code = 'XSD-ZZTST1'$$, 'permission denied');
select t_test.ok('the other order columns still are', (select count(*) = 1 from public.orders where code = 'XSD-ZZTST1'));
select t_test.ok('the customer reads their own address', (select ship_address = '9 Private Road, Secret Town' from public.order_addresses(array['XSD-ZZTST1'])));
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.ok('shop A reads the address of its open order', (select count(*) = 1 from public.order_addresses(array['XSD-ZZTST1'])));
select t_test.ok('shop A cannot read the address of the team''s order', (select count(*) = 0 from public.order_addresses(array['XSD-ZZTST3'])));
select t_test.me('00000000-0000-4000-8000-0000000000b1');
select t_test.ok('shop B cannot read shop A''s customer address', (select count(*) = 0 from public.order_addresses(array['XSD-ZZTST1', 'XSD-ZZTST2'])));
select t_test.me('00000000-0000-4000-8000-0000000000d1');
select t_test.ok('a moderator cannot read shop A''s customer address', (select count(*) = 0 from public.order_addresses(array['XSD-ZZTST1'])));
select t_test.ok('a moderator reads the team order''s address', (select count(*) = 1 from public.order_addresses(array['XSD-ZZTST3'])));
set local role anon;
select t_test.me(null);
select t_test.fails('signed-out visitors cannot read addresses', $$select * from public.order_addresses(array['XSD-ZZTST1'])$$, 'permission denied');

-- an order closed 31 days ago: the shop no longer sees the address, the customer still does
reset role;
update public.orders set status = 'done', closed_at = now() - interval '31 days' where code = 'XSD-ZZTST2';
update public.orders set closed_at = now() - interval '31 days' where code = 'XSD-ZZTST2';
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.ok('31 days after closing, the shop no longer sees the address', (select count(*) = 0 from public.order_addresses(array['XSD-ZZTST2'])));
select t_test.ok('but still sees the order itself', (select count(*) = 1 from public.orders where code = 'XSD-ZZTST2'));
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.ok('the customer always sees their own address', (select count(*) = 1 from public.order_addresses(array['XSD-ZZTST2'])));

-- ================= accepting, closing, suspending =================
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select public.shop_order_action('XSD-ZZTST1', 'accept');
select t_test.ok('shop A (with PromptPay) accepts', (select status = 'awaiting_payment' from public.orders where code = 'XSD-ZZTST1'));
reset role;
update public.orders set shop_id = current_setting('t.shop_b')::bigint, status = 'awaiting_accept' where code = 'XSD-ZZTST3';
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000b1');
select t_test.fails('a shop without PromptPay cannot accept', $$select public.shop_order_action('XSD-ZZTST3', 'accept')$$, 'set up PromptPay first');

select t_test.me('00000000-0000-4000-8000-0000000000a1');
update public.shops set accepting = false where owner_id = auth.uid();
set local role anon;
select t_test.me(null);
select t_test.ok('a shop closed for now is not offered',
  (select count(*) from public.shop_quotes('3d', 40, 40, 2, 200) where shop_id = current_setting('t.shop_a')::bigint) = 0);
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
update public.shops set accepting = true where owner_id = auth.uid();

select t_test.me('00000000-0000-4000-8000-0000000000d1');
update public.shops set stitch_rate = 9, kit_note = 'changed by mod', suspended = true where id = current_setting('t.shop_a')::bigint;
reset role;
select t_test.ok('a moderator suspends shop A but cannot change its prices or kit note',
  (select suspended and stitch_rate = 0.5 and kit_note = '' from public.shops where id = current_setting('t.shop_a')::bigint));
set local role anon;
select t_test.me(null);
select t_test.ok('a suspended shop is not offered, and its prices are hidden',
  (select count(*) from public.shop_quotes('3d', 40, 40, 2, 200) where shop_id = current_setting('t.shop_a')::bigint) = 0
  and (select count(*) from public.shop_rates where shop_id = current_setting('t.shop_a')::bigint) = 0);

-- ================= a new shop's limit of 3 open orders =================
reset role;
update public.shops set suspended = false where id = current_setting('t.shop_a')::bigint;
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.run(t_test.order_sql('XSD-ZZTSB1', 'kit', current_setting('t.shop_a'), '2026-11-22', true));
select t_test.run(t_test.order_sql('XSD-ZZTSB2', 'kit', current_setting('t.shop_a'), '2026-11-22', true));
set local role anon;
select t_test.me(null);
select t_test.ok('a new shop with 3 open orders is no longer offered',
  (select count(*) from public.shop_quotes('3d', 40, 40, 2, 200) where shop_id = current_setting('t.shop_a')::bigint) = 0);
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.fails('and takes no 4th order', t_test.order_sql('XSD-ZZTSB3', 'kit', current_setting('t.shop_a'), '2026-11-22', true), 'shop is busy');

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
