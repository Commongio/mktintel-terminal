# KRONOS TERMINAL — AGENT HANDOFF

**Purpose:** everything a fresh agent needs to continue this build without the prior
conversation. Written 2026-07-11 after V10.2. Read this top-to-bottom before touching code.

---

## 0. FIRST, THE NON-OBVIOUS RULES

- **This is NOT the Next.js you know.** See `AGENTS.md` / `CLAUDE.md` — the project warns that
  APIs/conventions may differ from training data; read `node_modules/next/dist/docs/` before
  writing framework code. It's **Next.js 16.2.9 (App Router, Turbopack)**, React 19.2.4.
- **Shell is PowerShell on Windows**, but a Bash tool is also available (Git Bash / POSIX). Use
  absolute paths. `.env.local` is the env file (NOT `.env`).
- **Owner is Giovanni ("Gio")** — a futures/options trader with an active TopStep prop-firm eval,
  author of the "Kronos Map" TradingView indicator. Solo builder. Prefers: **plan first, build on
  an explicit green-flag phrase** ("Build Vxx"); **free-tier data sources**; **brutal honesty**
  about what's real vs simulated vs unverified. Don't oversell. His real money/eval is on the line.
- **Workflow:** when he's listing ideas he's in planning mode — log them, don't build until he
  says go. Version each build with a matching commit message ("V.10.2 - ...").

---

## 1. WHAT THIS IS

A multi-tenant web trading terminal ("MKTINTEL PRO" / "Traders Terminal" / KRONOS). Three main
surfaces + a bot:
- **Trading Terminal** (main): watchlist, AI desk chat, news feed, quick chart.
- **Data** page: news, SEC filings, insider trades, options intelligence.
- **Chart** page: TradingView chart + AI desk.
- **Kronos Bot**: multi-agent signal engine (Options/Futures modes), VIX orb, signal feed.

Business model: access-code signup now → paid tiers later (Stripe scaffolded, not charging yet).

**Stack:** Next.js 16 / React 19 / Supabase (auth + Postgres + RLS + Realtime) / Stripe /
Vercel (deployed) / @splinetool/react-spline / react-grid-layout. All UI is inline-styled JSX
(no Tailwind/CSS modules). Fonts via Google Fonts import in page.js.

---

## 2. DEPLOYMENT & ENV — CURRENTLY LIVE

- **Live URL:** https://market-terminal-giovanni-mrkt-trml-project.vercel.app
- **Vercel project:** `market-terminal` (team giovanni-mrkt-trml-project, account "commongio").
  CLI authenticated on Gio's machine; repo linked via `.vercel/`.
- **Supabase project ref:** `bqjpvmanlosyxflljjeu`. Schema applied (migrations in
  `supabase/migrations/`). Migration `002_fix_redeemed_by_fk.sql` — CHECK whether Gio ran it
  (fixes user-deletion FK); if account deletes 500, it's not applied yet.
