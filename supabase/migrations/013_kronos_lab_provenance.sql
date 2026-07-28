-- 013_kronos_lab_provenance.sql — capture what runSignalEngine computes and throws away.
--
-- runSignalEngine returns structure, confirmation, bullWeight/bearWeight, risk,
-- price, candleCount, degraded, and each agent's `data`. writeIfChanged persists
-- none of it. Those fields are not deleted later — they never land, so no reader
-- at any frequency can reconstruct them. This migration gives them somewhere to go.
--
-- Split deliberately: fields that get filtered, grouped, or joined become real
-- columns; the large, rarely-queried objects go in one jsonb blob. At this
-- volume (one daily cron plus manual refreshes) that is the right trade.
--
-- Every column is nullable with no default, so historical rows stay valid and
-- insertSignal's 42703 fallback keeps working if this has not been run yet.
-- Run in the Supabase SQL editor.

-- ── setup identity ──────────────────────────────────────────────────────────
-- One logical setup emits many rows: writeIfChanged writes when the verdict
-- changed OR the last row is >30min old (generate-signals:119-121, and the same
-- rule duplicated at refresh-feed:69-71). Those rows are NOT duplicates — each
-- re-run recomputes plan.entry at the current price, so a family of twelve is
-- twelve different entries on one view. Counting them as independent
-- observations understates variance in every downstream metric.
alter table public.signals add column if not exists setup_id text;
alter table public.signals add column if not exists streak_started_at timestamptz;
alter table public.signals add column if not exists revision integer;

-- ── conviction, before the gate touched it ──────────────────────────────────
-- applyAggregateGate (generate-signals:103) cuts conviction and can demote
-- FIRE→HOLD, and runs on the cron path only. Storing just the post-gate value
-- means the gate's action is unauditable: signalStats moves, so it can never be
-- replayed. Two columns is the difference between observing and auditing.
alter table public.signals add column if not exists conviction_raw integer;

-- ── data quality ────────────────────────────────────────────────────────────
-- Without this, "a bad call" and "a call made on bad data" are the same row,
-- and the second silently contaminates every failure cluster built from the first.
alter table public.signals add column if not exists degraded boolean;

-- ── who graded this outcome ─────────────────────────────────────────────────
-- Two writers set `state`, and they can race:
--   lib/signalLifecycle.js       selects .eq("state","active") -- will not
--                                overwrite an already-resolved row
--   app/api/admin/signal-outcome .update({state, resolved_at}) by id, with NO
--                                state guard -- a dev grade CAN overwrite a
--                                state the lifecycle already set, and it
--                                overwrites resolved_at too, so the ordering
--                                is unrecoverable afterwards
--
-- Manual grading is discretionary, so it correlates with judgement about which
-- signals looked bad. Metrics must stay sliceable by it, and right now the
-- distinction is not recorded anywhere at all.
--
-- NOTE: this migration only makes the race *observable*. It does not fix it.
-- The guard belongs in the admin route (a `.eq("state","active")` predicate, or
-- an explicit override flag), which is a behaviour change to the trading app
-- and is deliberately left out of this branch.
alter table public.signals add column if not exists graded_by text;
alter table public.signals add column if not exists graded_at timestamptz;

comment on column public.signals.graded_by is
  '''engine'' | ''manual''. Which writer set `state`. Never inferred -- manual grading is discretionary and must remain sliceable.';

-- ── everything else ─────────────────────────────────────────────────────────
-- structure (swept levels, FVGs, swings, events), confirmation (the object
-- behind FIRE/HOLD), risk, bull_weight/bear_weight, uncapped_conviction,
-- data_source, candle_count, min_conviction_at_write, gate{}, chop_applied.
alter table public.signals add column if not exists provenance jsonb;

-- Collapsing a re-write family to one row per setup is the single most common
-- Lab query; without this index it is a full scan on every metric refresh.
create index if not exists signals_setup_id_idx on public.signals (setup_id);
create index if not exists signals_setup_rev_idx on public.signals (setup_id, revision desc);

comment on column public.signals.setup_id is
  'Stable identity across a re-write family. Collapse on this before computing any rate — rows within a family are correlated observations, not independent ones.';
comment on column public.signals.conviction_raw is
  'Conviction before applyAggregateGate. Differs from `conviction` only on the cron path. The delta is the gate''s action and is otherwise unrecorded.';
comment on column public.signals.degraded is
  'Engine ran on incomplete or stale market data. Rows with degraded=true must be excluded from expectancy, not merely annotated.';
comment on column public.signals.provenance is
  'Fields runSignalEngine computes and previously discarded. See lib/labEmitter.js buildProvenance().';
