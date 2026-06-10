create table if not exists public.bills (
  id uuid primary key,
  client_bill_id text,
  app_instance_id uuid not null,
  sync_secret text not null,
  user_id uuid,
  biller text not null,
  amount numeric(12, 2) not null,
  due_date date not null,
  category text not null default 'other',
  recurrence text not null default 'once',
  reference text,
  notes text,
  file_name text,
  status text not null default 'unpaid' check (status in ('unpaid', 'paid')),
  paid_at date,
  payment_notes text,
  reschedule_notes text,
  reminded_for text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key,
  email text not null,
  reminder_lead_days integer not null default 3 check (reminder_lead_days in (0, 1, 3, 7)),
  email_reminders boolean not null default false,
  timezone text not null default 'Australia/Melbourne',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bills_app_instance_due_date_idx
  on public.bills (app_instance_id, due_date);

alter table public.bills
  add column if not exists user_id uuid;

alter table public.bills
  add column if not exists client_bill_id text;

alter table public.bills
  add column if not exists paid_at date;

alter table public.bills
  add column if not exists payment_notes text;

alter table public.bills
  add column if not exists reschedule_notes text;

alter table public.bills
  add column if not exists category text not null default 'other';

alter table public.bills
  add column if not exists recurrence text not null default 'once';

alter table public.bills
  add column if not exists anchor_day integer;

alter table public.user_settings
  add column if not exists first_name text;

update public.bills
set client_bill_id = id::text
where client_bill_id is null;

create index if not exists bills_user_due_date_idx
  on public.bills (user_id, due_date);

create index if not exists bills_user_client_bill_idx
  on public.bills (user_id, client_bill_id);

create index if not exists bills_app_instance_client_bill_idx
  on public.bills (app_instance_id, client_bill_id);

alter table public.bills enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "Allow anon bill sync for MVP" on public.bills;
drop policy if exists "Allow anon bill sync with device secret" on public.bills;
drop policy if exists "Allow user bill sync" on public.bills;
drop policy if exists "Allow anon select with device secret" on public.bills;
drop policy if exists "Allow anon insert with device secret" on public.bills;
drop policy if exists "Allow anon update with device secret" on public.bills;
drop policy if exists "Allow anon delete with device secret" on public.bills;
drop policy if exists "Allow user settings sync" on public.user_settings;

create policy "Allow anon bill sync with device secret"
  on public.bills
  for all
  to anon
  using (
    sync_secret = ((current_setting('request.headers', true)::json ->> 'x-sync-secret'))
  )
  with check (
    sync_secret = ((current_setting('request.headers', true)::json ->> 'x-sync-secret'))
  );

create policy "Allow user bill sync"
  on public.bills
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Allow user settings sync"
  on public.user_settings
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- Shared households (couples manage bills together)
-- ============================================================
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null,
  email text,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index if not exists household_members_user_idx on public.household_members(user_id);

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  inviter_id uuid not null,
  invite_email text not null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now(),
  accepted_by uuid,
  accepted_at timestamptz
);
create index if not exists household_invites_token_idx on public.household_invites(token);

alter table public.bills
  add column if not exists household_id uuid;
create index if not exists bills_household_idx on public.bills(household_id);

-- SECURITY DEFINER helper so policies can reference membership without
-- recursive RLS evaluation.
create or replace function public.current_household_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (id in (select public.current_household_ids()));

drop policy if exists household_members_select on public.household_members;
create policy household_members_select on public.household_members
  for select to authenticated
  using (user_id = auth.uid() or household_id in (select public.current_household_ids()));

drop policy if exists household_invites_select on public.household_invites;
create policy household_invites_select on public.household_invites
  for select to authenticated
  using (inviter_id = auth.uid() or household_id in (select public.current_household_ids()));

-- All writes to household tables go through Pages Functions using the service
-- role; no direct client INSERT/UPDATE/DELETE policies are granted.

-- Bills are readable/editable by the author OR any member of the bill's household.
drop policy if exists "Allow user bill sync" on public.bills;
create policy "Allow user bill sync"
  on public.bills
  for all
  to authenticated
  using (
    user_id = auth.uid()
    or (household_id is not null and household_id in (select public.current_household_ids()))
  )
  with check (
    case
      when household_id is not null then household_id in (select public.current_household_ids())
      else user_id = auth.uid()
    end
  );
