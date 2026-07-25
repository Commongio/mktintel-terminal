-- 010_signal_went_red.sql — V14 long-term "position is red" alerting.
--
-- WHY: INVEST (equity) signals are held for months, not minutes. If one turns
-- negative the user needs to know immediately — but the lifecycle grader runs on
-- every scan, so without a marker it would re-push the same bad news every few
-- minutes until the position resolved. This column records the moment a signal
-- first went red so the push fires exactly once.
--
-- Nullable + no default: NULL means "has not gone red", a timestamp means
-- "already alerted at this time". Safe to run on an existing table.

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS went_red_at timestamptz;

-- Partial index: the grader only ever asks for active rows that have NOT yet
-- been alerted, so indexing just those keeps it cheap as the table grows.
CREATE INDEX IF NOT EXISTS signals_went_red_pending_idx
  ON public.signals (asset_class, state)
  WHERE went_red_at IS NULL;

COMMENT ON COLUMN public.signals.went_red_at IS
  'V14: first time this signal went negative vs entry. Set once, drives the one-shot long-term drawdown push.';
