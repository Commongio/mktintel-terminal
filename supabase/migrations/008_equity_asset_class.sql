-- 008_equity_asset_class.sql — V13.5: investing / portfolio-growth signals.
--
-- Adds a third asset class, 'equity', alongside futures and options. Equity
-- signals are the long-horizon "grow the portfolio" side of the product:
-- BUY / HOLD / SELL (mapped from the engine's internal LONG / NEUTRAL / SHORT
-- via lib/signalLabels.js), generated on daily+ candles over large caps.
--
-- The signals table's asset_class CHECK constraint must be widened before the
-- cron can insert equity rows — otherwise every equity insert 23514-fails.
-- Run this in the Supabase SQL editor.

alter table public.signals drop constraint if exists signals_asset_class_check;
alter table public.signals
  add constraint signals_asset_class_check
  check (asset_class in ('futures', 'options', 'equity'));
