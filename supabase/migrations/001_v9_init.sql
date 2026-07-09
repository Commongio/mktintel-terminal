-- V9 initial schema: registration codes, user settings, signals, subscriptions.
-- Run this in the Supabase SQL editor (Dashboard -> SQL -> New query -> paste -> Run).

-- ── REGISTRATION CODES ────────────────────────────────────────────────────────
create table if not exists public.registration_codes (
  code         text primary key,
  status       text not null default 'unused' check (status in ('unused','used','revoked')),
  redeemed_by  uuid references auth.users(id),
  redeemed_at  timestamptz,
  batch_label  text,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists reg_codes_status_idx on public.registration_codes(status);
create index if not exists reg_codes_batch_idx  on public.registration_codes(batch_label);

-- ── USER SETTINGS (one row per user; all per-account personalization) ─────────
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  settings    jsonb not null default '{}'::jsonb,  -- theme, fontSize, botMode, brokerUrl, chatStyle, background, layouts, notes
  updated_at  timestamptz not null default now()
);

-- ── SERVER-GENERATED STANDARDIZED SIGNALS ────────────────────────────────────
create table if not exists public.signals (
  id             bigint generated always as identity primary key,
  asset_class    text not null check (asset_class in ('futures','options')),
  symbol         text not null,
  interval       text not null,
  status         text not null,             -- FIRE / HOLD / SCAN
  direction      text not null,             -- LONG / SHORT / NEUTRAL
  conviction     int  not null,
  plan           jsonb,                     -- entry/stop/t1/t2 (+ contractGuidance for options)
  agents         jsonb,
  engine_version text,
  created_at     timestamptz not null default now()
);
create index if not exists signals_lookup_idx on public.signals(asset_class, symbol, interval, created_at desc);
create index if not exists signals_created_idx on public.signals(created_at desc);

-- ── SUBSCRIPTIONS (Stripe) ────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id  text,
  stripe_sub_id       text,
  tier                text not null default 'free',
  status              text not null default 'none',
  current_period_end  timestamptz,
  updated_at          timestamptz not null default now()
);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
alter table public.registration_codes enable row level security;
alter table public.user_settings      enable row level security;
alter table public.signals            enable row level security;
alter table public.subscriptions      enable row level security;

-- registration_codes: no client access at all (service role only).
-- user_settings: users read/write only their own row.
drop policy if exists "own settings read"  on public.user_settings;
drop policy if exists "own settings write" on public.user_settings;
drop policy if exists "own settings update" on public.user_settings;
create policy "own settings read"   on public.user_settings for select using (auth.uid() = user_id);
create policy "own settings write"  on public.user_settings for insert with check (auth.uid() = user_id);
create policy "own settings update" on public.user_settings for update using (auth.uid() = user_id);

-- signals: any authenticated user may read (standardized feed); writes via service role only.
drop policy if exists "signals read" on public.signals;
create policy "signals read" on public.signals for select using (auth.role() = 'authenticated');

-- subscriptions: users read their own; writes via service role (Stripe webhook).
drop policy if exists "own subscription read" on public.subscriptions;
create policy "own subscription read" on public.subscriptions for select using (auth.uid() = user_id);

-- ── ATOMIC CODE REDEMPTION ───────────────────────────────────────────────────
-- Burns a code exactly once; returns true if this call won the code.
create or replace function public.redeem_registration_code(p_code text, p_user uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  updated int;
begin
  update public.registration_codes
     set status = 'used', redeemed_by = p_user, redeemed_at = now()
   where code = p_code and status = 'unused';
  get diagnostics updated = row_count;
  return updated = 1;
end;
$$;

-- Enable realtime on signals (Dashboard -> Database -> Replication -> add public.signals),
-- or run: alter publication supabase_realtime add table public.signals;
