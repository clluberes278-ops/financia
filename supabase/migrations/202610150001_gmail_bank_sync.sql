create table if not exists public.gmail_connection_secrets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  encrypted_refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gmail_connection_secrets enable row level security;
revoke all on public.gmail_connection_secrets from anon, authenticated;

create table if not exists public.gmail_connection_status (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gmail_email text not null,
  last_synced_at timestamptz not null default (now() - interval '90 days'),
  initial_backfill_complete boolean not null default false,
  last_error text,
  connected_at timestamptz not null default now()
);

alter table public.gmail_connection_status enable row level security;
grant select on public.gmail_connection_status to authenticated;
revoke insert, update, delete on public.gmail_connection_status from anon, authenticated;

drop policy if exists "Users can read their Gmail connection status" on public.gmail_connection_status;
create policy "Users can read their Gmail connection status"
  on public.gmail_connection_status for select
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.bank_email_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bank text not null check (length(trim(bank)) > 0),
  gmail_message_id text not null,
  amount numeric(14, 2) not null check (amount > 0),
  currency text not null check (currency in ('DOP', 'USD')),
  type text not null check (type in ('ingreso', 'gasto')),
  category text not null check (category in ('comida', 'transporte', 'entretenimiento', 'servicios', 'salud', 'educacion', 'salario', 'ahorro', 'otros')),
  occurred_at timestamptz not null,
  merchant text not null,
  note text not null,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, gmail_message_id)
);

alter table public.bank_email_transactions enable row level security;
grant select on public.bank_email_transactions to authenticated;
revoke insert, update, delete on public.bank_email_transactions from anon, authenticated;
grant update (is_hidden) on public.bank_email_transactions to authenticated;

drop policy if exists "Users can read their imported bank transactions" on public.bank_email_transactions;
create policy "Users can read their imported bank transactions"
  on public.bank_email_transactions for select
  to authenticated
  using (auth.uid() = user_id and is_hidden = false);

drop policy if exists "Users can hide their imported bank transactions" on public.bank_email_transactions;
create policy "Users can hide their imported bank transactions"
  on public.bank_email_transactions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
