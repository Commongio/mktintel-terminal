# V.9 PLAN — Rev 2 — Multi-Tenant Terminal, Mode-Aware Kronos, Side-by-Side Trading

Status: **PLANNING — awaiting green flag.** No code written yet.
Rev 1 researched 2026-07-09; Rev 2 same day after owner clarifications.

## What changed from Rev 1 (changelog)

| Rev 1 assumption | Rev 2 decision |
|---|---|
| Broker API integrations + encrypted credential vault (KMS envelope encryption) | **Scrapped.** No credential storage, no broker APIs, no server-side execution. Users trade manually in their own broker window, side-by-side with the terminal. |
| Phase 3 auto-trade with firm-policy gates | **Scrapped entirely** (for now). Signals + manual execution only. |
| Auth: Supabase vs Clerk open question | **Supabase confirmed.** |
| Access codes → invite codes (loose concept) | **Formalized:** one-time-use registration codes, burned at signup, owner admin view, scales to large batches. |
| Single-asset-class bot (futures-centric) | **Mode-aware bot: Options vs Futures**, selected via popup + persistent toggle, with genuinely different data sources and signal logic per mode. |
| Layout: fixed panels | **Free drag-and-drop layout editing**, persisted per account. |
| — (not in Rev 1) | Personalization (background photo upload, chat box transparency/color). |
| Single data provider per feed (Yahoo primary) | **Multi-provider redundant data layer** with failover. |

**Rev 1 research that still matters** (kept in Appendix A): the broker API matrix and TOS findings remain valid intel for a future optional read-only "live eval gauges" feature or an eventual execution product; the CTA/publisher-exemption analysis still applies to selling signals at all (see Compliance).

---

## PART 1 — ACCOUNTS & REGISTRATION CODES

**Auth: Supabase** (Auth + Postgres + RLS + Storage). Each account's data fully isolated via RLS (`user_id = auth.uid()`).

