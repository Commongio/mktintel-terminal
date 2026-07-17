# MOBILE PLAN — V11

Status: **BUILT (M1 + M2 + M3) — green flag 2026-07-16. Uncommitted.**
Route confirmed by Gio: phased web (responsive → PWA → push). Native app stays deferred.
Context: terminal is live at market-terminal-…vercel.app, desktop-first, ~25-user paid signals product.

## BUILD NOTES (what actually shipped vs. this plan)

- **Migration numbering changed**: this doc called push_subscriptions "migration 003",
  but 003 was taken by `signal_source` in V10.5. It shipped as **`004_push_subscriptions.sql`**.
- **Tabs are 6, not 5**: CHAT · CHART · KRONOS · LIST · NEWS · DATA. Chart earned a tab it
  didn't have when this plan was written — V10.6 replaced the TradingView embed with
  lightweight-charts + AI drawing, which made the chart a primary surface rather than a widget.
- **Chart on mobile stacks chart-over-chat** rather than showing one panel. The AI draws AND
  explains; splitting those across two tabs would defeat the feature.
- **`useIsMobile` is mount-then-measure** (returns false on SSR + first paint) to avoid a
  hydration mismatch on exactly the devices this targets.
- **Bot trading tab reorders via CSS `order`**: scanner (1) → feed (2) → orb (3). The orb drops
  640px → 300px. Actionable content wins the top of the viewport; the orb is ambient.
- **Added beyond plan**: `/api/push/test` (a test-send route — otherwise verifying push means
  waiting for a real 65%+ FIRE during market hours), and an explicit iOS "install to home
  screen first" state, since that's the #1 silent push failure on iPhone.
- **Service worker caches NOTHING on purpose.** This is a live market-data app; serving a
  stale price from cache is a real-money bug. The SW exists only to make the app installable
  and to receive push.

---

## RECOMMENDATION (short version)

**Option 1 now (responsive mobile shell), Option 2 as the immediate fast-follow (PWA + push
notifications for FIRE signals), Option 3 (native app) explicitly deferred.**

This confirms the suggested combo, with one upgrade to the reasoning: for a *signals* product,
the killer mobile feature isn't the layout — it's the **push notification when Kronos fires**.
That's Phase M3, it's achievable with free web tech (VAPID Web Push, no app stores), and it's
the thing that makes a paid subscription feel alive. The responsive shell (M1) is the
prerequisite; the PWA wrapper (M2) is ~a day of work and is what unlocks push on iPhone.

**Why not native (now):** a React Native build is a second product — the terminal is ~5,000
lines of inline-styled JSX that would be rewritten, not reused. Add Apple's $99/yr, App Store
review friction (finance/signals apps get extra scrutiny), and a dual-codebase tax forever —
for 25 users it's all cost, no edge. Revisit at 100+ paying users or when app-store presence
becomes a marketing asset. Nothing in M1–M3 is throwaway if that day comes.

**Honest limits to set expectations:** side-by-side trading dies on a phone (no split windows) —
the mobile story becomes "get the signal → app-switch to your broker app," which is how phone
traders actually work. Drag-and-drop layout editing stays desktop-only (touch drag on a dense
grid is misery); mobile gets a fixed, well-designed order instead.

---

## WHAT BREAKS ON A PHONE TODAY (audit)

| Problem | Where | Mobile answer |
|---|---|---|
| 290px watchlist + chat + 310px news side-by-side | page.js terminal view | Bottom tab bar, one panel at a time |
| 272px stream + orb + 300px signal column | BotDashboard trading tab | Single column: signal panel first, orb condensed, stream collapsible |
| Drag-and-drop grid + resize dividers | GridDock / ResizeDivider | Hidden on mobile (desktop-only feature) |
| Broker side-by-side `window.open` positioning | BotFlowPopups | "Open broker" → new tab / broker's own app via link + app-switcher hint |
| `height:100vh` (3×) | page.js | `100dvh` with `100vh` fallback (iOS URL bar/keyboard) |
| 8 fixed `minWidth`s, 7–10px hover-dependent controls | page.js | Breakpoint styles, ≥44px touch targets on primary controls |
| Dense settings drawer (310px fixed) | SettingsPanel | Full-width sheet under 768px |
| Admin table (6 fixed columns) | /admin | Horizontal scroll container (fine as-is otherwise) |

