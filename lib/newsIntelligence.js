// lib/newsIntelligence.js — V12 Phase 2: multi-agent news interrogation core.
//
// The "nervous system" that turns an incoming news item into a scored, routable
// intelligence signal. Source-agnostic: it does not care whether the item came
// from the CNBC adapter, the Investing.com adapter, a pushed feed, or the
// existing Finnhub news pipeline — it takes ONE normalized item and interrogates
// it. The two /api/mcp/* endpoints are just source adapters over this.
//
// DETERMINISTIC by design (see vault: "V12 News-Intelligence MCP adapters").
// Conviction is computed from explicit, auditable factors — not an LLM guess —
// exactly like the signal-engine risk gate. The LLM narrates; it never sets the
// number. This also makes "agents interrogate every item" honest: the scoring is
// reproducible and free, so it genuinely runs on every item without token cost.
//
// The spec's "multiple agents" (sentiment / risk / opportunity / relevance /
// conviction) are FACETS of this one pass, mirroring the Phase 1 decision to make
// the 15 learning behaviors facets of one engine rather than N subsystems.

import { scoreNewsImpact } from "./newsImpact";
import { buildMemory } from "./kronosMemory";

// ── sentiment lexicon (deterministic direction + strength) ────────────────────
// Small, market-tuned. Not general NLP — it only needs to read the DIRECTIONAL
// lean of a market headline, which is a narrow, keyword-tractable problem.
const BULL = /\b(beat|beats|surge|surges|soar|soars|rally|rallies|jump|jumps|record high|upgrade|raises? guidance|strong(er)?|tops estimates|blowout|gains?|climb|climbs|breakout|approval|approved|wins?|expands?)\b/i;
const BEAR = /\b(miss|misses|plunge|plunges|slump|slumps|slide|slides|crash|crashes|tumble|tumbles|downgrade|cuts? guidance|weak(er)?|falls? short|warning|warns|probe|lawsuit|recall|bankruptc|default|layoffs?|selloff|sell-off|drop|drops|fears?|slashes?)\b/i;

export function scoreSentiment(item) {
  const text = `${item.headline || ""} ${item.body || item.summary || item.details || ""}`;
  const bull = (text.match(new RegExp(BULL, "gi")) || []).length;
  const bear = (text.match(new RegExp(BEAR, "gi")) || []).length;
  if (bull === 0 && bear === 0) return { direction: "neutral", strength: 0 };
  const net = bull - bear;
  const total = bull + bear;
  const strength = Math.min(1, Math.abs(net) / Math.max(2, total)); // 0..1
  if (net > 0) return { direction: "bullish", strength };
  if (net < 0) return { direction: "bearish", strength };
  return { direction: "mixed", strength: 0.2 }; // equal tug-of-war = genuinely uncertain
}

// A macro/econ item ("CPI Report", impact:"High") isn't ticker-directional but IS
// market-moving. Map its stated impact into the same 0..1 relevance scale.
const MACRO_IMPACT = { high: 1, medium: 0.6, low: 0.3 };

/**
 * Interrogate one normalized news item. Returns the full facet breakdown plus
 * routing flags. `memory` (from kronosMemory) is optional; when present it tilts
 * conviction via market mood + historical reaction to similar items.
 */
