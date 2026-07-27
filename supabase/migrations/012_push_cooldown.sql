-- 012_push_cooldown.sql — V14.8: let stale re-writes notify, on a cooldown.
--
-- THE BUG THIS FIXES: the cron writes and pushes on different conditions.
--     write:  changed OR stale        (stale = last row older than 30 min)
--     push:   changed ONLY
-- So a signal that holds the same verdict is re-written into the feed every 30
-- minutes — fresh timestamp, looks brand new — but never notifies. Measured on
-- a real account: 14 of the last 15 signals were blocked purely by this, with
-- every user setting passing. The feed's definition of "new" and push's
-- definition disagreed, and the user only ever sees the feed's.
--
-- Pushing on every stale re-write instead would buzz once per instrument every
-- 30 minutes across the whole universe — which is how people disable
-- notifications permanently. So a stale re-write may notify only if this
-- instrument hasn't notified recently; this column is that timestamp.
--
-- Nullable, no default: NULL means "never pushed", which correctly reads as
-- "cooldown elapsed" and lets the first eligible signal through immediately.
-- Safe to run on an existing table; safe to re-run.

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz;

-- The cron asks one question per instrument: "when did this last notify?"
-- Partial index — rows that never pushed are irrelevant to that lookup.
CREATE INDEX IF NOT EXISTS signals_pushed_at_idx
  ON public.signals (asset_class, symbol, interval, pushed_at DESC)
  WHERE pushed_at IS NOT NULL;

COMMENT ON COLUMN public.signals.pushed_at IS
  'V14.8: when this signal was fanned out to push. Drives the per-instrument cooldown that lets stale re-writes notify without buzzing every 30 minutes.';
