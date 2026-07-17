-- 004_push_subscriptions.sql — V11 M3: Web Push subscriptions.
--
-- NOTE ON NUMBERING: PLAN_MOBILE_FUTURE.md called this "migration 003", but 003
-- was taken by signal_source in V10.5. This is 004. Run 003 first if you haven't.
--
-- One row per DEVICE, not per user: a trader with a phone and a desktop should
-- get the alert on both. `endpoint` is the browser-issued push URL and is the
-- natural unique key — re-subscribing on the same device returns the same
-- endpoint, so the unique constraint makes re-subscribe an idempotent upsert
-- instead of quietly duplicating rows and double-notifying.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL -> New query -> paste -> Run).

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  -- What this device wants. Mirrors the user's in-app conviction slider so a
  -- push can respect the same bar the feed does.
  min_conviction int not null default 65,
  asset_class text,                      -- null = both futures and options
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_sent_at timestamptz
);

create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Owner-only. A push endpoint is a capability: anyone holding it can send that
-- device a notification, so these rows must never be readable across accounts.
drop policy if exists "own push subs" on public.push_subscriptions;
create policy "own push subs" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The cron fans out with the service-role key, which bypasses RLS by design.
