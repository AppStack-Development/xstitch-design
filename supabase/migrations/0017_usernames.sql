-- XStitch.Design: @usernames, public profile pages (#/@username) and a "verified" badge, like MakerWorld.
--
-- Every creator (the public identity from 0003) now has
--   username      unique, a-z 0-9 _ . (3–20, lower case), the address of their profile page.
--                 Accounts that never chose one get maker1234-style names; choosing your own is free once,
--                 after that you can change it once every 30 days so links don't keep breaking.
--   verified      the badge after the name. Only moderators set it (set_creator_verified); it means the
--                 team has checked the person / their designs. The "จากทีม" badge (official) stays as it is.
-- Names that look like the team (anything with "xstitch", admin, support…) are kept for the team:
-- the app can't choose them; SQL (no signed-in user, e.g. the SQL Editor) still can.
--
-- Safe to run more than once.

alter table public.creators add column if not exists username text;
-- false while the username is one we picked (maker1234): the first change of your own is free
alter table public.creators add column if not exists username_chosen boolean not null default false;
alter table public.creators add column if not exists username_changed_at timestamptz;
alter table public.creators add column if not exists verified boolean not null default false;
alter table public.creators add column if not exists verified_at timestamptz;

-- a free maker1234-style username (longer once the short ones run low)
create or replace function public.new_username() returns text
language plpgsql volatile set search_path = '' as $$
declare u text; tries int := 0; len int;
begin
  loop
    len := 4 + tries / 20;
    u := 'maker' || lpad(floor(random() * power(10, len))::bigint::text, len, '0');
    exit when not exists (select 1 from public.creators where username = u);
    tries := tries + 1;
  end loop;
  return u;
end $$;
revoke all on function public.new_username() from public, anon, authenticated;

-- usernames the app can't take: the team's names and ones that would read as staff
create or replace function public.username_reserved(u text) returns boolean
language sql immutable set search_path = '' as $$
  select u like '%xstitch%' or u = any (array[
    'admin', 'administrator', 'root', 'system', 'support', 'help', 'helpdesk', 'contact', 'info',
    'team', 'staff', 'official', 'verified', 'moderator', 'moderators', 'mod', 'mods',
    'community', 'shop', 'shops', 'account', 'settings', 'api', 'www', 'about', 'terms', 'privacy',
    'order', 'orders', 'null', 'undefined', 'anonymous', 'unknown', 'me', 'you']);
$$;
grant execute on function public.username_reserved(text) to anon, authenticated;

-- give every existing creator a username: the team's official account gets @xstitch
update public.creators set username = 'xstitch', username_chosen = true
 where username is null
   and not exists (select 1 from public.creators where username = 'xstitch')
   and user_id = (select user_id from public.creators where official order by created_at limit 1);
update public.creators set username = public.new_username() where username is null;

alter table public.creators alter column username set not null;
alter table public.creators drop constraint if exists creators_username_format;
alter table public.creators add constraint creators_username_format check (
  username ~ '^[a-z0-9_][a-z0-9_.]{1,18}[a-z0-9_]$' and position('..' in username) = 0);
create unique index if not exists creators_username on public.creators (username);

-- usernames: filled in when missing, checked and rate-limited when changed from the app
create or replace function public.creators_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare app boolean := (select auth.uid()) is not null;
begin
  if tg_op = 'INSERT' then
    if new.username is null then
      new.username := public.new_username();
      new.username_chosen := false;
      new.username_changed_at := null;
    else
      if app and public.username_reserved(new.username) then
        raise exception 'username not allowed' using errcode = 'P0001';
      end if;
      new.username_chosen := true;
      new.username_changed_at := now();
    end if;
  elsif new.username is distinct from old.username then
    if app then
      if public.username_reserved(new.username) then
        raise exception 'username not allowed' using errcode = 'P0001';
      end if;
      if old.username_chosen and old.username_changed_at > now() - interval '30 days' then
        raise exception 'username changed recently' using errcode = 'P0001';
      end if;
    end if;
    new.username_chosen := true;
    new.username_changed_at := now();
  end if;
  -- display names that pass for the team ("XStitch", "X-Stitch"…, but not "Max Stitch")
  if app and not coalesce(new.official, false) and new.display_name ~* '\mx\s*[-.]?\s*stitch'
     and (tg_op = 'INSERT' or new.display_name is distinct from old.display_name) then
    raise exception 'name not allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.creators_guard() from public, anon, authenticated;
drop trigger if exists creators_guard on public.creators;
create trigger creators_guard before insert or update on public.creators
  for each row execute function public.creators_guard();

-- the app may set its own username; verified, official and the change bookkeeping stay out of reach
revoke insert, update on public.creators from authenticated;
grant insert (user_id, display_name, username) on public.creators to authenticated;
grant update (display_name, username) on public.creators to authenticated;

-- the verified badge: moderators give it and take it back
create or replace function public.set_creator_verified(p_username text, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_moderator() then raise exception 'not allowed' using errcode = 'P0001'; end if;
  update public.creators
     set verified = p_on, verified_at = case when p_on then coalesce(verified_at, now()) end
   where username = lower(btrim(p_username));
  if not found then raise exception 'no such creator' using errcode = 'P0001'; end if;
end $$;
revoke all on function public.set_creator_verified(text, boolean) from public, anon;
grant execute on function public.set_creator_verified(text, boolean) to authenticated;
