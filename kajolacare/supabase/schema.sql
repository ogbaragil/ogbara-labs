create extension if not exists "pgcrypto";

-- Kajola Care production schema for a dedicated Supabase project.
-- Run this once in Supabase SQL Editor for a new Kajola Care project.

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  ndis_number text,
  email text,
  phone text,
  address text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  invoice_number text not null,
  client_id uuid references public.clients(id) on delete set null,
  client_name text,
  client_email text,
  client_phone text,
  client_address text,
  ndis_number text,
  issue_date date,
  due_date date,
  total numeric(12,2) not null default 0,
  notes text,
  status text not null default 'Generated',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete cascade,
  item_label text,
  service_date date,
  unit_type text default 'hours',
  quantity numeric(12,2) default 1,
  rate numeric(12,2) default 0,
  line_total numeric(12,2) default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  client_name text,
  type text check (type in ('income','expense')),
  status text default 'pending' check (status in ('pending','paid')),
  category text,
  description text not null,
  amount numeric(12,2),
  date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_snapshots (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at before update on public.clients for each row execute function public.set_updated_at();

drop trigger if exists set_invoices_updated_at on public.invoices;
create trigger set_invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();

drop trigger if exists set_transactions_updated_at on public.transactions;
create trigger set_transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();

drop trigger if exists set_app_snapshots_updated_at on public.app_snapshots;
create trigger set_app_snapshots_updated_at before update on public.app_snapshots for each row execute function public.set_updated_at();

alter table public.clients enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.transactions enable row level security;
alter table public.app_snapshots enable row level security;

drop policy if exists clients_policy on public.clients;
create policy clients_policy on public.clients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists invoices_policy on public.invoices;
create policy invoices_policy on public.invoices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists transactions_policy on public.transactions;
create policy transactions_policy on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists app_snapshots_policy on public.app_snapshots;
create policy app_snapshots_policy on public.app_snapshots for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists invoice_lines_policy on public.invoice_lines;
create policy invoice_lines_policy
on public.invoice_lines
for all
using (
  exists (
    select 1 from public.invoices i
    where i.id = invoice_lines.invoice_id
    and i.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.invoices i
    where i.id = invoice_lines.invoice_id
    and i.user_id = auth.uid()
  )
);

create index if not exists clients_user_idx on public.clients(user_id);
create index if not exists invoices_user_idx on public.invoices(user_id);
create index if not exists transactions_user_idx on public.transactions(user_id);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines(invoice_id);
create index if not exists app_snapshots_user_idx on public.app_snapshots(user_id);

-- Employee portal username/password RPCs.
-- Run this section in Supabase SQL Editor after upgrading to v16.4.
-- Admin users still use Supabase Auth. Employees use the app's employee username/password and can only load/update their own shifts through these functions.

create or replace function public.employee_portal_login(p_username text, p_password_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_snapshot_id text;
  v_payload jsonb;
  v_worker jsonb;
begin
  if v_username = '' or coalesce(p_password_hash, '') = '' then
    return jsonb_build_object('ok', false, 'message', 'Enter your employee username and password.');
  end if;

  select s.id, s.payload, w.worker
    into v_snapshot_id, v_payload, v_worker
  from public.app_snapshots s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'workers', '[]'::jsonb)) as w(worker)
  where lower(coalesce(w.worker->>'employeeUsername', w.worker->>'username', '')) = v_username
  limit 1;

  if v_worker is null then
    return jsonb_build_object('ok', false, 'message', 'Employee username was not found.');
  end if;

  if coalesce((v_worker->>'loginEnabled')::boolean, true) is not true then
    return jsonb_build_object('ok', false, 'message', 'This employee login is disabled.');
  end if;

  if coalesce(v_worker->>'employeePasswordHash', v_worker->>'passwordHash', '') <> p_password_hash then
    return jsonb_build_object('ok', false, 'message', 'Password is incorrect.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'worker_id', v_worker->>'id',
    'snapshot_id', v_snapshot_id,
    'payload', v_payload
  );
end;
$$;

create or replace function public.employee_portal_update_shift(
  p_username text,
  p_password_hash text,
  p_worker_id text,
  p_shift_id text,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text := lower(trim(coalesce(p_username, '')));
  v_snapshot_id text;
  v_payload jsonb;
  v_worker jsonb;
  v_shift jsonb;
  v_shifts jsonb;
  v_safe_patch jsonb;
begin
  if v_username = '' or coalesce(p_password_hash, '') = '' then
    return jsonb_build_object('ok', false, 'message', 'Employee session is invalid.');
  end if;

  select s.id, s.payload, w.worker
    into v_snapshot_id, v_payload, v_worker
  from public.app_snapshots s
  cross join lateral jsonb_array_elements(coalesce(s.payload->'workers', '[]'::jsonb)) as w(worker)
  where lower(coalesce(w.worker->>'employeeUsername', w.worker->>'username', '')) = v_username
  limit 1;

  if v_worker is null then
    return jsonb_build_object('ok', false, 'message', 'Employee username was not found.');
  end if;

  if coalesce((v_worker->>'loginEnabled')::boolean, true) is not true then
    return jsonb_build_object('ok', false, 'message', 'This employee login is disabled.');
  end if;

  if coalesce(v_worker->>'employeePasswordHash', v_worker->>'passwordHash', '') <> p_password_hash then
    return jsonb_build_object('ok', false, 'message', 'Employee session failed password check.');
  end if;

  if coalesce(v_worker->>'id', '') <> coalesce(p_worker_id, '') then
    return jsonb_build_object('ok', false, 'message', 'Employee session does not match this worker.');
  end if;

  select sh.shift into v_shift
  from jsonb_array_elements(coalesce(v_payload->'shifts', '[]'::jsonb)) as sh(shift)
  where sh.shift->>'id' = p_shift_id
  limit 1;

  if v_shift is null then
    return jsonb_build_object('ok', false, 'message', 'Shift was not found.');
  end if;

  if coalesce(v_shift->>'workerId', '') <> p_worker_id then
    return jsonb_build_object('ok', false, 'message', 'This shift is not assigned to you.');
  end if;

  -- Only allow employee-safe shift fields to be changed from the portal.
  v_safe_patch := jsonb_strip_nulls(jsonb_build_object(
    'status', p_patch->>'status',
    'startedAt', p_patch->>'startedAt',
    'endedAt', p_patch->>'endedAt',
    'viewedAt', p_patch->>'viewedAt',
    'notes', p_patch->>'notes',
    'notesSubmittedAt', p_patch->>'notesSubmittedAt',
    'incidentReported', p_patch->'incidentReported',
    'incidentType', p_patch->>'incidentType',
    'incidentDescription', p_patch->>'incidentDescription',
    'incidentAction', p_patch->>'incidentAction',
    'updatedAt', coalesce(p_patch->>'updatedAt', now()::text)
  ));

  select jsonb_agg(case when sh.shift->>'id' = p_shift_id then sh.shift || v_safe_patch else sh.shift end)
    into v_shifts
  from jsonb_array_elements(coalesce(v_payload->'shifts', '[]'::jsonb)) as sh(shift);

  v_payload := jsonb_set(v_payload, '{shifts}', coalesce(v_shifts, '[]'::jsonb), true);

  update public.app_snapshots
  set payload = v_payload, updated_at = now()
  where id = v_snapshot_id;

  return jsonb_build_object('ok', true, 'payload', v_payload);
end;
$$;

grant execute on function public.employee_portal_login(text, text) to anon, authenticated;
grant execute on function public.employee_portal_update_shift(text, text, text, text, jsonb) to anon, authenticated;
