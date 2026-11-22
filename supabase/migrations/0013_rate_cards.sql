-- XStitch.Design: rate cards and choosing a shop (docs/marketplace.md, phase 2).
--
-- Every shop sets its own prices (shop_rates): per product and size, blank = not offered, plus a per-stitch
-- rate for stitched pieces. Customers bring their own design and see every shop that can make it, priced
-- (shop_quotes). Fabric patterns can be ordered now too. Anyone signed in can open a shop by accepting the
-- seller terms. The team's prices move from order_config to its shop (order_config isn't read any more).
--
-- New rules for shops other than the team's:
--   - the order must carry the new order terms (sharing the delivery details with the shop) and the
--     customer's word that they may have the design made (rights_confirmed)
--   - a shop needs PromptPay before it shows up or accepts an order
-- Delivery addresses: the customer always sees theirs; a shop sees it until 30 days after the order closes.
-- They are read only through order_addresses(); the columns themselves are no longer selectable.
-- Permission tests: supabase/tests/0013_rate_cards_test.sql

-- ---------- products and sizes per material ----------
alter table public.orders drop constraint if exists orders_product_check;
alter table public.orders add constraint orders_product_check check (product in
  ('blank', 'kit', 'stitched', 'fabric_kit', 'fabric_stitched', 'fabric_framed'));

create or replace function public.material_of(product text) returns text
language sql immutable set search_path = '' as $$
  select case when product like 'fabric\_%' then 'fabric' else '3d' end;
$$;

-- size class by the longest side in mm: 3D pieces up to 18 cm (the printers), fabric up to 30 cm.
-- Keep in step with SIZE_LIMITS in src/lib/orders.ts.
create or replace function public.piece_size(material text, cols int, rows int, pitch numeric) returns text
language sql immutable set search_path = '' as $$
  select case
    when material = 'fabric' then case
      when greatest(cols, rows) * pitch <= 100 then 'S'
      when greatest(cols, rows) * pitch <= 200 then 'M'
      when greatest(cols, rows) * pitch <= 300 then 'L' end
    else case
      when greatest(cols, rows) * pitch <= 75 then 'S'
      when greatest(cols, rows) * pitch <= 120 then 'M'
      when greatest(cols, rows) * pitch <= 180 then 'L' end
  end;
$$;

-- ---------- rate cards ----------
alter table public.shops add column if not exists stitch_rate numeric(4, 2) not null default 0 check (stitch_rate between 0 and 99.99);
-- what the shop's kits include, shown to customers
alter table public.shops add column if not exists kit_note text not null default '' check (char_length(kit_note) <= 300);
grant insert (stitch_rate, kit_note), update (stitch_rate, kit_note) on public.shops to authenticated;

create table if not exists public.shop_rates (
  shop_id bigint not null references public.shops (id) on delete cascade,
  product text not null check (product in ('blank', 'kit', 'stitched', 'fabric_kit', 'fabric_stitched', 'fabric_framed')),
  size text not null check (size in ('S', 'M', 'L')),
  price_thb integer not null check (price_thb between 1 and 100000),
  primary key (shop_id, product, size)
);
alter table public.shop_rates enable row level security;
-- prices are public, like a shop window
drop policy if exists "anyone sees prices" on public.shop_rates;
create policy "anyone sees prices" on public.shop_rates for select to anon, authenticated
  using (exists (select 1 from public.shops s where s.id = shop_id));
drop policy if exists "shop sets prices" on public.shop_rates;
create policy "shop sets prices" on public.shop_rates for all to authenticated
  using ((select public.works_shop(shop_id))) with check ((select public.works_shop(shop_id)));
revoke all on public.shop_rates from anon, authenticated;
grant select on public.shop_rates to anon, authenticated;
grant insert, update, delete on public.shop_rates to authenticated;

-- the team's prices and per-stitch rate move to its shop
insert into public.shop_rates (shop_id, product, size, price_thb)
select s.id, split_part(c.key, ':', 2), split_part(c.key, ':', 3), c.value::int
  from public.order_config c cross join public.shops s
 where s.official and c.key ~ '^price:(blank|kit|stitched):(S|M|L)$' and c.value ~ '^[0-9]{1,6}$' and c.value::int > 0
on conflict (shop_id, product, size) do nothing;
update public.shops set stitch_rate = (select value::numeric from public.order_config where key = 'stitch_rate')
 where official and stitch_rate = 0 and exists (select 1 from public.order_config where key = 'stitch_rate');

-- baht per piece at a shop: the listed price; stitched pieces add the per-stitch rate and round up to end in 9
-- (as 0011 did for the team). Null = the shop doesn't offer it.
create or replace function public.shop_unit_price(sid bigint, p_product text, p_size text, p_stitches int) returns int
language plpgsql stable security definer set search_path = '' as $$
declare base int; rate numeric;
begin
  select price_thb into base from public.shop_rates where shop_id = sid and product = p_product and size = p_size;
  if base is null then return null; end if;
  if p_product not in ('stitched', 'fabric_stitched', 'fabric_framed') then return base; end if;
  select stitch_rate into rate from public.shops where id = sid;
  return (ceil((base + coalesce(rate, 0) * p_stitches + 1) / 10.0) * 10 - 1)::int;
end $$;
revoke all on function public.shop_unit_price(bigint, text, text, int) from public;
grant execute on function public.shop_unit_price(bigint, text, text, int) to anon, authenticated;

-- a shop can be ordered from: open, not suspended, PromptPay set, seller terms accepted, and (if new) not full
create or replace function public.shop_open_for_orders(sid bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shops s
     where s.id = sid and s.accepting and not s.suspended and (s.official or btrim(s.seller_terms) <> '')
       and exists (select 1 from public.shop_payment p where p.shop_id = s.id and p.promptpay_id <> '')
       and (s.official
            or (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'done') >= 3
            or (select count(*) from public.orders o where o.shop_id = s.id and o.status not in ('done', 'cancelled')) < 3)
  );
