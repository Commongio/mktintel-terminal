# V.10 PLAN — Terminal Adjustments (MASTER BUILD LIST)

Status: **BUILDING — green flag received 2026-07-11.**
Build order (wave = task): W1 Kronos restructure → W2 galaxy orb → W3 layout freedom →
W4 themes/personalization → W5 AI upgrades → W6 news rating → W7 tour + polish + verify.
Design anchor: ui-ux-pro-max "Modern Dark cinematic" system (glassmorphism, ambient glow,
no pure #000, 150–300ms ease-out transitions, status-color discipline, no AI-purple gradients).

**Batch 2 additions (green-flag message)**: skills-driven visual overhaul; orb 3-tier cues
(<78% silent · 78–90% subtle pulse · 90%+ comet); theme picker (galaxy / globe-news /
world-map-news / live candlestick bg / 2–3 originals); Take-a-Tour onboarding (5 stops,
auto-once post-signup + relaunch in Settings); full per-user persistence incl. chat history;
AI behavior change (news answers ≠ signals; short/detailed ask before signal answers);
Trump icon 🦅→"T"; news gradient impact-rating bars + Data page adaptation; chart page state
persistence fix; font selector; ticker logos; watchlist indicator info popup; AI tool-calling
into the terminal (scoped: registry of app actions via Claude tool use).

**FLAGGED SPLIT → V10.5:** the mobile plan (responsive shell/PWA/push from
PLAN_MOBILE_FUTURE.md). Rationale: largest independent chunk; bundling it with a full visual
overhaul in one build risks destabilizing both. World-map news theme may also land as a
simplified version first (globe + map are the two heaviest theme visuals).

Batch 1 logged 2026-07-11. Notes in *italics* are build-time annotations, not scope changes.

---

## GENERAL TERMINAL / LAYOUT

1. **Full resize in layout editing** — every tab/panel resizable (width AND height), not just
   drag-to-move. *Note: GridDock already passes `resizeConfig` in edit mode; verify handles work
   on all panels and are big/visible enough, and that saved layouts persist w/h. Whatever's
   broken or missing here, make resize first-class.*
2. **Drag-and-drop layout editor on the Data page** too (currently terminal page only).
   *Requires extracting the Data page's cards (news / SEC / insider / options intelligence /
   ask-the-desk) into grid items, same pattern as V9 Phase D.*
3. **Background photo: user-controlled positioning** (reposition/center manually, not just
   auto-cover) **+ NEW: side-panel transparency/solid option** — separate control from the V9
   chat-box transparency toggle. Applies to watchlist/news side panels.
4. **Chart page: remove the clickable ticker quick-list** under the search bar
   (the QUICK_CHART_SYMS row). Search bar stays.
5. **Main terminal page: move the TradingView mini chart (TerminalChart) below everything else
   and enlarge it.** Goal: page becomes taller/scrollable to create room for future features —
   stop cramming everything above the fold.
6. **Data page: same full resize/customization freedom as items 1–2** — every card/tab within
   the Data page individually resizable.

## KRONOS BOT

7. **Remove the entire left panel** currently holding "STREAM" and "TAPE · LIVE FILLS".
   *Also removes the fake simulated stream generator (see item 13 — same cleanup).*
8. **Strategies section: simplify — and DELETE dead controls.** *Build-time fact: confirmed the
   Strategies toggles/thresholds write to localStorage (`kronos_strategies`) but the signal
   engine NEVER reads them — they are 100% cosmetic today. Per instruction: remove them
   entirely rather than simplify. Decide at build whether the tab disappears or gets one or two
   controls that genuinely wire into the engine (e.g. min-conviction slider → engine's
   minConviction).*
9. **BUG — mode isolation.** Switching Options ⇄ Futures must scope EVERYTHING to the active
   mode: no futures signals in the options feed, no paper-trading futures positions, no
   "TopStep 50k Express" eval banner, no futures shadow-account entries showing in Options mode.
   *Known bleed sources to fix: PropFirmPanel/eval banner render mode-agnostically (prop-firm
   eval is a futures concept — hide or make mode-aware in Options); paper trading state is a
   single shared account (split per mode or scope displays); shadow account entries need
   assetClass filtering (field exists since V9); Analytics tab fills/stats are futures mock
   data (see 13). SignalFeed already filters by asset_class — verify the rest.*
