-- Permission tests for 0012_shops.sql: who can see and change shops, orders, slips, messages and notes.
--
-- Safe on the real database: it all runs in one transaction that always ends in an error (the summary), so
-- nothing is kept: not the test users, shops, orders, messages, or the order emails (pg_net queues them
-- inside the transaction). Run the whole file in the SQL Editor after the migration; the error message at
-- the end is the result: "ALL n PERMISSION TESTS PASSED" or "k of n FAILED" with the list.
--
-- People: A and B own shops, C1 and C2 are customers, M is a moderator (works the official shop only).

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

-- the signed-in user for what follows (null = signed out)
create function t_test.me(uid uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  perform set_config('request.jwt.claims', case when uid is null then '' else json_build_object('sub', uid, 'role', 'authenticated')::text end, true);
end $$;
grant execute on all functions in schema t_test to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'shop-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'shop-b@example.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'customer-1@example.test'),
  ('00000000-0000-4000-8000-0000000000c2', 'customer-2@example.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'moderator@example.test')
on conflict (id) do nothing;
insert into public.moderators (user_id) values ('00000000-0000-4000-8000-0000000000d1') on conflict do nothing;

-- ================= shops =================
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
insert into public.shops (name, lead_time) values ('Test shop A', '3 days');
insert into public.shop_payment (shop_id, promptpay_id, promptpay_name)
  select id, '0812345678', 'Shop A' from public.shops where owner_id = auth.uid();
select t_test.ok('A opens a shop: owned by A, not official, not auto-accepting',
  (select count(*) = 1 and bool_and(not official and not auto_accept and not suspended) from public.shops where owner_id = auth.uid()));
select t_test.fails('A cannot make their shop official', 'update public.shops set official = true where owner_id = auth.uid()', 'permission denied');
select t_test.fails('A cannot set auto-accept', 'update public.shops set auto_accept = true where owner_id = auth.uid()', 'permission denied');
update public.shops set suspended = true where owner_id = auth.uid();
select t_test.ok('A cannot suspend (or later restore) their own shop', (select not suspended from public.shops where owner_id = auth.uid()));
select t_test.fails('A cannot open a second shop', $$insert into public.shops (name) values ('Second shop')$$, 'duplicate');

select t_test.me('00000000-0000-4000-8000-0000000000b1');
insert into public.shops (name) values ('Test shop B');
insert into public.shop_payment (shop_id, promptpay_id) select id, '0899999999' from public.shops where owner_id = auth.uid();
select t_test.ok('B cannot read shop A''s PromptPay',
  (select count(*) from public.shop_payment p join public.shops s on s.id = p.shop_id where s.name = 'Test shop A') = 0);
update public.shop_payment set promptpay_id = '0800000000' where shop_id = (select id from public.shops where name = 'Test shop A');
update public.shops set name = 'Hacked' where name = 'Test shop A';
select t_test.fails('B cannot add payment details to shop A',
  $$insert into public.shop_payment (shop_id, promptpay_id) select id, '0800000000' from public.shops where name = 'Test shop A'$$, 'row-level security');

reset role;
select t_test.ok('B''s edits to shop A changed nothing',
  (select s.name = 'Test shop A' and p.promptpay_id = '0812345678' from public.shops s join public.shop_payment p on p.shop_id = s.id where s.owner_id = '00000000-0000-4000-8000-0000000000a1'));
select set_config('t.shop_a', (select id::text from public.shops where name = 'Test shop A'), true);
select set_config('t.shop_b', (select id::text from public.shops where name = 'Test shop B'), true);

set local role anon;
select t_test.me(null);
select t_test.ok('signed-out visitors see open shops', (select count(*) from public.shops where name in ('Test shop A', 'Test shop B')) = 2);
select t_test.fails('signed-out visitors cannot read payment details', 'select 1 from public.shop_payment', 'permission denied');
select t_test.fails('signed-out visitors cannot read orders', 'select 1 from public.orders', 'permission denied');

-- ================= orders =================
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c1');
insert into public.orders (code, title, cols, rows, pitch_mm, colors, stitches, data, product, quantity,
  ship_name, ship_phone, ship_address, ship_postcode, terms_version)
values ('XSD-ZZTST1', 'Test 1', 10, 10, 3, 1, 50, 'test-pattern-data', 'blank', 1,
  'Customer One', '0811111111', '1 Test Road, Test District', '10110', 'test');
select t_test.ok('an order without a shop goes to the team shop, already accepted, with its shipping',
  (select o.status = 'awaiting_payment' and o.accepted_at is not null and s.official and o.shipping_thb = s.shipping_thb
     from public.orders o join public.shops s on s.id = o.shop_id where o.code = 'XSD-ZZTST1'));
select t_test.fails('nobody can order from shop A until it has prices (phase 2)',
  format($$insert into public.orders (code, title, cols, rows, pitch_mm, colors, stitches, data, product, quantity,
    ship_name, ship_phone, ship_address, ship_postcode, terms_version, shop_id)
    values ('XSD-ZZTST9', 'x', 10, 10, 3, 1, 50, 'test-pattern-data', 'blank', 1, 'x', '0811111111', '1 Test Road, Test', '10110', 'test', %s)$$,
    current_setting('t.shop_a')), 'no price set');

select t_test.me('00000000-0000-4000-8000-0000000000c2');
insert into public.orders (code, title, cols, rows, pitch_mm, colors, stitches, data, product, quantity,
  ship_name, ship_phone, ship_address, ship_postcode, terms_version)
values ('XSD-ZZTST2', 'Test 2', 10, 10, 3, 1, 50, 'test-pattern-data', 'blank', 1,
  'Customer Two', '0822222222', '2 Private Lane, Secret District', '10220', 'test');

-- move C2's order to shop A, waiting for A (as a phase 2 order would be)
reset role;
update public.orders set shop_id = current_setting('t.shop_a')::bigint, status = 'awaiting_accept', accepted_at = null where code = 'XSD-ZZTST2';
select set_config('t.o2', (select id::text from public.orders where code = 'XSD-ZZTST2'), true);
select set_config('t.o1', (select id::text from public.orders where code = 'XSD-ZZTST1'), true);

set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.ok('C1 sees their own order', (select count(*) from public.orders where code = 'XSD-ZZTST1') = 1);
select t_test.ok('C1 cannot see C2''s order', (select count(*) from public.orders where code = 'XSD-ZZTST2') = 0);

select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.ok('shop A sees the order placed with it, with the delivery address',
  (select ship_address = '2 Private Lane, Secret District' from public.orders where code = 'XSD-ZZTST2'));
select t_test.ok('shop A cannot see the team''s order', (select count(*) from public.orders where code = 'XSD-ZZTST1') = 0);

select t_test.me('00000000-0000-4000-8000-0000000000b1');
select t_test.ok('shop B cannot see shop A''s order', (select count(*) from public.orders where code = 'XSD-ZZTST2') = 0);
select t_test.fails('shop B cannot accept shop A''s order', $$select public.shop_order_action('XSD-ZZTST2', 'accept')$$, 'order not found');

select t_test.me('00000000-0000-4000-8000-0000000000d1');
select t_test.ok('a moderator sees the team shop''s orders', (select count(*) from public.orders where code = 'XSD-ZZTST1') = 1);
select t_test.ok('a moderator cannot see shop A''s orders', (select count(*) from public.orders where code = 'XSD-ZZTST2') = 0);
select t_test.fails('a moderator cannot force a status on shop A''s order',
  $$select public.shop_order_action('XSD-ZZTST2', 'set_status', new_status => 'paid')$$, 'order not found');

select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.ok('no PromptPay before the shop accepts', (select count(*) from public.order_payment('XSD-ZZTST2')) = 0);
select t_test.fails('a customer cannot accept their own order', $$select public.shop_order_action('XSD-ZZTST2', 'accept')$$, 'order not found');
select t_test.fails('customers cannot change orders directly', $$update public.orders set status = 'paid' where code = 'XSD-ZZTST2'$$, 'permission denied');
select t_test.fails('customers cannot change the shop of an order', $$update public.orders set shop_id = null where code = 'XSD-ZZTST2'$$, 'permission denied');

-- ================= the flow at shop A =================
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.fails('declining needs a reason', $$select public.shop_order_action('XSD-ZZTST2', 'decline')$$, 'reason needed');
select public.shop_order_action('XSD-ZZTST2', 'accept');
select t_test.ok('A accepts: waiting for payment, accepted time set',
  (select status = 'awaiting_payment' and accepted_at is not null from public.orders where code = 'XSD-ZZTST2'));

select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.ok('after accepting, C2 sees shop A''s PromptPay',
  (select promptpay_id = '0812345678' from public.order_payment('XSD-ZZTST2')));
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.ok('another customer never sees it', (select count(*) from public.order_payment('XSD-ZZTST2')) = 0);

reset role;
insert into storage.objects (bucket_id, name) values ('payment-slips', '00000000-0000-4000-8000-0000000000c2/XSD-ZZTST2/1.jpg');
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c2');
select public.order_submit_slip('XSD-ZZTST2', '00000000-0000-4000-8000-0000000000c2/XSD-ZZTST2/1.jpg');
select t_test.ok('C2 sends a slip', (select status = 'payment_review' from public.orders where code = 'XSD-ZZTST2'));
select t_test.ok('C2 sees their slip', (select count(*) from storage.objects where name like '%/XSD-ZZTST2/%') = 1);
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.ok('shop A sees the slip for its order', (select count(*) from storage.objects where name like '%/XSD-ZZTST2/%') = 1);
select t_test.me('00000000-0000-4000-8000-0000000000b1');
select t_test.ok('shop B cannot see it', (select count(*) from storage.objects where name like '%/XSD-ZZTST2/%') = 0);
select t_test.me('00000000-0000-4000-8000-0000000000d1');
select t_test.ok('a moderator cannot see it', (select count(*) from storage.objects where name like '%/XSD-ZZTST2/%') = 0);

select t_test.me('00000000-0000-4000-8000-0000000000a1');
select public.shop_order_action('XSD-ZZTST2', 'slip_ok');
select t_test.ok('A confirms payment', (select status = 'paid' and paid_at is not null from public.orders where code = 'XSD-ZZTST2'));
select t_test.fails('cancelling a paid order needs the refund confirmed',
  $$select public.shop_order_action('XSD-ZZTST2', 'cancel', reason => 'out of stock')$$, 'refund not confirmed');
select t_test.fails('cannot ship before starting', $$select public.shop_order_action('XSD-ZZTST2', 'ship', tracking => 'TH1')$$, 'not being made');
select public.shop_order_action('XSD-ZZTST2', 'start');
select t_test.fails('shipping needs a tracking number', $$select public.shop_order_action('XSD-ZZTST2', 'ship')$$, 'tracking number needed');
select public.shop_order_action('XSD-ZZTST2', 'ship', carrier => 'Thailand Post', tracking => 'EF123456789TH');
select t_test.ok('A ships with tracking', (select status = 'shipped' and tracking_no = 'EF123456789TH' from public.orders where code = 'XSD-ZZTST2'));

select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.ok('no PromptPay once paid', (select count(*) from public.order_payment('XSD-ZZTST2')) = 0);
select public.order_received('XSD-ZZTST2');
select t_test.ok('C2 marks it received', (select status = 'done' from public.orders where code = 'XSD-ZZTST2'));

-- ================= messages and notes =================
insert into public.order_messages (order_id, body) values (current_setting('t.o2')::bigint, 'Hello shop');
select t_test.me('00000000-0000-4000-8000-0000000000a1');
insert into public.order_messages (order_id, body) values (current_setting('t.o2')::bigint, 'Hello customer');
select t_test.ok('the customer''s message is from the customer, the shop''s from the shop',
  (select bool_and(from_team = (body = 'Hello customer')) and count(*) = 2 from public.order_messages where order_id = current_setting('t.o2')::bigint));
insert into public.order_notes (order_id, note) values (current_setting('t.o2')::bigint, 'shop A private note');
select t_test.ok('shop A keeps a private note', (select count(*) from public.order_notes where order_id = current_setting('t.o2')::bigint) = 1);

select t_test.me('00000000-0000-4000-8000-0000000000b1');
select t_test.ok('shop B cannot read the messages', (select count(*) from public.order_messages where order_id = current_setting('t.o2')::bigint) = 0);
select t_test.fails('shop B cannot write on the order',
  format('insert into public.order_messages (order_id, body) values (%s, ''spam'')', current_setting('t.o2')), 'row-level security');
select t_test.fails('shop B cannot add a note', format('insert into public.order_notes (order_id, note) values (%s, ''x'')', current_setting('t.o2')), 'row-level security');
select t_test.ok('shop B cannot read the note', (select count(*) from public.order_notes where order_id = current_setting('t.o2')::bigint) = 0);

select t_test.me('00000000-0000-4000-8000-0000000000d1');
select t_test.ok('a moderator cannot read shop A''s messages', (select count(*) from public.order_messages where order_id = current_setting('t.o2')::bigint) = 0);
select t_test.ok('a moderator cannot read shop A''s note', (select count(*) from public.order_notes where order_id = current_setting('t.o2')::bigint) = 0);

select t_test.me('00000000-0000-4000-8000-0000000000c2');
select t_test.ok('the customer cannot read the shop''s note', (select count(*) from public.order_notes where order_id = current_setting('t.o2')::bigint) = 0);

-- ================= the team's shop =================
select t_test.me('00000000-0000-4000-8000-0000000000c1');
insert into public.order_messages (order_id, body) values (current_setting('t.o1')::bigint, 'Question for the team');
select t_test.me('00000000-0000-4000-8000-0000000000d1');
select t_test.ok('a moderator reads messages on the team shop''s orders', (select count(*) from public.order_messages where order_id = current_setting('t.o1')::bigint) = 1);
insert into public.order_messages (order_id, body) values (current_setting('t.o1')::bigint, 'Answer from the team');
select t_test.ok('a moderator writes for the team shop', (select from_team from public.order_messages where body = 'Answer from the team'));
select public.shop_order_action('XSD-ZZTST1', 'set_status', new_status => 'in_production');
select t_test.ok('a moderator can still set any status on the team shop''s orders', (select status = 'in_production' from public.orders where code = 'XSD-ZZTST1'));
select t_test.fails('a moderator cannot make another shop official', 'update public.shops set official = true where name = ''Test shop A''', 'permission denied');

-- a moderator suspends shop A: only the suspension changes
update public.shops set suspended = true, name = 'Renamed by mod' where name = 'Test shop A';
reset role;
select t_test.ok('a moderator suspends shop A without changing anything else',
  (select suspended and name = 'Test shop A' from public.shops where id = current_setting('t.shop_a')::bigint));
set local role anon;
select t_test.me(null);
select t_test.ok('a suspended shop is hidden from visitors', (select count(*) from public.shops where id = current_setting('t.shop_a')::bigint) = 0);
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
select t_test.ok('its owner still sees it (and its orders)',
  (select count(*) from public.shops where id = current_setting('t.shop_a')::bigint) = 1
  and (select count(*) from public.orders where code = 'XSD-ZZTST2') = 1);
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.fails('nobody can order from a suspended shop',
  format($$insert into public.orders (code, title, cols, rows, pitch_mm, colors, stitches, data, product, quantity,
    ship_name, ship_phone, ship_address, ship_postcode, terms_version, shop_id)
    values ('XSD-ZZTST8', 'x', 10, 10, 3, 1, 50, 'test-pattern-data', 'blank', 1, 'x', '0811111111', '1 Test Road, Test', '10110', 'test', %s)$$,
    current_setting('t.shop_a')), 'shop not taking orders');

-- ================= a new shop's limit of 3 open orders =================
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c2');
insert into public.orders (code, title, cols, rows, pitch_mm, colors, stitches, data, product, quantity,
  ship_name, ship_phone, ship_address, ship_postcode, terms_version)
select 'XSD-ZZTSB' || n, 'B' || n, 10, 10, 3, 1, 50, 'test-pattern-data', 'blank', 1,
  'Customer Two', '0822222222', '2 Private Lane, Secret District', '10220', 'test'
  from generate_series(1, 3) n;
reset role;
update public.orders set shop_id = current_setting('t.shop_b')::bigint, status = 'awaiting_accept' where code like 'XSD-ZZTSB%';
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.fails('a new shop with 3 open orders takes no more',
  format($$insert into public.orders (code, title, cols, rows, pitch_mm, colors, stitches, data, product, quantity,
    ship_name, ship_phone, ship_address, ship_postcode, terms_version, shop_id)
    values ('XSD-ZZTST7', 'x', 10, 10, 3, 1, 50, 'test-pattern-data', 'blank', 1, 'x', '0811111111', '1 Test Road, Test', '10110', 'test', %s)$$,
    current_setting('t.shop_b')), 'shop is busy');

-- ================= customers cancelling =================
select t_test.me('00000000-0000-4000-8000-0000000000c2');
select public.order_cancel('XSD-ZZTSB1');
select t_test.ok('a customer cancels while the shop hasn''t answered',
  (select status = 'cancelled' and cancelled_by = 'customer' from public.orders where code = 'XSD-ZZTSB1'));
select t_test.fails('a customer cannot cancel after paying', $$select public.order_cancel('XSD-ZZTST2')$$, 'cannot be cancelled');
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.fails('a customer cannot cancel someone else''s order', $$select public.order_cancel('XSD-ZZTSB2')$$, 'cannot be cancelled');

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