### Registration codes
- `registration_codes` table: `code (unique)`, `status (unused|used|revoked)`, `redeemed_by (user_id, nullable)`, `redeemed_at`, `batch_label`, `note`, `created_at`.
- Signup flow: email + password + **code required**; redemption is atomic (single UPDATE ... WHERE status='unused' guarded transaction — two people can't burn the same code). Existing ~25 codes seeded as the first batch.
- Code generation: server-side batch generator (N codes, prefix + crypto-random suffix, e.g. `KRN-XXXXXX` keeping the current format), owner-only.

### Admin view (owner-only)
- Route `/admin/codes` gated by an `is_owner` claim (allowlist of owner user IDs in a config table; enforced server-side + RLS, not client-side).
- Lists every code with status and redeeming account (email), searchable + filterable (unused/used/batch), paginated server-side — built for thousands of codes, not 25.
- Actions: generate batch, revoke unused code, export CSV.

### User profile/settings row
`user_settings`: theme/accent/density (migrating what's in localStorage today), `bot_mode (options|futures)`, personalization fields (Part 4), layout JSONs (Part 5). localStorage stays as an offline cache; Supabase is the source of truth so settings follow the user across devices.

---

## PART 2 — SIDE-BY-SIDE MANUAL TRADING (replaces broker connection)

Clicking into the Kronos bot triggers a two-step popup flow:

**Step 1 — Mode select** (Part 3): "OPTIONS or FUTURES?"

**Step 2 — Broker side-by-side setup:** a popup offering to open the user's trading platform in a second browser window positioned for split-screen (terminal left, broker right):
- Preset platform list (TopstepX web, Tradovate web, TradeLocker web, MT4/5 WebTrader, thinkorswim web, Webull, Robinhood, custom URL). Saved per user (`user_settings.broker_url`).
- Launch via `window.open(url, "broker", "left=W/2,top=0,width=W/2,height=H")` after computing screen dimensions; simultaneously the terminal offers a "compact left-half" layout preset.
- **Reality flag:** browsers only honor position/size features for script-opened popups, popup blockers may intervene, and multi-monitor setups vary. We launch on a user click (blocker-safe), and show a graceful fallback ("drag this window to the left, your broker to the right") if the browser refuses positioning.
- "Don't show again / remember my choice" so daily users go straight to the dashboard; re-openable from a header button.

**What this removes:** credential vault, KMS, broker APIs, execution workers, firm-policy gates, most TOS exposure. **What it costs:** the eval dashboard's daily-loss/drawdown gauges stay estimate-based (user-entered/localStorage) rather than live from the broker — Rev 1's read-only API polling was the fix for that; parked in Appendix A as an optional future add-on.

---

## PART 3 — MODE-AWARE KRONOS (Options vs Futures)

### UX
- First entry (or after popup flow reset): mode-select popup → then broker popup.
- **Persistent top-right toggle** in the bot header (`OPT | FUT`) switches modes instantly any time without re-running popups. Persisted to `user_settings.bot_mode`.

### Engine — genuinely different per mode, not a relabel
`/api/multi-agent-signal` gains `assetClass=futures|options` and dispatches to mode-specific config:

**Futures mode (current engine, hardened):**
- Instruments: NQ, MNQ, ES, MES, CL, GC (existing SYMBOL_MAP futures).
- Agents as today: TECHNICAL / STRUCTURE (Kronos Map) / SENTIMENT / RISK; candles from the redundant data layer (Part 6).
- Plan output: entry/stop/T1/T2 in points, as now.

**Options mode (new):**
- Instruments: liquid optionable equities/ETFs (SPY, QQQ, NVDA, AAPL, TSLA, META, AMD... user-tunable watchlist subset).
- TECHNICAL + STRUCTURE agents run on the *underlying's* candles (reuse existing math).
- **New OPTIONS-FLOW agent replaces/augments SENTIMENT**: put/call volume ratio, unusual volume vs OI, and IV context from free chain data — sources: Yahoo Finance options chains (free, unofficial), Tradier sandbox (free, delayed chains), plus the existing `/api/options-flow` route from V.7. IV rank approximated from chain IV vs trailing window we persist ourselves (free tiers don't give IV history).
- Plan output: direction + underlying levels + **generic contract guidance** (e.g. "bullish above X — consider calls, 2–4 weeks out, ~0.30–0.40 delta") — *not* per-user picked contracts (keeps the feed standardized; see Compliance).
- Signal cadence can be slower (options setups develop on 15m–daily, and free chain data is delayed) — per-mode refresh intervals.

Server-side signal engine (from Rev 1) still applies: cron-generated **standardized** signals per mode/symbol/interval written to a `signals` table, delivered in-app via Supabase Realtime; "SETUP DETECTED / NO SETUP" is the headline state the user watches while their broker window is open beside it.

---

## PART 4 — PERSONALIZATION

- **Background photo:** upload to Supabase Storage (per-user folder, 5MB cap, image types only, resized/compressed client-side before upload). `user_settings.background_url` + adjustable dim/overlay slider so text stays readable. Fallback to current theme backgrounds.
- **Chat box style:** `user_settings.chat_style = { mode: 'transparent'|'solid', color, opacity }` — settings-panel control; transparent mode uses backdrop blur so messages remain legible over photo backgrounds.

---

## PART 5 — DRAG-AND-DROP LAYOUTS (biggest engineering item)

- Library: **react-grid-layout** (MIT — free-tier rule satisfied): drag, resize, collision handling, serializable layouts.
- **Prerequisite refactor (flagged):** `page.js` is a ~1,000-line monolith with fixed flex layouts. Panels (watchlist, news, chat, chart, ticker, data cards, bot sub-panels) must first be extracted into self-contained components with clean props. This refactor is the real cost of this feature and should land as its own step with no visual change, before drag-drop goes in.
- Per page (terminal / data / chart / bot): edit-mode toggle (🔓 unlock → drag/resize → 🔒 save), layout JSON persisted to `user_settings.layouts[page]`, "reset to default" per page, sane responsive breakpoints (drag layouts apply desktop-first; mobile collapses to stacked order).
- Text boxes/notes as free panels: a simple "add note panel" satisfies "text boxes" without building a full widget system.

---

## PART 6 — REDUNDANT MARKET DATA LAYER

One server-side module (`lib/marketData`) behind every quote/candle/chain request, replacing direct per-route fetches:

- **Provider adapters, normalized schema:** Yahoo Finance (primary — free, no key), Finnhub (60/min — quotes/news), Twelve Data (key already on hand, 800/day — tertiary), Alpha Vantage (25/day — emergency), optional Polygon free tier (5/min, needs signup). Options chains: Yahoo + Tradier sandbox.
- **Failover, not fan-out:** priority order with health tracking (rolling error rate + latency per provider) and circuit breakers; a provider that 429s gets benched with exponential cooldown. Querying all providers in parallel would burn the free rate limits that make this stack viable — redundancy here means *availability and cross-checked accuracy*, and honestly: free feeds are seconds-delayed, not institutional tick latency. Signals get a `source` + `asOf` timestamp so staleness is visible.
- **Cross-validation on signal-critical data:** for candles feeding the engine, spot-check latest close across two providers when both are healthy; discrepancy beyond tolerance → flag signal as degraded rather than firing.
- **Short-TTL caching** (per-symbol/interval) so 100 users don't mean 100× upstream calls — critical once multi-tenant. In-memory per instance + optional Upstash Redis (free tier) when user count justifies it.
- Kills the remaining direct Twelve Data dependency in `page.js` as a side effect (open item from V.8.2).

---

## COMPLIANCE — smaller now, not zero

- Scrapping execution/custody removes the discretionary-trading and credential-breach exposure — the big ones.
- **Still applies:** selling access to trade signals is still compensation-for-advice. Futures side: CFTC/NFA CTA definition with the 4.14(a)(9) standardized-media exemption; securities side: Advisers Act publisher exclusion (*Lowe v. SEC*). Both point the same direction: **the signal feed stays standardized and impersonal** — same signals for every subscriber, per-user risk numbers rendered as a local calculator on their own inputs, generic (not per-user) option contract guidance. Worth one lawyer conversation before charging; the product shape is deliberately the defensible one.
- Disclaimers stay on every signal surface ("not investment advice; you are the trader of record").

---

## BUILD PHASES (dependency-ordered)

**Phase A — Foundation:** Supabase project; auth (signup/login, MFA optional now); `registration_codes` + atomic redemption + seed existing codes; `/admin/codes` owner view; `user_settings` table; migrate access gate → real sessions; API route auth middleware.

**Phase B — Data layer:** `lib/marketData` adapters + failover + caching; migrate quote/candle/ticker/watchlist routes onto it; remove Twelve Data direct calls.

**Phase C — Mode-aware bot:** mode-select popup → broker side-by-side popup flow; persistent OPT/FUT toggle; options-mode engine (options-flow agent, chain data adapters); server-side cron signal generation → `signals` table → Realtime in-app feed.

**Phase D — UX & personalization:** panel-extraction refactor of page.js (no visual change) → react-grid-layout drag/drop with per-user persistence → background upload + chat box styling.

**Phase E — Billing (when ready to charge):** Stripe tiers per the roadmap; legal check on paid signals first.

Each phase is independently shippable; A→B→C is the critical path to "users watch real mode-aware signals next to their broker window."

---

## Appendix A — Parked (from Rev 1, still-valid research)

- **Optional future: read-only broker polling for live eval gauges.** TopstepX official API ($29/mo/user, no VPS/remote-server clause issue for *reads* is still ambiguous — verify), TradeLocker public API (free, developer program key). Would replace estimate-based daily-loss/drawdown gauges with real numbers. Requires the credential vault work Rev 1 specced (envelope encryption via KMS) — do not store credentials without it.
- **Execution (any form) parked indefinitely**: Rev 1's findings stand — Apex bans funded-account automation; Topstep personal-device clause conflicts with server-side execution; Tradovate prop accounts have no API; auto-trading user accounts likely exceeds the CTA exemption.

## Sources (Rev 1 research)

- [TopstepX API Access — Topstep Help Center](https://help.topstep.com/en/articles/11187768-topstepx-api-access) · [ProjectX API](https://www.projectx.com/api)
- [TradeLocker Public API docs](https://public-api.tradelocker.com/) · [tradelocker-python](https://github.com/TradeLocker/tradelocker-python)
- [Tradovate forum — no API access for prop accounts](https://community.tradovate.com/t/api-access-for-propfirm-accounts/10348)
- [Apex prohibited activities](https://support.apextraderfunding.com/hc/en-us/articles/40463668243099-Prohibited-Activities)
- [NFA — CTA registration](https://www.nfa.futures.org/registration-membership/who-has-to-register/cta.html) · [NFA — CTA exemptions](https://www.nfa.futures.org/members/cta/cta-exemptions.html)
- [Lowe v. SEC, 472 U.S. 181 (1985)](https://supreme.justia.com/cases/federal/us/472/181/)
