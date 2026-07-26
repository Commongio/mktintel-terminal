-- 011_alert_prefs.sql — V14.5 per-user alert routing + market-cap filtering.
--
-- WHY: alerts were all-or-nothing per device (one nullable asset_class column).
-- Users need to choose WHICH sides and WHICH timeframes reach their phone, and
-- to exclude market-cap tiers they don't trade. Arrays rather than a join table:
-- the sets are tiny, fixed, and always read whole.
--
-- NULL means "no preference recorded" and is treated as ALLOW ALL by
-- lib/alertPrefs.js. That is deliberate — an existing subscriber must keep
-- getting exactly what they got before this migration ran, never less.
--
-- Safe to run on an existing table; safe to re-run.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS alert_sides      text[],
  ADD COLUMN IF NOT EXISTS alert_timeframes text[],
  -- Per-side cap tiers, e.g. {"options":["large","mega"],"equity":["mega"]}.
  -- jsonb rather than another array because it is keyed by side.
  ADD COLUMN IF NOT EXISTS alert_caps       jsonb;

-- Market cap at the time the signal fired. Stored ON the signal (not looked up
-- later) so filtering is reproducible: a company that crosses a tier boundary
-- next quarter must not retroactively change which alerts were correct.
ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS market_cap numeric;

COMMENT ON COLUMN public.push_subscriptions.alert_sides IS
  'V14.5: asset classes this device wants. NULL = all.';
COMMENT ON COLUMN public.push_subscriptions.alert_timeframes IS
  'V14.5: horizon buckets (SCALP/INTRADAY/HOURLY/SWING/DAILY/MONTHLY/YEARLY). NULL = all.';
COMMENT ON COLUMN public.push_subscriptions.alert_caps IS
  'V14.5: per-side market-cap tiers, {side: [tier,...]}. NULL = all. Not applied to futures.';
COMMENT ON COLUMN public.signals.market_cap IS
  'V14.5: underlying market cap when the signal fired; drives cap-tier alert filtering.';
