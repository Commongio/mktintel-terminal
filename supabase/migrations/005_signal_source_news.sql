-- 005_signal_source_news.sql — V12 Phase 2: allow news/MCP-sourced signals.
--
-- The signals.source CHECK from migration 003 only permits ('cron','manual',
-- 'refresh'). V12's news-intelligence layer routes CNBC/Investing.com-derived
-- setups into the feed and needs to tag them 'news' (from the /api/mcp/* news
-- interrogation) and 'mcp' (reserved for a future external worker/feed pushing
-- structured signals directly). Without this, inserting such a row fails the
-- CHECK (SQLSTATE 23514).
--
-- The app degrades safely WITHOUT this migration: lib/supabaseServer insertSignal
-- catches the 23514 and retries the write tagged 'cron', so news signals still
-- reach the feed — they just aren't distinguishable as news until this runs.
--
-- A CHECK can't be altered in place; drop and re-add. Both guarded so it's
-- safe to re-run. Run in the Supabase SQL editor.

alter table public.signals drop constraint if exists signals_source_check;

alter table public.signals
  add constraint signals_source_check
  check (source in ('cron', 'manual', 'refresh', 'news', 'mcp'));
