-- XStitch.Design: trust between customers and shops (docs/marketplace.md, phase 4).
--
--   reviews   once an order is received, its customer rates it 1–5 with a few words; the shop may reply once;
--             moderators can hide a review. Reviews are public without the reviewer's identity.
--   reports   anyone signed in can report a shop (optionally about one of their own orders); moderators see
--             the reports and, for a reported order only, the order, its messages and slip, so they can judge
--             it; they can suspend the shop (0012) and mark the report handled.
--   expiry    orders the shop hasn't answered in 3 days, or the customer hasn't paid 2 days after the shop
--             accepted (or after a slip was turned down), are cancelled by the system every 30 minutes.
-- Permission tests: supabase/tests/0015_trust_test.sql

-- ---------- reviews ----------
create table if not exists public.order_reviews (
  order_id bigint primary key references public.orders (id) on delete cascade,
  shop_id bigint references public.shops (id) on delete cascade,
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1000),
  reply text check (reply is null or char_length(btrim(reply)) between 1 and 500),
  replied_at timestamptz,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists order_reviews_by_shop on public.order_reviews (shop_id, created_at desc);

-- a review belongs to a received order of the reviewer's; the rest is set here, not by the app
create or replace function public.order_reviews_prepare() returns trigger
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = new.order_id;
  if not found or o.user_id is distinct from (select auth.uid()) then
    raise exception 'order not found' using errcode = 'P0001';
  end if;
  if o.status <> 'done' then raise exception 'order not received yet' using errcode = 'P0001'; end if;
  new.shop_id := o.shop_id;
  new.user_id := (select auth.uid());
  new.body := btrim(new.body);
  new.reply := null; new.replied_at := null; new.hidden := false;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists order_reviews_prepare on public.order_reviews;
create trigger order_reviews_prepare before insert on public.order_reviews
  for each row execute function public.order_reviews_prepare();
revoke all on function public.order_reviews_prepare() from public, anon, authenticated;

alter table public.order_reviews enable row level security;
drop policy if exists "visible reviews are public" on public.order_reviews;
create policy "visible reviews are public" on public.order_reviews for select to anon using (not hidden);
drop policy if exists "signed-in see reviews" on public.order_reviews;
create policy "signed-in see reviews" on public.order_reviews for select to authenticated
  using (not hidden or user_id = (select auth.uid()) or (select public.works_shop(shop_id)) or (select public.is_moderator()));
drop policy if exists "customer reviews own order" on public.order_reviews;
create policy "customer reviews own order" on public.order_reviews for insert to authenticated
  with check (user_id = (select auth.uid()));
revoke all on public.order_reviews from anon, authenticated;
-- not the reviewer: reviews are shown without who wrote them
grant select (order_id, shop_id, rating, body, reply, replied_at, hidden, created_at) on public.order_reviews to anon, authenticated;
grant insert (order_id, rating, body) on public.order_reviews to authenticated;