Already mobile-friendly: auth gate (max-width 420 card), Kronos mode-select popup, ticker tape
(RAF), TradingView widgets (responsive), the V9 panel refactor — `watchlistInner` /
`consoleInner` / `newsInner` are already extracted elements, so the mobile shell **reuses them
untouched**. That refactor is why M1 is cheap.

---

## PHASE M1 — RESPONSIVE MOBILE SHELL (the bulk)

1. **`useIsMobile()` hook** — `matchMedia("(max-width: 767px)")`, SSR-safe. One breakpoint;
   no tablet special-casing in v1 (tablets get desktop layout, which works at 768+).
2. **Mobile shell in page.js**: when mobile, render a bottom tab bar —
   **CHAT · WATCHLIST · KRONOS · NEWS · DATA** — each tab showing exactly one existing panel
   element full-screen. Header condenses to logo + market badge + ⚙. Desktop rendering is
   untouched (zero visual change above 768px).
3. **BotDashboard mobile layout**: trading tab becomes single column ordered
   *MultiAgentSignal → SignalFeed → condensed status strip (replaces orb) → collapsible stream/fills*;
   existing sub-tabs (TRADING/STRATEGIES/ANALYTICS/STUDIO) become horizontally scrollable pills;
   OPT/FUT toggle stays visible.
4. **Broker flow on mobile**: BrokerSideBySidePopup detects mobile → copy changes to
   "open your broker, then switch apps to check signals"; button opens the platform in a new tab
   (phones ignore window positioning); same presets + remembered choice.
5. **Mechanical fixes**: `100dvh`, kill horizontal overflow, bump primary touch targets,
   font floor ~11px for body text on mobile, settings panel full-width sheet, admin table
   scroll wrapper, disable LAYOUT button + grid on mobile.
6. **Verification**: preview at 375×812 (and 390/430 widths), walk every view + popup flow,
   keyboard-open chat input test.

## PHASE M2 — PWA (installable)

- `manifest.json` (name KRONOS, standalone display, theme #05080F, 192/512 icons — generate from
  the orb), minimal service worker (cache app shell; **no offline pretensions** — it's a live-data
  app), install nudge in Settings ("Add to Home Screen" instructions differ iOS vs Android).
- Zero backend work. Roughly a day including icons.

## PHASE M3 — PUSH NOTIFICATIONS FOR SIGNALS (the payoff)

- **Web Push with VAPID keys** (free, no Firebase/app stores; `web-push` npm).
- New table `push_subscriptions` (user_id, endpoint, keys, created_at; RLS owner-only) + migration 003.
- Settings toggle "🔔 Notify me on FIRE signals" → browser permission → subscription saved.
- `/api/cron/generate-signals` gains a fan-out step: on each newly written FIRE signal, send push
  ("⚡ KRONOS: LONG NQ @ 21,540 — 78% conviction") to all opted-in subscriptions; tap opens the
  bot view. Dead subscriptions pruned on 410 responses.
- **iOS caveat to relay to users**: iPhone push requires iOS 16.4+ AND the app installed to the
  home screen (that's why M2 precedes M3). Android works in plain Chrome.
- Depends on the external cron (cron-job.org) being set up — a daily-only cron makes push pointless.

## Explicitly NOT in scope

- Native iOS/Android app (revisit at ~100+ paying users)
- Mobile drag-and-drop layout editing
- Tablet-specific layout
- Offline data/charting

## Effort ordering & risk

M1 is ~80% of the work and all of the risk (touching page.js/BotDashboard rendering paths);
the V9 panel-element refactor de-risks it substantially. M2 is trivial. M3 is small but touches
the cron + a new table. Ship M1 alone first, verify on your real phone against the live URL,
then M2+M3 together.