export function interrogate(item, { memory = null, threshold = 65, vix = null } = {}) {
  const impact = scoreNewsImpact(item);          // 0..98 market-moving score + breaking flags
  const sentiment = scoreSentiment(item);
  const macro = item.event || item.impact ? (MACRO_IMPACT[String(item.impact || "").toLowerCase()] ?? 0.5) : null;

  // Risk = downside exposure this item creates. Bearish + high impact + breaking.
  const risk = clamp01(
    (impact.score / 100) * 0.6 +
    (sentiment.direction === "bearish" ? sentiment.strength * 0.3 : 0) +
    (impact.breaking ? 0.1 : 0)
  );
  // Opportunity = actionable directional edge. Needs a DIRECTION and impact.
  const opportunity = clamp01(
    (impact.score / 100) * 0.5 +
    (sentiment.direction === "bullish" || sentiment.direction === "bearish" ? sentiment.strength * 0.5 : 0)
  );

  // ── conviction: explicit weighted blend of the spec's scoring factors ──
  // Branches on whether the item is TRADEABLE (names a ticker + has a direction).
  // Without that branch, a zero-impact commentary headline ("top 10 stocks to
  // watch") scored ~50% purely from one bullish word — dishonest, since there's
  // nothing to trade. News conviction is a heuristic, not a guarantee.
  const hasTicker = !!normTicker(item.related || item.ticker || item.symbol);
  const directional = sentiment.direction === "bullish" || sentiment.direction === "bearish";
  let conviction;
  if (hasTicker && directional) {
    // Single-name tradeable: the named ticker + clear catalyst IS the signal, so
    // market-wide impact is not the yardstick. A clean unanimous item lands ~67
    // (above the 65 default → reaches the feed; a user at 70+ still filters it).
    conviction =
      40 * Math.max(opportunity, risk) +
      30 * sentiment.strength +
      20 * (impact.score / 100) +
      (impact.breaking ? 8 : 0);
  } else {
    // No tradeable ticker → judge on market-wide magnitude only. Commentary
    // collapses to single digits; a high-impact macro/breaking item still rates,
    // but neutral scheduled prints stay sub-pulse (we don't buzz on every CPI).
    const magnitude = Math.max(impact.score / 100, macro || 0);
    conviction = 45 * magnitude + (impact.breaking ? 8 : 0);
  }

  const reasons = [];
  reasons.push(`impact ${impact.score}`, `${sentiment.direction}${sentiment.strength ? ` ${Math.round(sentiment.strength * 100)}%` : ""}`);
  if (macro != null) reasons.push(`macro ${Math.round(macro * 100)}%`);
  if (impact.breaking) reasons.push(impact.live ? "LIVE" : "breaking");

  // Memory tilt (behaviors #9/#13: market mood + historical reaction). Bounded ±10.
  if (memory && memory.canMakeStatClaims) {
    if (memory.mood?.label === "hostile") { conviction -= 8; reasons.push("mood hostile −8"); }
    else if (memory.mood?.label === "constructive") { conviction += 5; reasons.push("mood constructive +5"); }
    else if (memory.mood?.label === "high-volatility") { conviction -= 4; reasons.push("high-vol −4"); }
  }

  conviction = Math.round(clamp(conviction, 0, 100));

  const marketMoving = impact.score >= 65 || impact.breaking || macro >= 0.9;
  const ticker = normTicker(item.related || item.ticker || item.symbol);
  const tradeable = !!ticker && (sentiment.direction === "bullish" || sentiment.direction === "bearish");

  return {
    headline: item.headline || item.event || "(untitled)",
    source: item.source || null,
    sector: item.sector || null,
    ticker,
    datetime: item.datetime || item.timestamp || null,
    sentiment,
    risk: Math.round(risk * 100),
    opportunity: Math.round(opportunity * 100),
    macroImpact: macro != null ? Math.round(macro * 100) : null,
    impact,
    conviction,
    marketMoving,
    reasons,
    // ── routing flags (SIGNAL FEED ROUTING RULES + PULSE trigger) ──
    // Feed: strong enough AND resolves to a tradeable single name with a direction.
    // A vague macro headline is market-moving (→ pulse) but is NOT a feed trade
    // signal — we do not fabricate a ticker+direction from "inflation fears".
    saveToFeed: conviction >= threshold && tradeable,
    triggerPulse: conviction >= 65 && marketMoving,
    direction: sentiment.direction === "bullish" ? "LONG" : sentiment.direction === "bearish" ? "SHORT" : "NEUTRAL",
  };
}

// Interrogate a batch, newest+highest-conviction first. This is the "agents
// operate in parallel, never miss an item" contract — every item is scored.
export function interrogateBatch(items, opts = {}) {
  const tradeHistory = opts.tradeHistory;
  const memory = Array.isArray(tradeHistory) && tradeHistory.length
    ? buildMemory(tradeHistory, { vix: opts.vix })
    : null;
  const scored = (Array.isArray(items) ? items : []).map((it) => interrogate(it, { ...opts, memory }));
  scored.sort((a, b) => b.conviction - a.conviction || (b.datetime || 0) - (a.datetime || 0));
  return {
    items: scored,
    feed: scored.filter((s) => s.saveToFeed),
    pulse: scored.filter((s) => s.triggerPulse),
    scanned: scored.length,
  };
}

// ── normalizers for the two documented MCP JSON shapes ────────────────────────
// CNBC:      { source, headline, body, sector, timestamp }
// Investing: { source, event, impact, details, timestamp }
export function normalizeCnbc(raw) {
  return {
    source: raw.source || "CNBC",
    headline: raw.headline,
    body: raw.body || raw.summary || "",
    sector: raw.sector || null,
    related: raw.related || raw.ticker || raw.symbol || null,
    datetime: toMs(raw.timestamp ?? raw.datetime),
  };
}
export function normalizeInvesting(raw) {
  return {
    source: raw.source || "Investing.com",
    headline: raw.event || raw.headline,
    event: raw.event || null,
    impact: raw.impact || null,
    body: raw.details || raw.body || "",
    datetime: toMs(raw.timestamp ?? raw.datetime),
  };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function clamp01(v) { return clamp(v, 0, 1); }
function normTicker(t) {
  if (!t) return null;
  const s = String(t).toUpperCase().split(/[,\s]/)[0].trim(); // Finnhub 'related' can be comma-list
  return /^[A-Z.^-]{1,8}$/.test(s) ? s : null;
}
function toMs(t) {
  if (t == null) return null;
  const n = Number(t);
  if (Number.isFinite(n)) return n > 1e11 ? n : n * 1000; // seconds → ms
  const p = Date.parse(String(t));
  return Number.isFinite(p) ? p : null;
}