-- the shop answers a review once
create or replace function public.review_reply(p_order_id bigint, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.order_reviews; txt text := btrim(coalesce(p_reply, ''));
begin
  select * into r from public.order_reviews where order_id = p_order_id for update;
  if not found or not public.works_shop(r.shop_id) then raise exception 'review not found' using errcode = 'P0001'; end if;
  if r.reply is not null then raise exception 'already replied' using errcode = 'P0001'; end if;
  if char_length(txt) not between 1 and 500 then raise exception 'reply 1 to 500 characters' using errcode = 'P0001'; end if;
  update public.order_reviews set reply = txt, replied_at = now() where order_id = p_order_id;
end $$;
revoke all on function public.review_reply(bigint, text) from public, anon;
grant execute on function public.review_reply(bigint, text) to authenticated;

-- moderators hide (or show again) a review
create or replace function public.review_hide(p_order_id bigint, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'not allowed' using errcode = 'P0001'; end if;
  update public.order_reviews set hidden = p_hidden where order_id = p_order_id;
end $$;
revoke all on function public.review_hide(bigint, boolean) from public, anon;
grant execute on function public.review_hide(bigint, boolean) to authenticated;

-- a shop's public reviews, with what was bought (not the design's name: it may be someone's own)
create or replace function public.shop_reviews(sid bigint)
returns table (rating smallint, body text, reply text, replied_at timestamptz, created_at timestamptz, product text)
language sql stable security definer set search_path = '' as $$
  select r.rating, r.body, r.reply, r.replied_at, r.created_at, o.product
    from public.order_reviews r join public.orders o on o.id = r.order_id
    join public.shops s on s.id = r.shop_id
   where r.shop_id = sid and not r.hidden and not s.suspended
   order by r.created_at desc
   limit 100;
$$;
revoke all on function public.shop_reviews(bigint) from public;
grant execute on function public.shop_reviews(bigint) to anon, authenticated;

-- delivered orders, reviews and average rating for some shops (for shop cards and the order dialog)
create or replace function public.shop_stats(ids bigint[])
returns table (shop_id bigint, delivered bigint, reviews bigint, rating numeric)
language sql stable security definer set search_path = '' as $$
  select s.id,
         (select count(*) from public.orders o where o.shop_id = s.id and o.status = 'done'),
         (select count(*) from public.order_reviews r where r.shop_id = s.id and not r.hidden),
         (select round(avg(r.rating), 1) from public.order_reviews r where r.shop_id = s.id and not r.hidden)
    from public.shops s
   where s.id = any(ids) and not s.suspended;
$$;
revoke all on function public.shop_stats(bigint[]) from public;
grant execute on function public.shop_stats(bigint[]) to anon, authenticated;

-- ---------- reports ----------
create table if not exists public.shop_reports (
  id bigint generated always as identity primary key,
  shop_id bigint not null references public.shops (id) on delete cascade,
  order_id bigint references public.orders (id) on delete set null,
  reporter uuid default auth.uid() references auth.users (id) on delete set null,
  reason text not null check (reason in ('not_shipped', 'no_refund', 'wrong_item', 'off_site_payment', 'rude', 'other')),
  note text not null default '' check (char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution text check (resolution is null or resolution in ('dismissed', 'warned', 'suspended'))
);
create index if not exists shop_reports_open on public.shop_reports (created_at) where resolved_at is null;

-- the reporter is whoever is signed in; an order named must be theirs and from that shop; 5 a day at most
create or replace function public.shop_reports_prepare() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.reporter := (select auth.uid());
  new.created_at := now();
  new.resolved_at := null; new.resolution := null;
  new.note := btrim(new.note);
  if new.order_id is not null and not exists (
    select 1 from public.orders o where o.id = new.order_id and o.user_id = new.reporter and o.shop_id = new.shop_id
  ) then
    raise exception 'order not found' using errcode = 'P0001';
  end if;
  if (select count(*) from public.shop_reports where reporter = new.reporter and created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many reports today' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists shop_reports_prepare on public.shop_reports;
create trigger shop_reports_prepare before insert on public.shop_reports
  for each row execute function public.shop_reports_prepare();
revoke all on function public.shop_reports_prepare() from public, anon, authenticated;

alter table public.shop_reports enable row level security;
drop policy if exists "report a shop" on public.shop_reports;
create policy "report a shop" on public.shop_reports for insert to authenticated with check (reporter = (select auth.uid()));
drop policy if exists "own reports or the team" on public.shop_reports;
create policy "own reports or the team" on public.shop_reports for select to authenticated
  using (reporter = (select auth.uid()) or (select public.is_moderator()));
drop policy if exists "the team handles reports" on public.shop_reports;
create policy "the team handles reports" on public.shop_reports for update to authenticated
  using ((select public.is_moderator())) with check ((select public.is_moderator()));
revoke all on public.shop_reports from anon, authenticated;
grant select on public.shop_reports to authenticated;
grant insert (shop_id, order_id, reason, note) on public.shop_reports to authenticated;
grant update (resolved_at, resolution) on public.shop_reports to authenticated;

-- a reported order is open to the team: the order, its messages and its slip (not the address)
create or replace function public.order_reported(oid bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_moderator() and exists (select 1 from public.shop_reports r where r.order_id = oid);
$$;
revoke all on function public.order_reported(bigint) from public, anon;
grant execute on function public.order_reported(bigint) to authenticated;

drop policy if exists "customer or shop sees order" on public.orders;
create policy "customer or shop sees order" on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.works_shop(shop_id)) or (select public.order_reported(id)));

drop policy if exists "order people read messages" on public.order_messages;
create policy "order people read messages" on public.order_messages for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.user_id = (select auth.uid()) or public.works_shop(o.shop_id) or public.order_reported(o.id))));

drop policy if exists "read own slips or the shop's" on storage.objects;
create policy "read own slips or the shop's" on storage.objects for select to authenticated
  using (bucket_id = 'payment-slips' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (select 1 from public.orders o where o.slip_path = storage.objects.name
               and (public.works_shop(o.shop_id) or public.order_reported(o.id)))
  ));

-- ---------- expiry ----------
create or replace function public.expire_stale_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare n int; m int;
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
  return n + m;
end $$;
revoke all on function public.expire_stale_orders() from public, anon, authenticated;

-- run it every 30 minutes where pg_cron is available (Supabase); elsewhere call it by hand
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('expire-stale-orders', '*/30 * * * *', 'select public.expire_stale_orders()');
  else
    raise notice 'pg_cron is not available here: run select public.expire_stale_orders() on a schedule';
  end if;
end $$;
