-- 006_signal_state.sql — V12: persisted signal lifecycle state.
--
-- Supersedes the old time-based feed rule (4h cap → then current+previous
-- trading day). Signals are no longer dropped by time; they live until they
-- reach a TERMINAL state. State is persisted (not client-ephemeral) because the
-- bot and terminal must share one lifecycle, and lost/invalidated trades are
-- kept for the self-learning engine to analyze.
--
-- States:
--   active       — still valid, still shown.
--   won          — price hit the take-profit (plan.t1). Graded server-side.
--   lost         — price hit the stop (plan.stop). Graded server-side.
--   invalidated  — a superseding opposite/neutral signal arrived; setup gone.
--
-- Feed shows active + won; hides lost + invalidated (kept for analysis).
--
-- Degrades safely without this migration: the feed falls back to a query
-- without `state` (like the `source` fallback), and grading no-ops. Run in the
-- Supabase SQL editor.

alter table public.signals
  add column if not exists state text not null default 'active'
  check (state in ('active', 'won', 'lost', 'invalidated'));

-- Grading also records WHEN a terminal state was reached (for autopsy timing +
-- feed ordering of recently-resolved winners).
alter table public.signals
  add column if not exists resolved_at timestamptz;

create index if not exists signals_state_idx on public.signals(state);