10. **Server signal feed: bigger, and/or relocate into the left-panel space freed by item 7.**
    *Natural combo: left panel becomes the signal feed column.*
11. **Signal feed: richer/more informational entries** (full context per signal, not terse
    one-liners) **+ onboarding step for preferred signal cadence: daily / weekly / monthly /
    yearly / all.** *Design decision needed at build: interpret cadence as feed
    filtering/notification frequency by signal timeframe (intraday vs swing vs position).
    Current engine runs 15min/1h intervals — "monthly/yearly" signals imply adding
    higher-timeframe engine runs (1d candles exist already; weekly/monthly aggregation needed).
    Will confirm interpretation with Gio before or during build.*
12. **Show the active trading session** (London / Asia / New York, etc.) in the bot.
    *Pure clock math from ET/UTC — no API needed; matches Kronos Map's session-filter concept.*
13. **Remove ALL placeholder/fake numbers not tied to real data** — the +$1,235 session P&L,
    mock fills/win-rate, simulated stream scores, decorative orb conviction, INIT_SIGNALS /
    INIT_FILLS mock arrays, etc. Real data or nothing (honest empty states). *This also
    resolves the Analytics tab's fake equity curve — replace with shadow-account/paper data
    only, or empty state until data accumulates.*

14. **VIX-reactive 3D galaxy orb + comet signal launches** (replaces current CSS orb):
    - **Galaxy visual**: rotating particle field with spiral/nebula look (not a solid sphere).
    - **Color = live VIX**, smooth gradient transitions (no hard snaps):
      cool blue/teal < ~15 · purple/white 15–20 · amber/orange 20–30 · red 30+.
    - **Rotation speed/turbulence scales with VIX** (calm = slow, fear = fast) — functions as an
      ambient volatility gauge even with zero signals.
    - **90%+ conviction FIRE → comet launch**: signal visibly shoots out of the orb toward the
      signal feed panel with ticker/direction/conviction riding the trail, lands and highlights
      as the new feed entry. A "big moment," not a quiet list update. *Synergy with items 7/10:
      feed lives in the freed left column, so the comet trajectory is orb → left panel.*
    - **Data**: ^VIX through the existing redundant data layer (Yahoo supports ^VIX), polled
      ~60s with cache; graceful fallback to neutral palette if VIX unavailable.
    - **Performance budget (runs continuously)**: hard particle cap, pause via
      `visibilitychange` when tab hidden, cap devicePixelRatio, respect
      `prefers-reduced-motion` (static gradient orb).
    - **Tech choice — lighter-weight option exists, flagging as requested**: a plain **2D canvas
      particle system** (zero dependencies, rAF loop, additive blending, spiral distribution with
      fake-3D rotation) can produce this exact galaxy/comet look at orb size for ~0KB bundle
      cost, vs Three.js/@react-three/fiber at ~150KB+ gzip + reconciler overhead. Recommendation:
      build 2D-canvas first; escalate to three.js only if the visual doesn't land. Decide at build.
    - **OPEN QUESTION (spec not final)**: do sub-90% signals get a smaller orb cue (ripple/pulse/
      spark) or land silently in the feed? Awaiting Gio's answer — comet interaction spec is
      frozen until then.

---

## AWAITING FROM GIO
- Batch 2+ of adjustments / new feature ideas (expected before finalizing)
- Interpretation call on item 11 cadence (will propose at build if not clarified)
- Green flag: **"Build V10"**

## Carryover housekeeping (can ride along with V10)
- Paste `supabase/migrations/002_fix_redeemed_by_fk.sql` in Supabase SQL editor
- cron-job.org 5-minute scheduler for the live signal feed (SETUP_V9.md §2)
