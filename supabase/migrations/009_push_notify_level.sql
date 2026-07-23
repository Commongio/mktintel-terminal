-- 009_push_notify_level.sql — V13.6: configurable push notification tier.
--
-- Diagnosis of "signals show on iPhone but no push": the cron only ever pushed
-- FIRE signals (status === 'FIRE'), never HOLD/SCAN. That's a sensible default —
-- HOLD/SCAN are context, not a call to action — but it was hardcoded and silent.
-- This makes the tier a per-device setting instead:
--   'fire' (default) — only fired, actionable setups notify.
--   'all'            — also notify on HOLD (forming) setups that clear the
--                      device's conviction bar, for users who want the earlier heads-up.
-- Combined with the existing min_conviction, each device controls its own noise.
--
-- Run this in the Supabase SQL editor.

alter table public.push_subscriptions
  add column if not exists notify_level text not null default 'fire'
  check (notify_level in ('fire', 'all'));
