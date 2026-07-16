-- 003_signal_source.sql — V10.5: tag where a signal came from.
--
-- Bug this fixes: a user searches a ticker not in the curated tier list (e.g. MU),
-- gets a real FIRE/HOLD signal in the scanner panel, it persists to `signals`
-- (multi-agent-signal route already did this since V10.6) — but SignalFeed's
-- client-side risk-tier filter silently drops it, because any unrecognized symbol
-- defaults to the "small" (high-risk) tier, which most risk profiles hide.
-- A signal the user explicitly searched for should never be hidden by a tier
-- filter meant to gate what the CRON auto-discovers for them.
--
-- Fix: tag rows with where they came from, and let the feed bypass the tier
-- filter (but keep the conviction + cadence filters) for manually-searched rows.
--
-- Run this in the Supabase SQL editor (Dashboard -> SQL -> New query -> paste -> Run).

-- Values:
--   'cron'    — the scheduled standardized sweep (the normal feed).
--   'refresh' — a user hit REFRESH on the feed; same standardized scan, just run
--               on demand. Filtered identically to 'cron' (tier filter applies) —
--               it's tracked separately only so on-demand load is auditable.
--   'manual'  — the user searched THIS ticker specifically. Bypasses the risk-tier
--               filter, because that filter exists to gate auto-discovery, not to
--               hide a ticker the user deliberately typed in.
alter table public.signals
  add column if not exists source text not null default 'cron' check (source in ('cron', 'manual', 'refresh'));

create index if not exists signals_source_idx on public.signals(source);
