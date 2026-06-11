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
