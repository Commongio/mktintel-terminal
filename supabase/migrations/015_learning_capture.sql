-- 015_learning_capture.sql -- what a signal did, not just how it ended.
--
-- Every column here is dev-only and revoked from users at the bottom of this
-- file, for the same reason as migration 014: row-level RLS does not restrict
-- columns, so anything added to this table is readable by any signed-in user
-- unless explicitly taken away.
--
-- MAE and MFE are tracked per scan while a signal is live, not computed at the
-- end. That ordering is the whole point: the grader sees a single spot price
-- every five minutes and cannot reconstruct where price went in between. By
-- recording the running extremes as it observes them, the path becomes visible
-- from observations actually made rather than inferred afterwards.
--
-- It also makes a known grading bug DETECTABLE for the first time.
-- signalLifecycle grades `won` when spot has reached t1, without knowing
-- whether the stop was hit first. But if a signal's recorded MAE already
-- reached 1R on an earlier pass and it now grades won, it provably stopped out
-- first. That is not a heuristic -- it is two recorded observations in
-- sequence.

alter table public.signals
  -- Running extremes in R, where 1R = |entry - stop|. Unitless so a 0.4R
  -- drawdown means the same on NG as on XOM.
  add column if not exists mae_r numeric,
  add column if not exists mfe_r numeric,
  -- And in percent of entry. R says how a trade did against its own risk;
  -- percent is the only unit in which a breakout is visible at all -- a 100%
  -- run on a wide stop can be under 2R and look unremarkable.
  add column if not exists peak_gain_pct numeric,
  add column if not exists peak_loss_pct numeric,
  -- Grading passes this signal has survived. The horizon is open-ended, so
  -- this is the only measure of how long a verdict actually takes.
  add column if not exists bars_seen integer not null default 0,
  -- True when the recorded excursions show the opposite level was reached
  -- before the one it graded on. Never inferred from a single price.
  add column if not exists path_ambiguous boolean,
  -- Which signal replaced this one. Invalidation is 60% of all outcomes and
  -- currently leaves no trace of what superseded what.
  add column if not exists superseded_by text,
  -- Market context AT DECISION TIME, stamped by the engine. Never backfilled:
  -- looking up what VIX was when a past signal fired would attach knowledge to
  -- a decision that did not have it, which is the exact leakage the Lab's
  -- tripwire exists to catch.
  add column if not exists regime jsonb;

create index if not exists signals_ambiguous_idx
  on public.signals (path_ambiguous) where path_ambiguous is true;

-- ── dev-only, like everything else on this table ────────────────────────────
do $$
declare col text;
begin
  foreach col in array array['mae_r','mfe_r','peak_gain_pct','peak_loss_pct','bars_seen','path_ambiguous','superseded_by','regime'] loop
    if exists (select 1 from information_schema.columns
                where table_schema='public' and table_name='signals' and column_name=col) then
      execute format('revoke select (%I) on public.signals from authenticated', col);
      execute format('revoke select (%I) on public.signals from anon', col);
    end if;
  end loop;
end $$;

comment on column public.signals.path_ambiguous is
  'The recorded excursions show the opposite level was reached before the one this graded on -- e.g. MAE hit 1R on an earlier pass and it later graded won, meaning it stopped out first. signalLifecycle tests t1 before stop against a single spot price and cannot see this; the per-pass MAE/MFE tracking can. Never inferred from one price.';
comment on column public.signals.regime is
  'Market context as of decision_time, stamped by the engine at emit. Never backfilled: reconstructing it later would attach post-hoc knowledge to a past decision.';
