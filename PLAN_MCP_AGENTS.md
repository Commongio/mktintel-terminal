# Blueprint — MCP Servers + Agents for Kronos

Goal: run the signal engine **harder and smarter** than a 60-second Vercel cron
can. This is the architecture that unblocks "every signal we can get."

---

## 1. Why the current design caps out

| Constraint | Value today | What it costs you |
|---|---|---|
| Vercel function timeout | **60s** (`maxDuration`) | ~26 symbols/run, hard ceiling |
| Free data rate limits | Finnhub 60/min; Yahoo IP-bans | Can't burst-scan thousands |
| Cron cadence | ~2 min (cron-job.org) | Full 400-name sweep = **50 min** |
| Engine location | Inline, in the request | Scan time *is* response time |

The V10.3 rotating bucket squeezes this honestly, but it's still one process doing
everything synchronously inside a request. The ceiling is structural.

**The fix is to separate the SCANNER from the WEB APP.** Everything below follows
from that.

---

## 2. Target architecture

```
                    ┌──────────────────────────────┐
                    │  Next.js app (Vercel)        │  ← unchanged, stays fast
                    │  reads `signals` from DB     │
                    └──────────────┬───────────────┘
                                   │ Supabase Realtime
                    ┌──────────────┴───────────────┐
                    │  Supabase `signals` table    │  ← single source of truth
                    └──────────────▲───────────────┘
                                   │ writes
        ┌──────────────────────────┴──────────────────────────┐
        │           SCANNER WORKER (long-running)             │
        │  Not Vercel. No 60s cap. Runs the whole universe.   │
        │                                                     │
        │   queue ──> [ Technical ] [ Structure ] [ Flow ]    │
        │             [ Risk ] [ Portfolio Manager ]          │
        └──────────────────────────┬──────────────────────────┘
                                   │ MCP (tools)
        ┌──────────────────────────┴──────────────────────────┐
        │  MCP servers = the agents' HANDS                    │
        │  market-data · options-chain · news · broker(RO)    │
        └─────────────────────────────────────────────────────┘
```

**Key mental model:** MCP servers are **tools**, not brains. Agents are the brains.
Don't put strategy logic in an MCP server — put *capabilities* there (fetch a chain,
pull candles, read filings) and let agents compose them.

---

## 3. Where the worker runs (pick one)

| Option | Cost | Why |
|---|---|---|
| **Railway / Render / Fly.io worker** | ~$5–7/mo | ⭐ Recommended. A plain always-on Node process. No timeout. Simplest migration — reuse `lib/signalEngine.js` verbatim. |
| Supabase Edge Function + pg_cron | free-ish | Stays in-stack, but Deno + still time-limited. Half a fix. |
| GitHub Actions on a schedule | free | 2,000 min/mo free; 5-min minimum cadence. Fine for a slow full sweep, too coarse for intraday. |
| Your own PC | free | Only runs when the machine is on. Not for a product with customers. |

**Recommendation: a Railway worker.** It's the smallest change that removes the
ceiling entirely — the same engine code, just not inside an HTTP request.

---

## 4. The MCP servers to build

Each is a small stdio MCP server exposing typed tools. Build them in this order.

### `mcp-market-data` (build first)
Wraps the existing `lib/marketData.js` failover chain.
- `get_quote(symbol)` → price, change, volume
- `get_candles(symbol, interval, lookback)` → OHLCV
- `get_technicals(symbol, interval)` → RSI/MACD/EMA (reuse `lib/indicators.js`)
- **Owns the rate limiter.** Every consumer goes through it, so limits are
  enforced in exactly one place instead of scattered across callers.

### `mcp-options`
Wraps `lib/optionsData.js` (Yahoo cookie+crumb handshake).
- `get_chain(symbol, expiry)` · `get_flow(symbol)` · `get_iv_rank(symbol)`
- **Cache aggressively** — chains are the single most expensive call you make.

### `mcp-news`
- `search_news(query, since)` · `get_filings(symbol)` · `score_impact(headline)`
  (reuse `lib/newsImpact.js`)

### `mcp-screener`
- `most_actives()` · `unusual_volume()` · `gappers()`
- This is what makes the scan *smart* instead of a dumb round-robin: it decides
  **who deserves a scan right now**, so budget goes to names actually in play.

