-- 003_signal_source.sql — V10.5: tag where a signal came from.
--
-- CORRECTION (2026-07-16): an earlier version of this comment claimed this fixed
-- the "MU doesn't show in the feed" bug, on the theory that MU fell through to the
-- "small" tier and got hidden. That was WRONG and is retained here only so nobody
-- re-derives it: MU is explicitly in CURATED.large (lib/universe.js), so
-- symbolTier("MU") === "large" and EVERY risk profile shows it. The tier filter
-- never touched MU. The real MU cause was that on-demand scans didn't persist at
-- all — fixed separately by persistIfStrong() in app/api/multi-agent-signal/route.js.
--
-- What this migration ACTUALLY fixes: the same class of bug for tickers that are
-- genuinely NOT in the curated tier list. symbolTier() defaults an unknown symbol
-- to "small", and Conservative/Balanced profiles hide the small tier — so a user
-- who searches e.g. SAVA / IONQ / RKLB / ACHR / SOUN / BBAI, gets a real FIRE/HOLD,
-- and has it persisted, would still never see it in their feed. Those are exactly
-- the small/micro-cap names the "hidden gems" scans are for.
--
-- The principle: the tier filter exists to gate what the engine AUTO-DISCOVERS on
-- the user's behalf. It should never hide a ticker the user deliberately typed in.
--
-- Fix: tag rows with where they came from, and let the feed bypass the TIER filter
-- (conviction + cadence filters still apply) for manually-searched rows.
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
