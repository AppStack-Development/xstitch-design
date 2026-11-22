-- Permission tests for 0014_post_sales.sql: pricing your own community posts, allowing other shops to make
-- them, and orders made from a post.
--
-- Safe on the real database: one transaction that always ends in an error (the summary), so nothing is kept.
-- Run the whole file in the SQL Editor after the migration; the error message is the result.
--
-- People: A shares patterns and has a shop, B has another shop, D shares patterns but has no shop,
-- C is a customer, M is a moderator.

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

-- an order for a post as the signed-in customer; the browser's copy (70 x 70 at 1.814 mm, 12.7 cm, fabric M)
-- may differ from the post (60 x 60, 10.9 cm, also M)
create function t_test.order_sql(code text, post text, product text, shop text, data text, rights boolean) returns text
language sql as $$
  select format($f$insert into public.orders (code, title, cols, rows, pitch_mm, colors, stitches, data, product, quantity,
    ship_name, ship_phone, ship_address, ship_postcode, terms_version, rights_confirmed, shop_id, post_id)
    values (%L, 'Copy', 70, 70, 1.814, 3, 900, %L, %L, 1, 'Customer', '0811111111',
            '9 Private Road, Secret Town', '10110', '2026-11-22', %L, %s, %L)$f$,
    code, data, product, rights, shop, post);
$$;
grant execute on all functions in schema t_test to anon, authenticated;

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000a1', 'author-a@example.test'),
  ('00000000-0000-4000-8000-0000000000b1', 'shop-b@example.test'),
  ('00000000-0000-4000-8000-0000000000c1', 'customer@example.test'),
  ('00000000-0000-4000-8000-0000000000f1', 'author-d@example.test'),
  ('00000000-0000-4000-8000-0000000000d1', 'moderator@example.test')
on conflict (id) do nothing;
insert into public.moderators (user_id) values ('00000000-0000-4000-8000-0000000000d1') on conflict do nothing;

-- ================= A shares a fabric pattern and has a shop; D shares one without a shop =================
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000a1');
insert into public.creators (user_id, display_name) values (auth.uid(), 'Author A');
insert into public.posts (author, title, base, difficulty, colors, stitches, cols, rows, data)
  values (auth.uid(), 'Test jasmine', 'aida', 'easy', 3, 400, 60, 60, 'the-posted-design-data');
select set_config('t.post_a', (select id from public.posts where author = auth.uid() and title = 'Test jasmine'), true);
insert into public.shops (name, seller_terms, shipping_thb) values ('Test shop A', '2026-11-22', 40);
select set_config('t.shop_a', (select id::text from public.shops where owner_id = auth.uid()), true);
insert into public.shop_payment (shop_id, promptpay_id) values (current_setting('t.shop_a')::bigint, '0812345678');
insert into public.shop_rates (shop_id, product, size, price_thb) values (current_setting('t.shop_a')::bigint, 'fabric_stitched', 'M', 700);

insert into public.post_prices (post_id, product, price_thb) values (current_setting('t.post_a'), 'fabric_kit', 500);
select t_test.ok('the author with a shop prices their post', (select count(*) = 1 from public.post_prices where post_id = current_setting('t.post_a')));
select t_test.fails('only products of the post''s material (no 3D kit for a fabric post)',
  format($$insert into public.post_prices (post_id, product, price_thb) values (%L, 'kit', 100)$$, current_setting('t.post_a')), 'row-level security');

select t_test.me('00000000-0000-4000-8000-0000000000f1');
insert into public.creators (user_id, display_name) values (auth.uid(), 'Author D');
insert into public.posts (author, title, base, difficulty, colors, stitches, cols, rows, data)
  values (auth.uid(), 'Test cat', 'print3d', 'easy', 2, 100, 30, 30, 'another-posted-design');
select set_config('t.post_d', (select id from public.posts where author = auth.uid()), true);
select t_test.fails('an author without a shop cannot price a post',
  format($$insert into public.post_prices (post_id, product, price_thb) values (%L, 'kit', 100)$$, current_setting('t.post_d')), 'row-level security');

select t_test.me('00000000-0000-4000-8000-0000000000b1');
insert into public.shops (name, seller_terms, shipping_thb) values ('Test shop B', '2026-11-22', 30);
select set_config('t.shop_b', (select id::text from public.shops where owner_id = auth.uid()), true);
insert into public.shop_payment (shop_id, promptpay_id) values (current_setting('t.shop_b')::bigint, '0899999999');
insert into public.shop_rates (shop_id, product, size, price_thb) values (current_setting('t.shop_b')::bigint, 'fabric_kit', 'M', 350);
select t_test.fails('another shop cannot price someone else''s post',
  format($$insert into public.post_prices (post_id, product, price_thb) values (%L, 'fabric_stitched', 1)$$, current_setting('t.post_a')), 'row-level security');
