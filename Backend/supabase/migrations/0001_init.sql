-- IntrvuFit: per-user daily usage quota.
--
-- This project is shared with other products, so everything here is prefixed `intrvufit_` and
-- nothing touches auth.users or any table we do not own. Users are shared; IntrvuFit data is not.
-- Run in the Supabase SQL editor (or `supabase db push`). All access goes through the backend
-- using the service role key; RLS is enabled with no policies so clients can never read or
-- write these tables directly.

create table if not exists public.intrvufit_usage_daily (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default ((now() at time zone 'utc')::date),
  count   integer not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.intrvufit_usage_daily  enable row level security;

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

create or replace function public.intrvufit_get_usage(p_user_id uuid, p_limit integer)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'used', coalesce((select count from intrvufit_usage_daily
                       where user_id = p_user_id and day = (now() at time zone 'utc')::date), 0),
    'limit', p_limit
  );
$$;

-- Remove everything IntrvuFit stores about a user (the auth user itself is left alone, because
-- other products use the same account).
create or replace function public.intrvufit_delete_user_data(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from intrvufit_usage_daily where user_id = p_user_id;
$$;

-- Only the backend (service role) may call these.
revoke all on function public.intrvufit_consume_quota(uuid, integer) from public, anon, authenticated;
revoke all on function public.intrvufit_release_quota(uuid)          from public, anon, authenticated;
revoke all on function public.intrvufit_get_usage(uuid, integer)     from public, anon, authenticated;
revoke all on function public.intrvufit_delete_user_data(uuid)       from public, anon, authenticated;
grant execute on function public.intrvufit_consume_quota(uuid, integer) to service_role;
grant execute on function public.intrvufit_release_quota(uuid)          to service_role;
grant execute on function public.intrvufit_get_usage(uuid, integer)     to service_role;
grant execute on function public.intrvufit_delete_user_data(uuid)       to service_role;
