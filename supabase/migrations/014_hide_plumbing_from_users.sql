-- 014_hide_plumbing_from_users.sql -- the ecosystem's internals are dev-only.
--
-- THE HOLE. `signals` carries RLS "for select using (auth.role() =
-- 'authenticated')" -- row-level, and permissive. Row policies say WHICH ROWS a
-- role may read; they say nothing about WHICH COLUMNS. So any signed-in user,
-- with the anon key already shipped to their browser, could read every column
-- of every signal.
--
-- That was harmless when the table held what the UI displays. Migration 013
-- changed it: `provenance` carries the full decision internals -- every agent's
-- raw data, the structure analysis, the risk verdict, the aggregate gate's
-- delta and the pre-gate status -- alongside conviction_raw, the setup lineage,
-- and the grading audit trail. None of it is rendered anywhere. All of it was
-- readable with two lines of JavaScript.
--
-- Column-level GRANTs are the fix, and they compose with RLS rather than
-- replacing it: the row policy still decides which rows, and these decide which
-- columns of them.
--
-- SAFE BECAUSE EVERY CLIENT READ NAMES ITS COLUMNS. Verified before writing
-- this -- SignalFeed, TickerOverview and page.js each pass an explicit list,
-- and no client path anywhere issues select(*) against this table. A revoked
-- column raises "permission denied" only for a query that actually asks for it,
-- so nothing the UI requests can break. If a future client adds select(*) it
-- will fail loudly and immediately, which is the correct outcome: it is asking
-- for data users are not meant to have.
--
-- service_role bypasses all of this, so every server route, the cron, the
-- lifecycle grader and the Lab emitter are unaffected.

do $$
declare
  hidden text[] := array[
    'provenance',          -- the entire engine internals blob
    'conviction_raw',      -- pre-gate conviction; the gate's delta is inferable from it
    'setup_id',            -- re-write family lineage
    'streak_started_at',
    'revision',
    'degraded',            -- data-quality state; not surfaced in the UI
    'graded_by',
    'graded_at',
    'went_red_at'          -- drawdown bookkeeping, server-side only
  ];
  col text;
begin
  foreach col in array hidden loop
    -- Guard on existence: these arrived across several migrations and this file
    -- must stay re-runnable against a database at any point in that sequence.
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'signals' and column_name = col
    ) then
      execute format('revoke select (%I) on public.signals from authenticated', col);
      execute format('revoke select (%I) on public.signals from anon', col);
    end if;
  end loop;
end $$;

-- What users legitimately see, stated explicitly rather than left as "whatever
-- is not revoked". A column added later is readable by default, so this list is
-- the thing to check when one is.
--
--   id, asset_class, symbol, interval, status, direction, conviction, plan,
--   agents, source, created_at, state, resolved_at
--
-- `agents` stays visible on purpose: the per-agent reasons are a product
-- surface the feed renders. `provenance.agent_data` -- the raw numbers behind
-- those reasons -- does not.

comment on column public.signals.provenance is
  'DEV ONLY. Revoked from anon and authenticated at the column level (migration 014). Row-level RLS does not restrict columns, so a permissive select policy exposed this entire blob to any signed-in user. Readable only via service_role.';