- **Env vars** live in `.env.local` (gitignored — never commit; values also set in Vercel dashboard):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `OWNER_EMAILS` (comma list; unlocks `/admin`), `FINNHUB_API_KEY`, `ANTHROPIC_API_KEY`,
  `TWELVE_DATA_API_KEY`, `ACCESS_CODES`, `CRON_SECRET`. Optional: `ALPHA_VANTAGE_API_KEY`,
  Stripe (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `NEXT_PUBLIC_APP_URL`).
  **NEVER print `SUPABASE_SERVICE_ROLE_KEY` or paste secrets into chat.** After editing
  `.env.local`, restart dev server (env doesn't hot-reload). Vercel needs the same vars set in
  its dashboard (a `.env.local` doesn't deploy).
- **Env-gating:** with NO Supabase vars the app falls back to the legacy single-user access-code
  gate. With them set, full multi-tenant auth is active.
- **Signal cron:** `vercel.json` has a daily Vercel cron (Hobby-tier limit). Real cadence is an
  external **cron-job.org** job hitting `/api/cron/generate-signals` every **2 min** (Mon–Fri
  13:00–21:00 UTC) with header `Authorization: Bearer <CRON_SECRET>`. See `SETUP_V9.md` §2.
- **Gio's own account:** `gio.f1491@icloud.com` (in Supabase). He signs IN, doesn't re-signup.

---

## 3. GIT STATE — IMPORTANT

- **Last commit:** `a5fa370 V.9.1` — this is the tip of `origin/main`.
- **EVERYTHING from V10, V10.1, V10.2 is UNCOMMITTED** working tree (~29 changed/new files).
  Nothing after V9.1 is committed or pushed yet. When Gio's ready, commit as e.g.
  "V.10.2 - Spline themes + galaxy orb, collapsible panels, signal lifecycle, market breadth +
  risk tiers, Kronos Mentor". `.env.local` and `.vercel/` are gitignored.
- Vercel auto-deploys on push to main, so pushing V10.2 will deploy it.

---

## 4. VERSION HISTORY (what each shipped)

- **V5–V8.2** (committed up to earlier): terminal build → Kronos dashboard → access gate, options
  intelligence, FOMC, Twitter RSS → broker connect, TradingView fix, market status → real signal
  engine, prop-firm panel, Schwab OAuth → **V8.2** multi-agent engine (TECHNICAL/STRUCTURE/
  SENTIMENT + RISK + Portfolio Manager → FIRE/HOLD/SCAN), Yahoo candles, shadow account, paper
  trading. **Integrated from a zip early in the relationship.**
- **V9 / V9.1** (COMMITTED, live): multi-tenant Supabase auth + one-time registration codes +
  owner `/admin`; redundant market-data layer (`lib/marketData.js`, Yahoo→Finnhub→TwelveData→
  AlphaVantage failover + cache); mode-aware bot (Options vs Futures — genuinely different agents);
  side-by-side broker popup (no auto-trade — signals + manual execution by design); drag-drop
  layouts; personalization; Stripe scaffold. V9.1 fixed a signup 500 (supabase-js query builders
  are thenables with **NO `.catch`** — never chain `.catch` on them) + FK migration + Hobby cron.
- **V10** (UNCOMMITTED): huge visual + feature wave. Real-data-only Kronos (deleted all mock P&L/
  fills/stream), rich signal feed as left column, session clock, strict mode isolation, Strategies
  tab deleted (was cosmetic) → one real minConviction slider, news impact rating bars, Trump icon
  🦅→"T", chart-state persistence, font selector, ticker logos, watchlist indicator info popup,
  Take-a-Tour onboarding, AI behavior change (news≠signals; ask short/detailed before signals),
  **AI tool-calling into the terminal** (change theme/mode/view/watchlist via Claude tool_use),
  full per-account persistence incl. chat history.
- **V10.1** (UNCOMMITTED, SUPERSEDED): tried a hand-coded Three.js/R3F galaxy orb. Rejected by Gio
  (rendered as a blur blob — additive-blending saturation). **R3F removed** (three + @react-three/
  fiber uninstalled, `GalaxyOrbScene.jsx` deleted).
- **V10.2** (UNCOMMITTED, CURRENT): see §5.

---

## 5. V10.2 — CURRENT STATE (just built, not committed)

All 7 parts built, clean `npm run build`, functionally browser-verified (caveat in §6).

1. **Themes → 7 total** (Gio said "3 only" then reversed it). `ThemeBackdrop.jsx` is a hybrid:
   - BASIC (canvas/CSS, lightweight): Classic, Aurora, Grid Pulse, World Map, Live Candles.
   - 3D SCENES (Spline, lazy): **Galaxy ✦** (`Rn1dqmyY6dNdzmwQ` — Gio-confirmed good) and
     **News Globe ✦** (`reuzmBdkGBVupF0T` default + canvas news-burst overlay).
   - Scene registry: `lib/splineScenes.js` (6 globe candidates listed, one-line swappable).
   - Color: `THEME COLOR` hue/sat/brightness sliders (Settings→Personal) = CSS filter on the
     scene (only reliable lever on scenes we didn't author). Galaxy also auto-tints with VIX.
   - `migrateTheme()` in page.js remaps only retired `globe`→`newsglobe`.
2. **Kronos orb** (`GalaxyOrb.jsx`): the Spline galaxy + a 2D-canvas overlay for the 3-tier signal
   cues (**<78% silent / 78–90% pulse ring / ≥90% comet launch to feed** via `CometLayer`). VIX
   color via CSS filter; rotation-speed best-effort (can't drive Spline's internal spin — Gio OK'd).
   Static gradient fallback for reduced-motion / Spline load failure. External API unchanged so
   `BotDashboard` didn't need edits.
3. **Collapsible panels** (`CollapseRail.jsx`): terminal side panels + bot feed/scanner columns +
   GridDock panels. Persisted (`kronos_personal.collapsed`, `kronos_bot_collapsed`).
4. **Signal feed lifecycle** (`SignalFeed.jsx`): dedupe newest-per-instrument on load; invalidate
   when a newer opposite/no-setup signal supersedes (blur + "INVALIDATED" bar, 25s grace); 4h hard
   cap; 5s sweep.
5. **Cron 2-min + gating audit**: docs updated to 2-min (external cron; NOT a code change).
   **AUDITED & CONFIRMED**: every signal's status comes purely from the multi-agent portfolio vote
   + risk gate (`lib/signalEngine.js:~241`). No raw-price-trigger path exists.
6. **Market breadth + risk tiers** (`lib/universe.js`): tiered universe (large/mid/small cap) +
   `fetchMostActives()` (Yahoo screener w/ crumb handshake, best-effort) + curated fallback. Cron
   scans a broadened options universe (capped 24 chains to protect free tiers). Feed filters by
   `allowedTiers(profile)` — Conservative/Beginner=large only, Balanced=large+mid, Aggressive=all,
   Adaptive=VIX-driven. Maps onto the EXISTING onboarding risk profile (didn't add a new step).
7. **Kronos Mentor** (`KronosMentor.jsx`): 🤖 header icon → "Coming Soon" placeholder (concept =
   AI mentor coaching new traders toward hedge-fund-grade). Placeholder only, copy stored.

---

## 6. VERIFICATION CAVEAT — READ THIS, IT WILL SAVE YOU HOURS

The Claude Code **browser-automation sandbox forces `prefers-reduced-motion: true`** and does not
fire `requestAnimationFrame` for the tab (confirmed with a raw rAF test). Consequences:
- `computer{action:"screenshot"}` **times out** on canvas/animation-heavy pages.
- All animated visuals (Spline scenes, canvas themes, the orb) **deliberately fall back to static/
  Classic under reduced-motion**, so you **cannot visually verify them in-sandbox**. This is not a
  bug — do NOT "fix" it by chasing the animation.
- **Verify functionally instead:** `read_page`, `get_page_text`, `read_console_messages`
  (onlyErrors), `read_network_requests` (e.g. confirm Spline chunks lazy-load), and
  `javascript_tool` (sample canvas pixels, read localStorage, check DOM). This is how V10/V10.2
  were verified. **Gio must eyeball the actual Spline/canvas visuals in his real browser** — say so
  honestly, don't claim you saw motion you couldn't.

**Verify test-account pattern** (used repeatedly): insert a disposable `registration_codes` row via
service-role curl → sign up → test → DELETE the auth user + code via curl. Always clean up.

---

## 7. KEY FILES MAP

```
app/page.js                     Main terminal shell (~1600 lines): views, header, settings panel,
                                theme render, AI action registry, per-account persistence sync.
app/components/
  BotDashboard.jsx              Kronos bot: modes, orb, feed/scanner columns, tabs, collapse.
  GalaxyOrb.jsx                 Spline galaxy + pulse overlay + CometLayer + activeSessions().
  SplineEmbed.jsx               Lazy Spline wrapper (CSS filter color, onAppReady).
  ThemeBackdrop.jsx             Hybrid: canvas basics + Spline scenes.
  SignalFeed.jsx                Rich feed: lifecycle, cadence + risk-tier filtering, comet target.
  MultiAgentSignal.jsx          On-demand scanner panel (per-mode paper accounts).
  ShadowAccountPanel.jsx        Shadow account + paper trading (per-mode).
  BotFlowPopups.jsx             Mode-select + cadence + broker side-by-side popups.
  GridDock.jsx                  react-grid-layout wrapper (v2 API: gridConfig/dragConfig/resizeConfig).
  CollapseRail.jsx              Collapse chrome. TourGuide.jsx  KronosMentor.jsx  TickerLogo.jsx
  AuthGate.jsx / AccessGate.jsx Supabase auth / legacy code gate.
lib/
  signalEngine.js               Shared multi-agent engine (runSignalEngine). THE brain.
  marketData.js                 Redundant provider failover + cache (quotes/candles).
  optionsData.js                Yahoo options chains (cookie+crumb handshake).
  universe.js                   Tiered scan universe + most-actives + allowedTiers().
  vixColor.js                   VIX→color/label/speed + splineFilter (CSS color).
  splineScenes.js               Spline scene IDs. newsImpact.js  indicators.js  supabase*.js
app/api/
  cron/generate-signals/        Server signal feed writer (scans universe, writes to `signals`).
  multi-agent-signal/           On-demand engine endpoint.
  scan/                         AI desk (Claude API + web_search + terminal-control tools).
  auth/signup, admin/codes, settings, stripe/*, candles, yf-quotes, technicals, news, ...
supabase/migrations/            001_v9_init.sql, 002_fix_redeemed_by_fk.sql
SETUP_V9.md                     Supabase/Stripe/cron setup guide (still current).
PLAN_V10.md                     V10 master list. PLAN_MOBILE_FUTURE.md  PLAN_V9.md
```

---

## 8. OPEN ITEMS / FLAGS (decisions for Gio, or next-build candidates)

- **⚠ SECURITY (flagged, NOT fixed):** `BrokerConnect.jsx` still lets users paste live Tradier/IBKR
  API tokens into a **plaintext `kronos_broker_creds` localStorage** key — a leftover from before
  the V9 pivot to the side-by-side-window model (which killed credential storage). Real exposure
  risk. Deliberately NOT synced to Supabase. Needs Gio's call: rip out the legacy live-broker-cred
  flow, or knowingly accept it.
- **Spline visuals** need Gio's real-browser eyeball (see §6). If Galaxy/globe look wrong, the
  scene IDs in `lib/splineScenes.js` are one-line swappable (6 globe candidates provided).
- **Mobile** is planned but PARKED: `PLAN_MOBILE_FUTURE.md` (responsive shell → PWA → web-push).
  Biggest independent chunk; do NOT bundle with other work.
- **Migration 002** — confirm Gio ran it in Supabase.
- **cron-job.org** — confirm Gio set the 2-min job (feed is stale without it).
- **Stripe** — scaffolded, not charging; tier feature-gating not wired (deliberate — legal review
  on paid signals first: CTA 4.14(a)(9) / publisher exclusion; keep signals standardized/impersonal).
- **Twelve Data** — still a failover provider; the standalone `/api/twelve-data` route was removed
  in V9. Watchlist technicals now compute in-house (`/api/technicals`).

---

## 9. COMMANDS

- Build: `npm run build` (Turbopack; ~2s compile). Always build-check after edits.
- Dev: start via the browser preview tool (`preview_start {name:"dev"}`) — do NOT run `next dev`
  directly in Bash. `.claude/launch.json` defines the `dev` server on port 3000.
- The user often has their own dev server on 3000; if "port in use", just point the browser at
  http://localhost:3000 or start via the preview tool which reuses/assigns.
- Memory: a persistent roadmap lives at the agent memory path
  `.claude/projects/.../memory/project-kronos-terminal-roadmap.md` — keep it updated (it's the
  cross-session source of truth; this HANDOFF.md is a repo-committed snapshot).

---

## 10. IMMEDIATE NEXT STEPS (when Gio returns)

1. Gio eyeballs V10.2 visuals (themes + orb) in his real browser; report if scenes need swapping.
2. If good: commit V10.2 + push (auto-deploys to Vercel). Confirm Vercel env vars are all set.
3. Decide the BrokerConnect plaintext-credential flag (§8).
4. Confirm migration 002 + cron-job.org 2-min job are in place.
5. Await Gio's next green-flagged batch. (Mobile is the obvious big-ticket remaining item.)
```
