-- XStitch.Design: asking a shop for a price (docs/marketplace.md, phase 4b).
--
-- For a design no shop has a price for: another product or size than its rate card lists, or a piece larger
-- than the size table (up to 1 m on the longest side). Shops choose whether they take quote requests, for 3D
-- pieces, fabric or both (shops.quote_materials).
--
--   customer   sends a quote request: an order with is_quote, no price yet          [quote_requested]
--   shop       quotes a price per piece, shipping and a note (may revise it), or declines  [quoted]
--   customer   accepts that exact price; from then on it's an ordinary order             [awaiting_payment]
--
-- The shop has 3 days to quote and the customer 3 days to accept; otherwise the system cancels the request.
-- Permission tests: supabase/tests/0016_quotes_test.sql

-- ---------- shops choose what they quote for ----------
alter table public.shops add column if not exists quote_materials text[] not null default '{}';
alter table public.shops drop constraint if exists shops_quote_materials_check;
alter table public.shops add constraint shops_quote_materials_check check (quote_materials <@ array['3d', 'fabric']::text[]);
grant insert (quote_materials), update (quote_materials) on public.shops to authenticated;

-- same as 0013, plus quote_materials among what a moderator can't change on someone else's shop
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
        new.stitch_rate := old.stitch_rate; new.kit_note := old.kit_note; new.quote_materials := old.quote_materials;
      end if;
    end if;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- ---------- orders that start as a quote request ----------
alter table public.orders add column if not exists is_quote boolean not null default false;
alter table public.orders add column if not exists quoted_at timestamptz;
alter table public.orders add column if not exists quote_note text not null default '';
alter table public.orders drop constraint if exists orders_quote_note_check;
alter table public.orders add constraint orders_quote_note_check check (char_length(quote_note) <= 500);
grant insert (is_quote) on public.orders to authenticated;
grant select (is_quote, quoted_at, quote_note) on public.orders to authenticated;

-- XL: larger than the size table, made only on a quote
alter table public.orders drop constraint if exists orders_size_check;
alter table public.orders add constraint orders_size_check check (size in ('S', 'M', 'L', 'XL'));

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check check (status in
  ('quote_requested', 'quoted', 'awaiting_accept', 'awaiting_payment', 'payment_review', 'paid', 'in_production',
   'shipped', 'done', 'cancelled'));

