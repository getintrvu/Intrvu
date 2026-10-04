-- IntrvuFit: per-user daily usage quota, plus a record of which users use IntrvuFit.
--
-- This project is shared with other products, so everything here is prefixed `intrvufit_` and
-- nothing touches auth.users, public.profiles, or any table/function/trigger we do not own.
-- Users are shared; IntrvuFit data is not.
--
-- Run in the Supabase SQL editor (or `supabase db push`). All access goes through the backend
-- using the service role key; RLS is enabled with no policies so clients can never read or
-- write these tables directly.

-- ---------------------------------------------------------------- tables
create table if not exists public.intrvufit_usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default ((now() at time zone 'utc')::date),
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

-- Everyone who has used IntrvuFit, with the time we first saw them. Use this to tell IntrvuFit
-- users apart in the shared profiles table (see the view below).
create table if not exists public.intrvufit_users (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  first_seen_at timestamptz not null default now()
);

alter table public.intrvufit_usage_daily enable row level security;
alter table public.intrvufit_users       enable row level security;

-- ---------------------------------------------------------------- functions
-- Atomically take one unit of today's quota. Returns {allowed, used, limit}.
create or replace function public.intrvufit_consume_quota(p_user_id uuid, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_count integer;
begin
  insert into intrvufit_users (user_id) values (p_user_id) on conflict do nothing;

  insert into intrvufit_usage_daily as u (user_id, day, count)
  values (p_user_id, v_today, 1)
  on conflict (user_id, day) do update
    set count = u.count + 1
    where u.count < p_limit
  returning u.count into v_count;

  if v_count is null then
    select count into v_count from intrvufit_usage_daily where user_id = p_user_id and day = v_today;
    return jsonb_build_object('allowed', false, 'used', coalesce(v_count, p_limit), 'limit', p_limit);
  end if;

  return jsonb_build_object('allowed', true, 'used', v_count, 'limit', p_limit);
end;
$$;

-- Give back one unit (used when an analysis fails on our side).
create or replace function public.intrvufit_release_quota(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update intrvufit_usage_daily
     set count = greatest(count - 1, 0)
   where user_id = p_user_id
     and day = (now() at time zone 'utc')::date;
$$;

-- Today's usage. Also records the user as an IntrvuFit user the first time the panel asks.
create or replace function public.intrvufit_get_usage(p_user_id uuid, p_limit integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  insert into intrvufit_users (user_id) values (p_user_id) on conflict do nothing;

  select coalesce((select count from intrvufit_usage_daily
                    where user_id = p_user_id and day = (now() at time zone 'utc')::date), 0)
    into v_used;

  return jsonb_build_object('used', v_used, 'limit', p_limit);
end;
$$;

-- Remove everything IntrvuFit stores about a user (the auth user and their profile are left
-- alone, because other products use the same account).
create or replace function public.intrvufit_delete_user_data(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from intrvufit_usage_daily where user_id = p_user_id;
  delete from intrvufit_users       where user_id = p_user_id;
$$;

-- ---------------------------------------------------------------- view
-- Which rows of the shared profiles table belong to IntrvuFit users. READ ONLY; it does not
-- change profiles. signed_up_via_intrvufit is true when the account was created within a few
-- minutes of the user's first IntrvuFit visit, i.e. IntrvuFit is where they joined.
create or replace view public.intrvufit_profiles
with (security_invoker = true) as
select p.*,
       u.first_seen_at as intrvufit_first_seen_at,
       (u.first_seen_at <= au.created_at + interval '10 minutes') as signed_up_via_intrvufit
  from public.profiles p
  join public.intrvufit_users u on u.user_id = p.id
  join auth.users au on au.id = p.id;

-- ---------------------------------------------------------------- permissions
-- Only the backend (service role) may call these or read the view.
revoke all on function public.intrvufit_consume_quota(uuid, integer) from public, anon, authenticated;
revoke all on function public.intrvufit_release_quota(uuid)          from public, anon, authenticated;
revoke all on function public.intrvufit_get_usage(uuid, integer)     from public, anon, authenticated;
revoke all on function public.intrvufit_delete_user_data(uuid)       from public, anon, authenticated;
revoke all on table public.intrvufit_usage_daily                     from anon, authenticated;
revoke all on table public.intrvufit_users                           from anon, authenticated;
revoke all on public.intrvufit_profiles                              from public, anon, authenticated;
grant execute on function public.intrvufit_consume_quota(uuid, integer) to service_role;
grant execute on function public.intrvufit_release_quota(uuid)          to service_role;
grant execute on function public.intrvufit_get_usage(uuid, integer)     to service_role;
grant execute on function public.intrvufit_delete_user_data(uuid)       to service_role;
grant select on public.intrvufit_profiles to service_role;