$$;
revoke all on function public.shop_open_for_orders(bigint) from public;
grant execute on function public.shop_open_for_orders(bigint) to anon, authenticated;

-- every shop that can make this piece, with its price for each product it offers at this size
create or replace function public.shop_quotes(p_material text, p_cols int, p_rows int, p_pitch numeric, p_stitches int)
returns table (shop_id bigint, shop_name text, about text, lead_time text, shipping_thb int, official boolean,
               kit_note text, delivered bigint, opened_at timestamptz, product text, unit_thb int)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.about, s.lead_time, s.shipping_thb, s.official, s.kit_note,
         (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'done'),
         s.created_at, r.product, public.shop_unit_price(s.id, r.product, r.size, p_stitches)
    from public.shops s join public.shop_rates r on r.shop_id = s.id
   where r.size = public.piece_size(p_material, p_cols, p_rows, p_pitch)
     and public.material_of(r.product) = p_material
     and public.shop_open_for_orders(s.id);
$$;
revoke all on function public.shop_quotes(text, int, int, numeric, int) from public;
grant execute on function public.shop_quotes(text, int, int, numeric, int) to anon, authenticated;

-- ---------- opening a shop needs the seller terms ----------
create or replace function public.shops_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is not null then
      new.owner_id := (select auth.uid());
      new.official := false;
      new.auto_accept := false;
      new.suspended := false;
      if btrim(coalesce(new.seller_terms, '')) = '' then
        raise exception 'seller terms not accepted' using errcode = 'P0001';
      end if;
    end if;
    new.created_at := now();
  else
    -- only SQL (no signed-in user, e.g. the SQL Editor) changes the owner, official or auto_accept
    if (select auth.uid()) is not null then
      new.owner_id := old.owner_id;
      new.official := old.official;
      new.auto_accept := old.auto_accept;
      if btrim(coalesce(new.seller_terms, '')) = '' then new.seller_terms := old.seller_terms; end if;
      if not public.is_moderator() then
        new.suspended := old.suspended;
      elsif old.owner_id is distinct from (select auth.uid()) and not old.official then
        -- a moderator on someone else's shop: only the suspension changes
        new.name := old.name; new.about := old.about; new.accepting := old.accepting;
        new.lead_time := old.lead_time; new.shipping_thb := old.shipping_thb; new.seller_terms := old.seller_terms;
        new.stitch_rate := old.stitch_rate; new.kit_note := old.kit_note;
      end if;
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------- placing an order ----------
-- the customer's word that they may have this design made (their own, or allowed by its author)
alter table public.orders add column if not exists rights_confirmed boolean not null default false;
grant insert (rights_confirmed) on public.orders to authenticated;

-- same as 0012, plus: any shop's own prices, fabric pieces, and the new terms and rights for other shops
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
  if not found or s.suspended or not s.accepting
     or not exists (select 1 from public.shop_payment p where p.shop_id = s.id and p.promptpay_id <> '') then
    raise exception 'shop not taking orders' using errcode = 'P0001';
  end if;
  if not s.official then
    -- the 2026-11-22 terms say the delivery details go to the shop
    if new.terms_version < '2026-11-22' then raise exception 'order terms not accepted' using errcode = 'P0001'; end if;
    if not new.rights_confirmed then raise exception 'rights not confirmed' using errcode = 'P0001'; end if;
    if btrim(s.seller_terms) = '' then raise exception 'shop not taking orders' using errcode = 'P0001'; end if;
  end if;
  -- a new shop has at most 3 open orders until it has delivered 3
  if not s.official
     and (select count(*) from public.orders where shop_id = s.id and status = 'done') < 3
     and (select count(*) from public.orders where shop_id = s.id and status not in ('done', 'cancelled')) >= 3 then
    raise exception 'shop is busy' using errcode = 'P0001';
  end if;
  new.size := public.piece_size(public.material_of(new.product), new.cols, new.rows, new.pitch_mm);
  if new.size is null then raise exception 'piece too large' using errcode = 'P0001'; end if;
  unit := public.shop_unit_price(s.id, new.product, new.size, new.stitches);
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

-- a shop accepts only once customers have somewhere to pay
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
    if not exists (select 1 from public.shop_payment p where p.shop_id = s.id and p.promptpay_id <> '') then
      raise exception 'set up PromptPay first' using errcode = 'P0001';
    end if;
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

-- ---------- delivery addresses: the customer always; the shop until 30 days after the order closes ----------
revoke select on public.orders from authenticated;
grant select (id, code, created_at, updated_at, user_id, title, template_name, cols, rows, pitch_mm, size, colors,
  stitches, data, product, plastic_color, quantity, note, lang, unit_thb, shipping_thb, total_thb, status, slip_path,
  slip_at, paid_at, tracking_carrier, tracking_no, shipped_at, closed_at, terms_version, shop_id, accepted_at,
  cancel_reason, cancelled_by, refund_confirmed, rights_confirmed) on public.orders to authenticated;

create or replace function public.order_addresses(codes text[])
returns table (code text, ship_name text, ship_phone text, ship_address text, ship_postcode text)
language sql stable security definer set search_path = '' as $$
  select o.code, o.ship_name, o.ship_phone, o.ship_address, o.ship_postcode
    from public.orders o
   where o.code = any(codes)
     and (o.user_id = (select auth.uid())
          or (public.works_shop(o.shop_id) and (o.closed_at is null or o.closed_at > now() - interval '30 days')));
$$;
revoke all on function public.order_addresses(text[]) from public, anon;
grant execute on function public.order_addresses(text[]) to authenticated;
