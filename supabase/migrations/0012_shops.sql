-- XStitch.Design: shops (docs/marketplace.md, phase 1).
--
-- Every order now belongs to a shop, and the shop (not "the team") works it: accepts it, checks the slip,
-- makes and ships it. The team's own production becomes the first shop: official, accepts orders by itself
-- (so customers see no change), owned by the official creator account and worked by moderators.
-- Other people's shops get prices in phase 2 (rate cards); until then only the official shop can be ordered from.
--
-- Who sees what:
--   customer   their own orders, and the shop's PromptPay only while their order waits for payment
--   shop       orders placed with it (with the delivery address and slips), its own notes and payment details
--   moderators the official shop's orders (as its workers); no longer every order
-- Shops change orders only through shop_order_action(); customers through the order_* functions.
-- Permission tests: supabase/tests/0012_shops_test.sql

-- ---------- shops ----------
create table if not exists public.shops (
  id bigint generated always as identity primary key,
  -- one shop per account for now; the shop goes with the account (its orders stay, without a shop)
  owner_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  about text not null default '' check (char_length(about) <= 500),
  -- false = "closed for now": no new orders
  accepting boolean not null default true,
  -- shown to customers, e.g. "5–7 วัน"
  lead_time text not null default '' check (char_length(lead_time) <= 30),
  shipping_thb integer not null default 50 check (shipping_thb between 0 and 2000),
  -- the team's shop; only set here in SQL
  official boolean not null default false,
  -- orders go straight to "awaiting payment"; only set here in SQL
  auto_accept boolean not null default false,
  -- set by moderators; a suspended shop takes no orders and is hidden from others
  suspended boolean not null default false,
  -- version of the seller terms the owner accepted (required for new shops from phase 2)
  seller_terms text not null default '' check (char_length(seller_terms) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists shops_one_official on public.shops (official) where official;

-- true when the signed-in user works this shop: its owner, or a moderator for the official shop
create or replace function public.works_shop(sid bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shops s
     where s.id = sid and (s.owner_id = (select auth.uid()) or (s.official and public.is_moderator()))
  );
$$;
revoke all on function public.works_shop(bigint) from public, anon;
grant execute on function public.works_shop(bigint) to authenticated;

-- owners edit their shop; moderators may only suspend or restore other shops (and edit the official one)
create or replace function public.shops_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.owner_id := (select auth.uid());
      new.official := false;
      new.auto_accept := false;
      new.suspended := false;
    end if;
    new.created_at := now();
  else
    -- only SQL (no signed-in user, e.g. the SQL Editor) changes the owner, official or auto_accept
    if (select auth.uid()) is not null then
      new.owner_id := old.owner_id;
      new.official := old.official;
      new.auto_accept := old.auto_accept;
      if not public.is_moderator() then
        new.suspended := old.suspended;
      elsif old.owner_id is distinct from (select auth.uid()) and not old.official then
        -- a moderator on someone else's shop: only the suspension changes
        new.name := old.name; new.about := old.about; new.accepting := old.accepting;
        new.lead_time := old.lead_time; new.shipping_thb := old.shipping_thb; new.seller_terms := old.seller_terms;
      end if;
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists shops_guard on public.shops;
create trigger shops_guard before insert or update on public.shops
  for each row execute function public.shops_guard();

alter table public.shops enable row level security;
drop policy if exists "anyone sees active shops" on public.shops;
create policy "anyone sees active shops" on public.shops for select to anon using (not suspended);
drop policy if exists "signed-in see shops" on public.shops;
create policy "signed-in see shops" on public.shops for select to authenticated
  using (not suspended or owner_id = (select auth.uid()) or (select public.is_moderator()));
drop policy if exists "open own shop" on public.shops;
create policy "open own shop" on public.shops for insert to authenticated
  with check (owner_id = (select auth.uid()));
drop policy if exists "owner or team edits shop" on public.shops;
create policy "owner or team edits shop" on public.shops for update to authenticated
  using (owner_id = (select auth.uid()) or (select public.is_moderator()))
  with check (owner_id = (select auth.uid()) or (select public.is_moderator()));

revoke all on public.shops from anon, authenticated;
grant select on public.shops to anon, authenticated;
grant insert (name, about, accepting, lead_time, shipping_thb, seller_terms) on public.shops to authenticated;
grant update (name, about, accepting, lead_time, shipping_thb, seller_terms, suspended) on public.shops to authenticated;

-- ---------- a shop's payment details (private) ----------
create table if not exists public.shop_payment (
  shop_id bigint primary key references public.shops (id) on delete cascade,
  -- mobile (10 digits), national/tax id (13) or e-wallet (15); digits only
  promptpay_id text not null default '' check (promptpay_id ~ '^([0-9]{10}|[0-9]{13}|[0-9]{15})?$'),
  promptpay_name text not null default '' check (char_length(promptpay_name) <= 100),
  updated_at timestamptz not null default now()
);
alter table public.shop_payment enable row level security;
drop policy if exists "shop reads payment" on public.shop_payment;
create policy "shop reads payment" on public.shop_payment for select to authenticated
  using ((select public.works_shop(shop_id)));
drop policy if exists "shop adds payment" on public.shop_payment;
create policy "shop adds payment" on public.shop_payment for insert to authenticated
  with check ((select public.works_shop(shop_id)));
drop policy if exists "shop edits payment" on public.shop_payment;
create policy "shop edits payment" on public.shop_payment for update to authenticated
  using ((select public.works_shop(shop_id))) with check ((select public.works_shop(shop_id)));
revoke all on public.shop_payment from anon, authenticated;
grant select on public.shop_payment to authenticated;
grant insert (shop_id, promptpay_id, promptpay_name) on public.shop_payment to authenticated;
grant update (promptpay_id, promptpay_name) on public.shop_payment to authenticated;
drop trigger if exists shop_payment_touch on public.shop_payment;
create trigger shop_payment_touch before update on public.shop_payment
  for each row execute function public.touch_updated_at();

-- ---------- the team's shop, from the official creator account ----------
insert into public.shops (owner_id, name, about, accepting, lead_time, shipping_thb, official, auto_accept, seller_terms)
select c.user_id, 'XStitch.Design', 'ทีมผู้สร้าง XStitch.Design พิมพ์และปักในไทย', true, '5–7 วันทำการ',
       coalesce((select value::int from public.order_config where key = 'shipping'), 50), true, true, 'team'
  from public.creators c
 where c.official
 order by c.created_at
 limit 1
on conflict (owner_id) do update set official = true, auto_accept = true;

do $$
begin
  if not exists (select 1 from public.shops where official) then
    raise exception 'no official creator account to own the team shop; set creators.official first';
  end if;
end $$;

-- the PromptPay customers paid the team with moves to the team shop, and leaves order_config
insert into public.shop_payment (shop_id, promptpay_id, promptpay_name)
select s.id,
       coalesce((select regexp_replace(value, '[^0-9]', '', 'g') from public.order_config where key = 'promptpay_id'), ''),
       coalesce((select value from public.order_config where key = 'promptpay_name'), '')
  from public.shops s where s.official
on conflict (shop_id) do nothing;
delete from public.order_config where key in ('promptpay_id', 'promptpay_name', 'shipping');

-- ---------- orders belong to a shop ----------
alter table public.orders add column if not exists shop_id bigint references public.shops (id) on delete set null;
alter table public.orders add column if not exists accepted_at timestamptz;
alter table public.orders add column if not exists cancel_reason text not null default '' check (char_length(cancel_reason) <= 300);
alter table public.orders add column if not exists cancelled_by text check (cancelled_by is null or cancelled_by in ('customer', 'shop', 'system'));
-- a shop cancelling a paid order confirms it has refunded the customer
alter table public.orders add column if not exists refund_confirmed boolean not null default false;
create index if not exists orders_by_shop on public.orders (shop_id, status, created_at desc);

update public.orders set shop_id = (select id from public.shops where official) where shop_id is null;
update public.orders set accepted_at = created_at where accepted_at is null and status <> 'cancelled';

-- a new first step: the shop accepts (or declines) the order before the customer pays
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('awaiting_accept', 'awaiting_payment', 'payment_review', 'paid', 'in_production', 'shipped', 'done', 'cancelled'));

grant insert (shop_id) on public.orders to authenticated;

-- on insert: the shop must be taking orders; price and shipping come from the database, never the client.
-- Same as 0011, plus the shop. Until phase 2 only the official shop has prices (order_config).
create or replace function public.orders_prepare() returns trigger
language plpgsql security definer set search_path = '' as $$
declare unit int; s public.shops;
begin
  if coalesce(btrim(new.terms_version), '') = '' then
    raise exception 'order terms not accepted' using errcode = 'P0001';
  end if;
  if not public.is_moderator() and (
    select count(*) from public.orders where user_id = (select auth.uid()) and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'too many orders in an hour' using errcode = 'P0001';
  end if;
  if new.stitches < 1 or new.stitches > new.cols * new.rows then
    raise exception 'bad stitch count' using errcode = 'P0001';
  end if;
  -- an order without a shop (an older app) goes to the team, as it always did
  if new.shop_id is null then select id into new.shop_id from public.shops where official; end if;
  select * into s from public.shops where id = new.shop_id;
  if not found or s.suspended or not s.accepting then
    raise exception 'shop not taking orders' using errcode = 'P0001';
  end if;
  -- a new shop has at most 3 open orders until it has delivered 3
  if not s.official
     and (select count(*) from public.orders where shop_id = s.id and status = 'done') < 3
     and (select count(*) from public.orders where shop_id = s.id and status not in ('done', 'cancelled')) >= 3 then
    raise exception 'shop is busy' using errcode = 'P0001';
  end if;
  new.size := public.order_size(new.cols, new.rows, new.pitch_mm);
  if new.size is null then raise exception 'piece too large' using errcode = 'P0001'; end if;
  unit := case when s.official then public.order_unit_price(new.product, new.size, new.stitches) end;
  if unit is null then raise exception 'no price set' using errcode = 'P0001'; end if;
  new.unit_thb := unit;
  new.shipping_thb := s.shipping_thb;
  new.total_thb := unit * new.quantity + s.shipping_thb;
  new.created_at := now();
  new.updated_at := now();
  new.status := case when s.auto_accept then 'awaiting_payment' else 'awaiting_accept' end;
  new.accepted_at := case when s.auto_accept then now() end;
  new.cancel_reason := ''; new.cancelled_by := null; new.refund_confirmed := false;
  new.slip_path := null; new.slip_at := null; new.paid_at := null;
  new.tracking_carrier := ''; new.tracking_no := ''; new.shipped_at := null; new.closed_at := null;
  return new;
end $$;

-- on update: timestamps that follow the status (same as 0006, plus accepted_at)
create or replace function public.orders_track() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    if old.status = 'awaiting_accept' and new.status = 'awaiting_payment' then new.accepted_at := now(); end if;
    if new.status = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
    if new.status = 'shipped' then new.shipped_at := now(); end if;
    if new.status in ('done', 'cancelled') then new.closed_at := now(); else new.closed_at := null; end if;
  end if;
  return new;
end $$;

-- who sees an order: the customer and the shop's workers (moderators only for the official shop)
drop policy if exists "own orders or team" on public.orders;
drop policy if exists "customer or shop sees order" on public.orders;
create policy "customer or shop sees order" on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.works_shop(shop_id)));
-- no one updates orders directly any more: shops use shop_order_action(), customers the order_* functions
drop policy if exists "team works orders" on public.orders;
revoke update on public.orders from authenticated;

