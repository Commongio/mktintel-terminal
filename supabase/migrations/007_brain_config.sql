-- 007_brain_config.sql — V13: developer "brain access" config.
--
-- A tiny key/value store the owner-only /api/admin/brain route reads and
-- writes. Two keys are used today:
--   system_prompt_addendum — free text appended to the AI's system prompt
--                             (app/api/scan/route.js) for every user.
--   v13_popup_content      — {title, bullets:[], links:[]} for the V13 beta
--                             popup (app/components/V13Popup.jsx).
-- Feature flags (prioritizeIndices, futuresAfterHoursBadge, etc.) live under a
-- third key, feature_flags, as a jsonb object of booleans.
--
-- Locked down: only the service-role client (server routes gated by
-- isOwner()) ever touches this table — there is no client-facing policy
-- because there is no client-facing access at all. Degrades safely without
-- this migration: /api/admin/brain and the scan-route addendum lookup both
-- no-op on a missing table.

create table if not exists public.brain_config (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.brain_config enable row level security;
-- No policies created — service-role (which bypasses RLS) is the only writer/reader.