-- same as 0014, plus quote requests: no price yet, any size up to 1 m, only at shops that quote this material
create or replace function public.orders_prepare() returns trigger
language plpgsql security definer set search_path = '' as $$
declare unit int; s public.shops; p public.posts; by_author boolean := false;
begin
  if coalesce(btrim(new.terms_version), '') = '' then
    raise exception 'order terms not accepted' using errcode = 'P0001';
  end if;
  if not public.is_moderator() and (
    select count(*) from public.orders where user_id = (select auth.uid()) and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'too many orders in an hour' using errcode = 'P0001';
  end if;
  -- an order without a shop (an older app) goes to the team, as it always did
  if new.shop_id is null then select id into new.shop_id from public.shops where official; end if;
  select * into s from public.shops where id = new.shop_id;
  if not found or s.suspended or not s.accepting
     or not exists (select 1 from public.shop_payment sp where sp.shop_id = s.id and sp.promptpay_id <> '') then
    raise exception 'shop not taking orders' using errcode = 'P0001';
  end if;

  if new.post_id is not null then
    select * into p from public.posts where id = new.post_id and status = 'published';
    if not found then raise exception 'design not available' using errcode = 'P0001'; end if;
    by_author := s.owner_id = p.author;
    if not by_author and not p.allow_making then
      raise exception 'design not allowed' using errcode = 'P0001';
    end if;
    -- (the CASE is in brackets: an IF condition otherwise ends at the CASE's first THEN)
    if public.material_of(new.product) <> (case when p.base = 'aida' then 'fabric' else '3d' end) then
      raise exception 'wrong product for this design' using errcode = 'P0001';
    end if;
    if by_author then
      -- the author sells the post itself: its design, not a copy that may have been edited
      new.data := p.data; new.title := left(p.title, 80); new.cols := p.cols; new.rows := p.rows;
      new.colors := p.colors; new.stitches := p.stitches; new.template_name := p.template_name;
      new.rights_confirmed := true;
    end if;
  end if;

  -- (cols and rows are smallints: multiply as int, or a design over ~181 × 181 overflows)
  if new.stitches < 1 or new.stitches > new.cols::int * new.rows then
    raise exception 'bad stitch count' using errcode = 'P0001';
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

  if coalesce(new.is_quote, false) then
    -- a quote request: the shop names the price later (shop_quote)
    if not (public.material_of(new.product) = any(s.quote_materials)) then
      raise exception 'shop not taking quotes' using errcode = 'P0001';
    end if;
    if greatest(new.cols, new.rows) * new.pitch_mm > 1000 then raise exception 'piece too large' using errcode = 'P0001'; end if;
    new.is_quote := true;
    new.size := coalesce(new.size, 'XL');
    new.unit_thb := 0; new.shipping_thb := 0; new.total_thb := 0;
    new.status := 'quote_requested';
    new.accepted_at := null;
  else
    new.is_quote := false;
    if new.size is null then raise exception 'piece too large' using errcode = 'P0001'; end if;
    -- the post's own price at the author's shop; otherwise the shop's rate card
    if by_author then
      select price_thb into unit from public.post_prices where post_id = new.post_id and product = new.product;
    end if;
    if unit is null then unit := public.shop_unit_price(s.id, new.product, new.size, new.stitches); end if;
    if unit is null then raise exception 'no price set' using errcode = 'P0001'; end if;
    new.unit_thb := unit;
    new.shipping_thb := s.shipping_thb;
    new.total_thb := unit * new.quantity + s.shipping_thb;
    new.status := case when s.auto_accept then 'awaiting_payment' else 'awaiting_accept' end;
    new.accepted_at := case when s.auto_accept then now() end;
  end if;
  new.created_at := now();
  new.updated_at := now();
  new.quoted_at := null; new.quote_note := '';
  new.cancel_reason := ''; new.cancelled_by := null; new.refund_confirmed := false;
  new.slip_path := null; new.slip_at := null; new.paid_at := null;
  new.tracking_carrier := ''; new.tracking_no := ''; new.shipped_at := null; new.closed_at := null;
  return new;
end $$;

-- same as 0012: accepting a quote counts as the order being accepted
create or replace function public.orders_track() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    if old.status in ('awaiting_accept', 'quoted') and new.status = 'awaiting_payment' then new.accepted_at := now(); end if;
    if new.status = 'paid' and new.paid_at is null then new.paid_at := now(); end if;
    if new.status = 'shipped' then new.shipped_at := now(); end if;
    if new.status in ('done', 'cancelled') then new.closed_at := now(); else new.closed_at := null; end if;
  end if;
  return new;
end $$;

-- ---------- the shop quotes (again, while the customer hasn't answered) ----------
create or replace function public.shop_quote(order_code text, p_unit int, p_shipping int, p_note text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders; s public.shops; txt text := btrim(coalesce(p_note, ''));
begin
  select * into o from public.orders where code = order_code for update;
  if not found or not public.works_shop(o.shop_id) then raise exception 'order not found' using errcode = 'P0001'; end if;
  if o.status not in ('quote_requested', 'quoted') then raise exception 'not a quote request' using errcode = 'P0001'; end if;
  select * into s from public.shops where id = o.shop_id;
  if s.suspended then raise exception 'shop not taking orders' using errcode = 'P0001'; end if;
  if p_unit is null or p_unit not between 1 and 100000 then raise exception 'price 1 to 100000' using errcode = 'P0001'; end if;
  if p_shipping is null or p_shipping not between 0 and 10000 then raise exception 'shipping 0 to 10000' using errcode = 'P0001'; end if;
  if char_length(txt) > 500 then raise exception 'note too long' using errcode = 'P0001'; end if;
  update public.orders set status = 'quoted', unit_thb = p_unit, shipping_thb = p_shipping,
         total_thb = p_unit * o.quantity + p_shipping, quote_note = txt, quoted_at = now()
   where id = o.id;
end $$;
revoke all on function public.shop_quote(text, int, int, text) from public, anon;
grant execute on function public.shop_quote(text, int, int, text) to authenticated;

-- ---------- the customer accepts the price they saw ----------
create or replace function public.order_accept_quote(order_code text, p_total int) returns void
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where code = order_code and user_id = (select auth.uid()) for update;
  if not found then raise exception 'order not found' using errcode = 'P0001'; end if;
  if o.status <> 'quoted' then raise exception 'no quote to accept' using errcode = 'P0001'; end if;
  -- the shop may have revised the quote since the page was loaded
  if o.total_thb is distinct from p_total then raise exception 'price changed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.shops s where s.id = o.shop_id and not s.suspended)
     or not exists (select 1 from public.shop_payment sp where sp.shop_id = o.shop_id and sp.promptpay_id <> '') then
    raise exception 'shop not taking orders' using errcode = 'P0001';
  end if;
  update public.orders set status = 'awaiting_payment' where id = o.id;
end $$;
revoke all on function public.order_accept_quote(text, int) from public, anon;
grant execute on function public.order_accept_quote(text, int) to authenticated;

-- same as 0012, plus withdrawing a quote request or turning a quote down
create or replace function public.order_cancel(order_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set status = 'cancelled', cancelled_by = 'customer'
   where code = order_code and user_id = (select auth.uid())
     and status in ('quote_requested', 'quoted', 'awaiting_accept', 'awaiting_payment');
  if not found then raise exception 'order cannot be cancelled' using errcode = 'P0001'; end if;
end $$;

-- same as 0013, plus declining a quote request and the new statuses for the team's escape hatch
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
    if o.status not in ('awaiting_accept', 'quote_requested') then raise exception 'order is not waiting for the shop' using errcode = 'P0001'; end if;
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
    if new_status is null or new_status not in ('quote_requested', 'quoted', 'awaiting_accept', 'awaiting_payment',
      'payment_review', 'paid', 'in_production', 'shipped', 'done', 'cancelled') then
      raise exception 'bad status' using errcode = 'P0001';
    end if;
    update public.orders set status = new_status where id = o.id;
  else
    raise exception 'unknown action' using errcode = 'P0001';
  end if;
end $$;

-- ---------- shops a customer can ask for a price ----------
create or replace function public.quote_shops(p_material text)
returns table (shop_id bigint, shop_name text, about text, lead_time text, shipping_thb int, official boolean,
               kit_note text, delivered bigint, opened_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.about, s.lead_time, s.shipping_thb, s.official, s.kit_note,
         (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'done'), s.created_at
    from public.shops s
   where p_material = any(s.quote_materials) and public.shop_open_for_orders(s.id);
$$;
revoke all on function public.quote_shops(text) from public;
grant execute on function public.quote_shops(text) to anon, authenticated;

-- ---------- emails: a revised quote is news too ----------
drop trigger if exists orders_alert on public.orders;
create trigger orders_alert after insert or update of status, slip_at, tracking_no, quoted_at on public.orders
  for each row execute function public.order_alert_ping();

-- ---------- expiry (0015), plus quote requests nobody quoted and quotes nobody accepted ----------
create or replace function public.expire_stale_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare n int; m int; q int; r int;
begin
  update public.orders set status = 'cancelled', cancelled_by = 'system',
         cancel_reason = 'ร้านไม่ตอบรับภายใน 3 วัน / The shop didn''t answer within 3 days'
   where status = 'awaiting_accept' and created_at < now() - interval '3 days';
  get diagnostics n = row_count;
  update public.orders set status = 'cancelled', cancelled_by = 'system',
         cancel_reason = 'ไม่ได้ชำระเงินภายใน 2 วันหลังร้านรับออเดอร์ / Not paid within 2 days of being accepted'
   where status = 'awaiting_payment'
     and coalesce(accepted_at, created_at) < now() - interval '2 days'
     and (slip_at is null or slip_at < now() - interval '2 days');
  get diagnostics m = row_count;
  update public.orders set status = 'cancelled', cancelled_by = 'system',
         cancel_reason = 'ร้านไม่ได้เสนอราคาภายใน 3 วัน / The shop didn''t quote within 3 days'
   where status = 'quote_requested' and created_at < now() - interval '3 days';
  get diagnostics q = row_count;
  update public.orders set status = 'cancelled', cancelled_by = 'system',
         cancel_reason = 'ไม่ได้ตอบรับราคาภายใน 3 วัน / The quote wasn''t accepted within 3 days'
   where status = 'quoted' and quoted_at < now() - interval '3 days';
  get diagnostics r = row_count;
  return n + m + q + r;
end $$;
revoke all on function public.expire_stale_orders() from public, anon, authenticated;