update public.post_prices set price_thb = 1 where post_id = current_setting('t.post_a');
update public.posts set allow_making = true where id = current_setting('t.post_a');
reset role;
select t_test.ok('B''s edits to A''s post and its price changed nothing',
  (select pp.price_thb = 500 and not p.allow_making from public.post_prices pp join public.posts p on p.id = pp.post_id where p.id = current_setting('t.post_a')));

set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000d1');
update public.posts set allow_making = true where id = current_setting('t.post_a');
reset role;
select t_test.ok('a moderator cannot allow making on someone else''s post', (select not allow_making from public.posts where id = current_setting('t.post_a')));

set local role anon;
select t_test.me(null);
select t_test.ok('signed-out visitors see a post''s prices', (select count(*) = 1 from public.post_prices where post_id = current_setting('t.post_a')));
select t_test.ok('the post is offered by its author''s shop at its own price',
  (select shop_id = current_setting('t.shop_a')::bigint and product = 'fabric_kit' and unit_thb = 500 from public.post_quotes(current_setting('t.post_a'))));
select t_test.fails('visitors cannot change post prices',
  format($$update public.post_prices set price_thb = 1 where post_id = %L$$, current_setting('t.post_a')), 'permission denied');

-- ================= ordering the post =================
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.run(t_test.order_sql('XSD-ZZTST1', current_setting('t.post_a'), 'fabric_kit', current_setting('t.shop_a'), 'an-edited-copy-of-it', false));
select t_test.ok('at the author''s shop: the post''s price, and the design taken from the post, not the copy',
  (select unit_thb = 500 and total_thb = 540 and data = 'the-posted-design-data' and stitches = 400 and cols = 60 and rights_confirmed
     from public.orders where code = 'XSD-ZZTST1'));
select t_test.run(t_test.order_sql('XSD-ZZTST2', current_setting('t.post_a'), 'fabric_stitched', current_setting('t.shop_a'), 'x-copy-data', false));
select t_test.ok('a product the post isn''t priced for uses the author shop''s rate card (fabric stitched M: 700 + 0 x stitches -> 709)',
  (select unit_thb = 709 from public.orders where code = 'XSD-ZZTST2'));
select t_test.fails('a 3D product cannot be ordered for a fabric post',
  t_test.order_sql('XSD-ZZTST3', current_setting('t.post_a'), 'kit', current_setting('t.shop_a'), 'x-copy-data', true), 'wrong product');
select t_test.fails('another shop cannot make the post unless its author allows it',
  t_test.order_sql('XSD-ZZTST3', current_setting('t.post_a'), 'fabric_kit', current_setting('t.shop_b'), 'x-copy-data', true), 'design not allowed');

select t_test.me('00000000-0000-4000-8000-0000000000a1');
update public.posts set allow_making = true where id = current_setting('t.post_a');
select t_test.ok('the author allows other shops to make it', (select allow_making from public.posts where id = current_setting('t.post_a')));

select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.fails('another shop still needs the customer''s word on the rights',
  t_test.order_sql('XSD-ZZTST3', current_setting('t.post_a'), 'fabric_kit', current_setting('t.shop_b'), 'x-copy-data', false), 'rights not confirmed');
select t_test.run(t_test.order_sql('XSD-ZZTST3', current_setting('t.post_a'), 'fabric_kit', current_setting('t.shop_b'), 'x-copy-data', true));
select t_test.ok('once allowed, another shop makes it at its own rate card price (not the post''s)',
  (select unit_thb = 350 and shop_id = current_setting('t.shop_b')::bigint from public.orders where code = 'XSD-ZZTST3'));

reset role;
update public.posts set status = 'hidden' where id = current_setting('t.post_a');
set local role authenticated;
select t_test.me('00000000-0000-4000-8000-0000000000c1');
select t_test.fails('a hidden post cannot be ordered',
  t_test.order_sql('XSD-ZZTST4', current_setting('t.post_a'), 'fabric_kit', current_setting('t.shop_a'), 'x-copy-data', true), 'design not available');
set local role anon;
select t_test.me(null);
select t_test.ok('and isn''t offered', (select count(*) = 0 from public.post_quotes(current_setting('t.post_a'))));

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
