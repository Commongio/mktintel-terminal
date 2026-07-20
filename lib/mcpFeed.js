// lib/mcpFeed.js — V12 Phase 2: shared logic for the CNBC/Investing MCP adapters.
//
// Both /api/mcp/* endpoints do the same thing over a different source: fetch (or
// accept) news items, interrogate them, and optionally route feed-worthy ones
// into the signals table. That shared machinery lives here so the two routes stay
// thin and can't drift apart.
//
// Data source: Finnhub (already keyed app-wide) — CNBC = general market news
// filtered to CNBC-sourced headlines; Investing.com = Finnhub's economic
// calendar. No scraping. See vault: "V12 News-Intelligence MCP adapters".

import { interrogateBatch, normalizeCnbc, normalizeInvesting } from "./newsIntelligence";
import { getAdmin, serverConfigured, insertSignal } from "./supabaseServer";
import { ENGINE_VERSION } from "./signalEngine";

const FINNHUB = "https://finnhub.io/api/v1";
const fmtDate = (d) => d.toISOString().slice(0, 10);

// ── source fetchers (Finnhub-backed) ──────────────────────────────────────────
export async function fetchCnbc(apiKey, { limit = 30 } = {}) {
  const r = await fetch(`${FINNHUB}/news?category=general&token=${apiKey}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Finnhub news ${r.status}`);
  const raw = await r.json();
  const all = (Array.isArray(raw) ? raw : []);
  // Prefer genuine CNBC-sourced items; fall back to all general news if the batch
  // happens to carry none (so the endpoint is never empty for lack of a filter).
  const cnbc = all.filter((x) => String(x.source || "").toLowerCase().includes("cnbc"));
  const chosen = (cnbc.length ? cnbc : all).slice(0, limit);
  return chosen.map((x) => normalizeCnbc({
    source: x.source, headline: x.headline, body: x.summary,
    related: x.related, timestamp: x.datetime, sector: x.category,
  }));
}

export async function fetchInvesting(apiKey, { days = 2 } = {}) {
  const from = new Date(), to = new Date();
  to.setDate(to.getDate() + days);
  const r = await fetch(`${FINNHUB}/calendar/economic?from=${fmtDate(from)}&to=${fmtDate(to)}&token=${apiKey}`, { signal: AbortSignal.timeout(8000) });
  // Finnhub's economic calendar is premium on some tiers — degrade honestly
  // rather than 500, so the endpoint reports "unavailable on this plan".
  if (r.status === 403) { const e = new Error("economic-calendar-not-on-plan"); e.degraded = true; throw e; }
  if (!r.ok) throw new Error(`Finnhub calendar ${r.status}`);
  const data = await r.json();
  const events = data?.economicCalendar || data?.result || [];
  return (Array.isArray(events) ? events : []).map((e) => normalizeInvesting({
    source: "Investing.com",
    event: e.event, impact: e.impact,
    details: [e.actual != null ? `actual ${e.actual}` : null, e.estimate != null ? `est ${e.estimate}` : null, e.prev != null ? `prev ${e.prev}` : null].filter(Boolean).join(" · "),
    timestamp: e.time ? Date.parse(e.time) : Date.now(),
  }));
}

// ── routing: persist feed-worthy news signals ─────────────────────────────────
// Only called on the ingest (POST) path, never on a read/preview. Conservative:
// only items that resolved to a real tagged ticker + direction get written, so we
// never fabricate a trade signal from a vague macro headline.
export async function persistFeedSignals(feedItems) {
  if (!serverConfigured()) return { written: [], skipped: ["no-db"], failed: [] };
  const admin = getAdmin();
  const written = [], skipped = [], failed = [];

  for (const it of feedItems) {
    if (!it.ticker || it.direction === "NEUTRAL") { skipped.push(`${it.ticker || "?"}:not-tradeable`); continue; }
    try {
      // Dedup: skip if a news signal for this symbol+direction landed in the last
      // 30 min, so re-ingesting the same Finnhub batch doesn't spam the feed.
      const { data: last } = await admin.from("signals")
        .select("direction,created_at")
        .eq("asset_class", "options").eq("symbol", it.ticker).eq("interval", "1h")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      const fresh = last && Date.now() - new Date(last.created_at).getTime() < 30 * 60_000;
      if (fresh && last.direction === it.direction) { skipped.push(`${it.ticker}:dup`); continue; }

      const { error, degraded } = await insertSignal(admin, {
        asset_class: "options",             // CHECK allows only futures/options; news = equities/options side
        symbol: it.ticker,
        interval: "1h",                      // buckets under the "daily" cadence view
        status: it.conviction >= 65 ? "FIRE" : "HOLD",
        direction: it.direction,
        conviction: it.conviction,
        plan: { kind: "news", headline: it.headline, source: it.source, sector: it.sector, why: it.reasons },
        agents: [{ agent: "NEWS", vote: it.direction, conviction: it.conviction }],
        engine_version: ENGINE_VERSION,
        source: "news",
      });
      if (error) failed.push({ ticker: it.ticker, error: error.message });
      else written.push(`${it.ticker}:${it.direction}:${it.conviction}%${degraded ? "(untagged)" : ""}`);
    } catch (e) {
      failed.push({ ticker: it.ticker, error: String(e.message) });
    }
  }
  return { written, skipped, failed };
}

// ── the shared endpoint body ──────────────────────────────────────────────────
// mode "preview" (GET) scores and returns, no writes. mode "ingest" (POST) also
// persists feed-worthy signals. Both run the identical interrogation.
export async function runAdapter({ items, threshold, vix, tradeHistory, persist }) {
  const result = interrogateBatch(items, { threshold, vix, tradeHistory });
  let routed = null;
  if (persist && result.feed.length) routed = await persistFeedSignals(result.feed);
  return { ...result, routed };
}
