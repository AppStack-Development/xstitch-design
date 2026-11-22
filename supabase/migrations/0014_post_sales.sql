-- XStitch.Design: selling your own community patterns (docs/marketplace.md, phase 3).
--
-- The author of a community post who has a shop can price it (post_prices): one price per product, the
-- piece being the post itself. Customers order it from the post page and the author's shop makes it.
-- The author can also allow other shops to make it (posts.allow_making); without that, only the
-- author's shop may take an order for the design, whether it's ordered from the post or from a copy.
--
-- Every order made from a community post carries its post_id:
--   - at the author's shop: the post's own price if it has one (else the shop's rate card), and the order
--     takes its design from the post, so a copy edited in the browser can't be sold under the post's price;
--     the customer's word on the rights isn't needed (the seller owns the design)
--   - at any other shop: only if the author allows it; rate card prices
-- The team's shop is the author's shop for the team's own posts, so they keep working as before.
-- Permission tests: supabase/tests/0014_post_sales_test.sql

-- ---------- the author's permission ----------
alter table public.posts add column if not exists allow_making boolean not null default false;
grant update (allow_making) on public.posts to authenticated;

-- only the author decides (moderators may edit posts for status, not this)
create or replace function public.posts_making_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.allow_making is distinct from old.allow_making
     and current_user in ('authenticated', 'anon')
     and old.author is distinct from (select auth.uid()) then
    new.allow_making := old.allow_making;
  end if;
  return new;
end $$;
drop trigger if exists posts_making_guard on public.posts;
create trigger posts_making_guard before update on public.posts
  for each row execute function public.posts_making_guard();
revoke all on function public.posts_making_guard() from public, anon, authenticated;

-- ---------- prices for a post ----------
create table if not exists public.post_prices (
  post_id text not null references public.posts (id) on delete cascade,
  product text not null check (product in ('blank', 'kit', 'stitched', 'fabric_kit', 'fabric_stitched', 'fabric_framed')),
  price_thb integer not null check (price_thb between 1 and 100000),
  primary key (post_id, product)
);
alter table public.post_prices enable row level security;

-- the post's author, who has a shop, and only products of the post's material
create or replace function public.can_price_post(pid text, p_product text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.posts p
     where p.id = pid and p.author = (select auth.uid())
       and public.material_of(p_product) = case when p.base = 'aida' then 'fabric' else '3d' end
       and exists (select 1 from public.shops s where s.owner_id = (select auth.uid()))
  );
$$;
revoke all on function public.can_price_post(text, text) from public, anon;
grant execute on function public.can_price_post(text, text) to authenticated;

drop policy if exists "anyone sees post prices" on public.post_prices;
create policy "anyone sees post prices" on public.post_prices for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
drop policy if exists "author prices own post" on public.post_prices;
create policy "author prices own post" on public.post_prices for all to authenticated
  using ((select public.can_price_post(post_id, product))) with check ((select public.can_price_post(post_id, product)));
revoke all on public.post_prices from anon, authenticated;
grant select on public.post_prices to anon, authenticated;
grant insert, update, delete on public.post_prices to authenticated;

-- the author's shop, if it's taking orders, with the post's own prices
create or replace function public.post_quotes(pid text)
returns table (shop_id bigint, shop_name text, about text, lead_time text, shipping_thb int, official boolean,
               kit_note text, delivered bigint, opened_at timestamptz, product text, unit_thb int)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.about, s.lead_time, s.shipping_thb, s.official, s.kit_note,
         (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'done'),
         s.created_at, pp.product, pp.price_thb
    from public.posts p
    join public.shops s on s.owner_id = p.author
    join public.post_prices pp on pp.post_id = p.id
   where p.id = pid and p.status = 'published' and public.shop_open_for_orders(s.id);
$$;
revoke all on function public.post_quotes(text) from public;
grant execute on function public.post_quotes(text) to anon, authenticated;

-- ---------- orders from a post ----------
alter table public.orders add column if not exists post_id text references public.posts (id) on delete set null;
grant insert (post_id) on public.orders to authenticated;
grant select (post_id) on public.orders to authenticated;

-- same as 0013, plus the post rules above
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

  if new.stitches < 1 or new.stitches > new.cols * new.rows then
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
  new.created_at := now();
  new.updated_at := now();
  new.status := case when s.auto_accept then 'awaiting_payment' else 'awaiting_accept' end;
  new.accepted_at := case when s.auto_accept then now() end;
  new.cancel_reason := ''; new.cancelled_by := null; new.refund_confirmed := false;
  new.slip_path := null; new.slip_at := null; new.paid_at := null;
  new.tracking_carrier := ''; new.tracking_no := ''; new.shipped_at := null; new.closed_at := null;
  return new;
end $$;
