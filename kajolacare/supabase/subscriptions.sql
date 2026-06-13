-- Kajola Care — billing / subscriptions
-- Idempotent: safe to run multiple times in the Supabase SQL Editor.
-- Run this AFTER schema.sql. It is self-contained and does not modify existing tables.

-- 1. Subscription state, one row per auth user. Stripe webhook is the only writer.
create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  plan                   text not null default 'trial'
    check (plan in ('trial','starter','pro','practice','expired')),
  status                 text not null default 'trialing',
  stripe_customer_id     text,
  stripe_subscription_id text,
  trial_ends_at          timestamptz default (now() + interval '30 days'),
  current_period_end     timestamptz,
  updated_at             timestamptz default now()
);

alter table public.subscriptions enable row level security;

-- The signed-in user may READ only their own subscription. No client write policy
-- exists on purpose: only the webhook (service-role key) writes this table.
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select using (auth.uid() = user_id);

-- 2. Give every NEW signup a 21-day trial row automatically.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'trial', 'trialing')
  on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2b. Backfill: give existing users a trial row too, so nobody is locked out
--     the moment you turn enforcement on. Adjust trial_ends_at if you want
--     existing customers grandfathered onto 'pro' instead — see note below.
insert into public.subscriptions (user_id, plan, status)
select id, 'trial', 'trialing' from auth.users
on conflict (user_id) do nothing;

-- To grandfather your current/early customers onto full access instead of a
-- trial countdown, run (once), replacing the email list as needed:
--   update public.subscriptions set plan = 'pro', status = 'active',
--          current_period_end = now() + interval '100 years'
--   where user_id in (select id from auth.users where email in ('you@example.com'));

-- 3. Entitlement helper used by RLS on Pro-only tables (if/when you split the
--    compliance registers out of the app_snapshots JSON). Treats trial as Pro.
create or replace function public.has_pro(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = uid
      and s.plan in ('trial','pro','practice')
      and s.status in ('active','trialing')
      and coalesce(s.current_period_end, s.trial_ends_at, now()) >= now()
  );
$$;