-- ---------- the shop's side ----------
-- action: accept | decline | slip_ok | slip_bad | start | ship | cancel | set_status (the team, official shop only)
create or replace function public.shop_order_action(
  order_code text, action text, reason text default '', carrier text default '', tracking text default '',
  refunded boolean default false, new_status text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders; s public.shops; why text := btrim(coalesce(reason, ''));
begin
  select * into o from public.orders where code = order_code for update;
  if not found or not public.works_shop(o.shop_id) then
    raise exception 'order not found' using errcode = 'P0001';
  end if;
  select * into s from public.shops where id = o.shop_id;
  if char_length(why) > 300 then raise exception 'reason too long' using errcode = 'P0001'; end if;

  if action = 'accept' then
    if o.status <> 'awaiting_accept' then raise exception 'order is not waiting for the shop' using errcode = 'P0001'; end if;
    update public.orders set status = 'awaiting_payment' where id = o.id;
  elsif action = 'decline' then
    if o.status <> 'awaiting_accept' then raise exception 'order is not waiting for the shop' using errcode = 'P0001'; end if;
    if why = '' then raise exception 'reason needed' using errcode = 'P0001'; end if;
    update public.orders set status = 'cancelled', cancelled_by = 'shop', cancel_reason = why where id = o.id;
  elsif action in ('slip_ok', 'slip_bad') then
    if o.status <> 'payment_review' then raise exception 'no slip to check' using errcode = 'P0001'; end if;
    update public.orders set status = case when action = 'slip_ok' then 'paid' else 'awaiting_payment' end where id = o.id;
  elsif action = 'start' then
    if o.status <> 'paid' then raise exception 'order is not paid' using errcode = 'P0001'; end if;
    update public.orders set status = 'in_production' where id = o.id;
  elsif action = 'ship' then
    if o.status not in ('in_production', 'shipped') then raise exception 'order is not being made' using errcode = 'P0001'; end if;
    if btrim(coalesce(tracking, '')) = '' then raise exception 'tracking number needed' using errcode = 'P0001'; end if;
    update public.orders set status = 'shipped',
      tracking_carrier = left(btrim(coalesce(carrier, '')), 40), tracking_no = left(btrim(tracking), 60) where id = o.id;
  elsif action = 'cancel' then
    if o.status in ('done', 'cancelled') then raise exception 'order is closed' using errcode = 'P0001'; end if;
    if why = '' then raise exception 'reason needed' using errcode = 'P0001'; end if;
    if o.paid_at is not null and not refunded then raise exception 'refund not confirmed' using errcode = 'P0001'; end if;
    update public.orders set status = 'cancelled', cancelled_by = 'shop', cancel_reason = why,
      refund_confirmed = (o.paid_at is not null) where id = o.id;
  elsif action = 'set_status' then
    -- the team's escape hatch for its own shop (fixing a mistake); not for other shops
    if not (s.official and public.is_moderator()) then raise exception 'not allowed' using errcode = 'P0001'; end if;
    if new_status is null or new_status not in
      ('awaiting_accept', 'awaiting_payment', 'payment_review', 'paid', 'in_production', 'shipped', 'done', 'cancelled') then
      raise exception 'bad status' using errcode = 'P0001';
    end if;
    update public.orders set status = new_status where id = o.id;
  else
    raise exception 'unknown action' using errcode = 'P0001';
  end if;
end $$;
revoke all on function public.shop_order_action(text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.shop_order_action(text, text, text, text, text, boolean, text) to authenticated;

-- ---------- the customer's side ----------
-- cancel before paying: while the shop decides, or after it accepted but before a slip is sent
create or replace function public.order_cancel(order_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set status = 'cancelled', cancelled_by = 'customer'
   where code = order_code and user_id = (select auth.uid()) and status in ('awaiting_accept', 'awaiting_payment');
  if not found then raise exception 'order cannot be cancelled' using errcode = 'P0001'; end if;
end $$;

-- the shop's PromptPay, only for the order's customer and only while the order waits for payment
create or replace function public.order_payment(order_code text)
returns table (promptpay_id text, promptpay_name text)
language sql stable security definer set search_path = '' as $$
  select p.promptpay_id, p.promptpay_name
    from public.orders o join public.shop_payment p on p.shop_id = o.shop_id
   where o.code = order_code and o.user_id = (select auth.uid())
     and o.status in ('awaiting_payment', 'payment_review');
$$;
revoke all on function public.order_payment(text) from public, anon;
grant execute on function public.order_payment(text) to authenticated;

-- ---------- notes, messages and slips follow the shop ----------
drop policy if exists "team notes" on public.order_notes;
drop policy if exists "shop notes" on public.order_notes;
create policy "shop notes" on public.order_notes for all to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.works_shop(o.shop_id)))
  with check (exists (select 1 from public.orders o where o.id = order_id and public.works_shop(o.shop_id)));

-- from_team now means "from the shop"
create or replace function public.order_messages_prepare() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = new.order_id;
  new.author_id := (select auth.uid());
  new.created_at := now();
  -- someone working the shop, writing on an order that isn't their own, speaks for the shop
  new.from_team := public.works_shop(o.shop_id) and o.user_id is distinct from new.author_id;
  if not new.from_team and (
    select count(*) from public.order_messages where author_id = new.author_id and created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'too many messages in an hour' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop policy if exists "order people read messages" on public.order_messages;
create policy "order people read messages" on public.order_messages for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.user_id = (select auth.uid()) or public.works_shop(o.shop_id))));
drop policy if exists "order people write messages" on public.order_messages;
create policy "order people write messages" on public.order_messages for insert to authenticated
  with check (exists (select 1 from public.orders o where o.id = order_id
                      and (o.user_id = (select auth.uid()) or public.works_shop(o.shop_id))));

-- slips: the customer who uploaded them, and the shop the order went to (not every moderator)
drop policy if exists "read own slips or team" on storage.objects;
drop policy if exists "read own slips or the shop's" on storage.objects;
create policy "read own slips or the shop's" on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.orders o where o.slip_path = storage.objects.name and public.works_shop(o.shop_id))
  ));

-- ---------- order emails (supabase/functions/order-alert) need the shop ----------
grant select on public.shops to service_role;