### `mcp-broker` — **READ-ONLY. Positions and balances only.**
> ⚠️ Do **not** give an agent order-placement tools. The whole product is built on
> signals + manual execution; an autonomous trade is a compliance and blow-up risk
> you do not want, and it breaks the prop-firm rules you trade under. Keep the human
> as the executor.

---

## 5. The agents

Reuse the roles you already have — they become **long-lived workers** instead of
functions called inside a request.

| Agent | Job | Tools it gets |
|---|---|---|
| **Scout** | Decide *what* to scan next. Ranks the universe by volume/gap/news heat. | `mcp-screener`, `mcp-news` |
| **Technical** | RSI/MACD/EMA vote | `mcp-market-data` |
| **Structure** | BOS / FVG / liquidity sweeps | `mcp-market-data` |
| **Flow** | Options positioning, IV, unusual strikes | `mcp-options` |
| **Risk** | Hard gate. Vetoes anything below threshold. | — (pure logic) |
| **Portfolio Manager** | Weighs the votes → FIRE / HOLD / SCAN | — (pure logic) |
| **Mentor** *(later)* | The Kronos Mentor concept — coaches from trade history | DB read |

**Critical: keep Risk and Portfolio Manager as deterministic code, not LLM calls.**
They are the gate that decides whether real money moves. They must be auditable,
reproducible, and free — an LLM in that seat makes signals non-deterministic and
turns your compliance story ("standardized, impersonal") into a mess. Today's
`lib/signalEngine.js` already does this correctly; **don't regress it.**

---

## 6. Where an LLM actually helps

Be selective — LLM calls are the slow, expensive part.

✅ **Good uses**
- **Scout ranking** — "which of these 400 names are in play today, given the news?"
- **Signal narration** — turning agent votes into the plain-English "why" (the
  reasoning popup). Cheap, high-value, user-facing.
- **News → impact** — nuance a regex can't reach.
- **Kronos Mentor** — inherently a language task.

❌ **Bad uses**
- The FIRE/HOLD gate (must stay deterministic — see above)
- Number-crunching indicators (code is faster, exact, and free)
- Anything on the hot path of every symbol, every 2 min — you'll burn tokens for
  no edge

**Model choice:** `claude-haiku-4-5` for high-volume Scout ranking, `claude-sonnet-5`
for narration/mentor. Don't put Opus on a 2-minute loop.

---

## 7. Migration path (incremental — nothing breaks)

**Phase 1 — Extract the worker.** *Biggest win, smallest risk.*
- New `worker/` dir; a `while(true)` loop calling the existing `runSignalEngine`.
- Deploy to Railway with the same env vars. Point it at the same Supabase.
- Delete the cron-job.org job. The Next.js app **doesn't change at all** — it still
  just reads the `signals` table.
- **Result: the 60s cap and the 26-symbol bucket are gone.** Sweep the full universe
  continuously.

**Phase 2 — Rate-limited data layer.** Wrap all fetches in a token-bucket limiter in
one place. This is what lets you safely grow the universe past 400.

**Phase 3 — `mcp-market-data` + `mcp-options`.** Convert the data layer into MCP
servers. Now agents (and Kronos in chat, and future tooling) share one governed set
of hands.

**Phase 4 — Scout agent.** Prioritized scanning replaces round-robin rotation. This
is where "every signal we can get" actually becomes true — you stop wasting budget
on names that aren't moving.

**Phase 5 — Mentor.** The placeholder becomes real, fed by trade history.

---

## 8. Honest cost & effort

| Item | Cost |
|---|---|
| Railway worker | ~$5/mo |
| Paid data (optional, Phase 2+) | Polygon Starter ~$29/mo — the real unlock for full-market coverage |
| LLM (Scout + narration) | ~$5–20/mo at Haiku volume |
| **Effort** | Phase 1: **half a day**. Phases 2–4: a few days each. |

**Phase 1 alone gets you most of the win.** Do that first, measure, then decide
whether the rest is worth it. Don't build all five phases up front.

---

## 9. What NOT to do

- ❌ Don't let an agent place trades. (See §4.)
- ❌ Don't move the risk gate into an LLM.
- ❌ Don't scan illiquid tickers to inflate the universe count — garbage signals cost
  you credibility and rate limit for zero edge.
- ❌ Don't run MCP servers *inside* Vercel functions — you'd reintroduce the 60s cap
  you just escaped.
- ❌ Don't ship the worker without the rate limiter (Phase 2) if you grow the universe
  — that's how you get IP-banned.
