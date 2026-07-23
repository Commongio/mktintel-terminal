// lib/signalEngine.js — V9 KRONOS MULTI-AGENT SIGNAL ENGINE (shared core).
// Used by /api/multi-agent-signal (on-demand) and /api/cron/generate-signals
// (server feed). Mode-aware: futures and options run genuinely different
// agent stacks — not just relabeled UI.
//
//   FUTURES:  TECHNICAL (35%) + STRUCTURE (40%) + SENTIMENT (25%) + RISK gate
//   OPTIONS:  TECHNICAL (35%) + STRUCTURE (40%) + OPTIONS-FLOW (25%) + RISK gate
//             (underlying candles power TECH/STRUCTURE; the flow agent reads
//              put/call ratios, unusual activity, and ATM IV from the chain)
//
// Signals are STANDARDIZED — identical for every subscriber. Per-user risk
// numbers are only applied client-side against the user's own inputs.

import { getCandles } from "./marketData";
import { fetchChainSummary } from "./optionsData";
import { ema, rsi, macd, bollinger, relVolume } from "./indicators";

export const ENGINE_VERSION = "kronos-v9";
export const MODE_SYMBOLS = {
  futures: ["NQ", "MNQ", "ES", "MES", "YM", "RTY", "CL", "GC"],
  options: ["SPY", "QQQ", "NVDA", "AAPL", "TSLA", "META", "AMD"],
  // V13.5: equity = long-horizon portfolio-growth signals (BUY/HOLD/SELL). Same
  // multi-agent engine, just run on daily candles over large caps.
  equity:  ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "JPM", "V", "UNH", "LLY", "COST", "WMT"],
};
export const MODE_DEFAULT_INTERVAL = { futures: "15min", options: "1h", equity: "1d" };

// V12: the absolute floor for a signal to reach the feed at all. Below this a
// row isn't worth writing. The user's own conviction slider is the PRIMARY gate
// (default 65) and sits on top of this — this is only the hard floor so the
// slider can honestly reach down to the spec's 45%. Was an inline 60 in three
// places (feed display + two persist paths); V12 spec lowers it to 45 and
// centralizes it here so the three stay in lockstep.
export const MIN_SURFACE_CONVICTION = 45;

// ─── STRUCTURE (Kronos Map) ───────────────────────────────────────────────────
function findSwings(c, len = 5) {
  const H = [], L = [];
  for (let i = len; i < c.length - len; i++) {
    if (c.slice(i - len, i + len + 1).every((x, j) => j === len || x.high <= c[i].high)) H.push({ i, p: c[i].high });
    if (c.slice(i - len, i + len + 1).every((x, j) => j === len || x.low >= c[i].low)) L.push({ i, p: c[i].low });
  }
  return { H, L };
}

function structureAnalysis(candles) {
  const { H, L } = findSwings(candles);
  const lastH = H[H.length - 1]?.p, lastL = L[L.length - 1]?.p;
  const close = candles[candles.length - 1]?.close;
  let events = [], lastBreak = 0;
  for (let i = Math.max(1, candles.length - 30); i < candles.length; i++) {
    if (lastH && candles[i].close > lastH) { events.push(lastBreak === -1 ? "MSS_BULL" : "BOS_BULL"); lastBreak = 1; }
    if (lastL && candles[i].close < lastL) { events.push(lastBreak === 1 ? "MSS_BEAR" : "BOS_BEAR"); lastBreak = -1; }
  }
  const fvgs = [];
  for (let i = Math.max(2, candles.length - 30); i < candles.length; i++) {
    const a = candles[i - 2], b = candles[i];
    if (b.low > a.high) fvgs.push({ type: "BULL", top: b.low, bot: a.high, mid: (b.low + a.high) / 2 });
    if (b.high < a.low) fvgs.push({ type: "BEAR", top: a.low, bot: b.high, mid: (a.low + b.high) / 2 });
  }
  let sweep = null;
  for (let i = Math.max(1, candles.length - 10); i < candles.length; i++) {
    const c = candles[i];
    if (lastL && c.low < lastL && c.close > c.open) sweep = "BULL";
    if (lastH && c.high > lastH && c.close < c.open) sweep = "BEAR";
  }
  return { events: events.slice(-4), fvgs: fvgs.slice(-3), sweep, lastSwingHigh: lastH, lastSwingLow: lastL, close };
}

// ─── AGENTS ───────────────────────────────────────────────────────────────────
function technicalAgent(candles) {
  const closes = candles.map((c) => c.close);
  const r = rsi(closes);
  const m = macd(closes);
  const bb = bollinger(closes);
  const e20 = ema(closes, 20), e50 = ema(closes, 50);
  const emaX = e20.length && e50.length ? (e20[e20.length - 1] > e50[e50.length - 1] ? 1 : -1) : 0;
  const mom = closes.length >= 10 ? (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10] * 100 : 0;

  let score = 0; const reasons = [];
  if (r != null) {
    if (r < 30) { score += 2; reasons.push(`RSI ${r.toFixed(0)} oversold`); }
    else if (r > 70) { score -= 2; reasons.push(`RSI ${r.toFixed(0)} overbought`); }
    else if (r > 50) { score += 1; reasons.push(`RSI ${r.toFixed(0)} bullish zone`); }
    else { score -= 1; reasons.push(`RSI ${r.toFixed(0)} bearish zone`); }
  }
  if (m) {
    if (m.hist > 0) { score += 2; reasons.push("MACD histogram positive"); }
    else { score -= 2; reasons.push("MACD histogram negative"); }
  }
  if (emaX === 1) { score += 2; reasons.push("EMA20 above EMA50"); }
  if (emaX === -1) { score -= 2; reasons.push("EMA20 below EMA50"); }
  if (bb) {
    if (bb.pctB < 0.1) { score += 1; reasons.push("Price at lower Bollinger band"); }
    if (bb.pctB > 0.9) { score -= 1; reasons.push("Price at upper Bollinger band"); }
  }
  if (Math.abs(mom) > 1) { score += mom > 0 ? 1 : -1; reasons.push(`Momentum ${mom.toFixed(1)}% (10 bars)`); }

  const signal = score >= 2 ? "bullish" : score <= -2 ? "bearish" : "neutral";
  return { agent: "TECHNICAL", signal, confidence: Math.min(100, Math.round(Math.abs(score) / 8 * 100)), reasons, data: { rsi: r, macd: m?.hist, emaCross: emaX, momentum: mom } };
}

function structureAgent(candles) {
  const s = structureAnalysis(candles);
  let score = 0; const reasons = [];
  if (s.events.includes("MSS_BULL")) { score += 3; reasons.push("MSS bullish — structure flipped up"); }
  if (s.events.includes("MSS_BEAR")) { score -= 3; reasons.push("MSS bearish — structure flipped down"); }
  if (s.events.includes("BOS_BULL")) { score += 2; reasons.push("BOS bullish continuation"); }
  if (s.events.includes("BOS_BEAR")) { score -= 2; reasons.push("BOS bearish continuation"); }
  if (s.sweep === "BULL") { score += 2; reasons.push("Liquidity sweep below lows + rejection"); }
  if (s.sweep === "BEAR") { score -= 2; reasons.push("Liquidity sweep above highs + rejection"); }
  const bullFVG = s.fvgs.find((f) => f.type === "BULL"), bearFVG = s.fvgs.find((f) => f.type === "BEAR");
  if (bullFVG) { score += 1; reasons.push(`Bull FVG ${bullFVG.bot.toFixed(2)}–${bullFVG.top.toFixed(2)}`); }
  if (bearFVG) { score -= 1; reasons.push(`Bear FVG ${bearFVG.bot.toFixed(2)}–${bearFVG.top.toFixed(2)}`); }
  if (!reasons.length) reasons.push("No structure events in window");
  const signal = score >= 2 ? "bullish" : score <= -2 ? "bearish" : "neutral";
  return { agent: "STRUCTURE", signal, confidence: Math.min(100, Math.round(Math.abs(score) / 8 * 100)), reasons, data: s };
}

async function sentimentAgent(symbol, finnhubKey) {
  if (!finnhubKey) return { agent: "SENTIMENT", signal: "neutral", confidence: 0, reasons: ["No Finnhub key — sentiment skipped"], data: {} };
  try {
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10);
    const r = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${finnhubKey}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`Finnhub ${r.status}`);
    const news = (await r.json()).slice(0, 30);
    const POS = ["beat", "surge", "rally", "upgrade", "record", "growth", "strong", "gain", "bullish", "buy", "soar", "jump"];
    const NEG = ["miss", "fall", "downgrade", "loss", "weak", "cut", "bearish", "sell", "plunge", "drop", "lawsuit", "probe", "recall"];
    let pos = 0, neg = 0;
    for (const n of news) {
      const h = (n.headline || "").toLowerCase();
      if (POS.some((w) => h.includes(w))) pos++;
      if (NEG.some((w) => h.includes(w))) neg++;
    }
    const total = pos + neg;
    let signal = "neutral", conf = 0;
    if (total >= 3) {
      if (pos > neg * 1.5) { signal = "bullish"; conf = Math.min(100, Math.round((pos / total) * 100)); }
      else if (neg > pos * 1.5) { signal = "bearish"; conf = Math.min(100, Math.round((neg / total) * 100)); }
      else conf = 30;
    }
    return { agent: "SENTIMENT", signal, confidence: conf, reasons: [`${news.length} headlines (3d): ${pos} positive / ${neg} negative`], data: { pos, neg } };
  } catch (e) {
    return { agent: "SENTIMENT", signal: "neutral", confidence: 0, reasons: [`News fetch failed: ${e.message}`], data: {} };
  }
}

// OPTIONS-FLOW agent — options mode's third vote (replaces sentiment).
async function optionsFlowAgent(symbol) {
  try {
    const c = await fetchChainSummary(symbol);
    let score = 0; const reasons = [];
    if (c.putCallVolumeRatio != null) {
      if (c.putCallVolumeRatio < 0.7) { score += 2; reasons.push(`Put/Call volume ${c.putCallVolumeRatio} — call-heavy flow`); }
      else if (c.putCallVolumeRatio > 1.3) { score -= 2; reasons.push(`Put/Call volume ${c.putCallVolumeRatio} — put-heavy flow`); }
      else reasons.push(`Put/Call volume ${c.putCallVolumeRatio} — balanced`);
    }
    if (c.unusualCalls > c.unusualPuts && c.unusualCalls >= 2) { score += 2; reasons.push(`${c.unusualCalls} unusual CALL strikes (vol≥500, vol/OI≥2.5)`); }
    if (c.unusualPuts > c.unusualCalls && c.unusualPuts >= 2) { score -= 2; reasons.push(`${c.unusualPuts} unusual PUT strikes (vol≥500, vol/OI≥2.5)`); }
    if (c.putCallOIRatio != null) {
      if (c.putCallOIRatio < 0.8) { score += 1; reasons.push(`OI skewed to calls (${c.putCallOIRatio})`); }
      if (c.putCallOIRatio > 1.2) { score -= 1; reasons.push(`OI skewed to puts (${c.putCallOIRatio})`); }
    }
    if (c.atmIV != null) reasons.push(`ATM IV ~${c.atmIV}%${c.impliedMovePct ? ` · implied move ±${c.impliedMovePct}%` : ""}`);
    if (c.maxPain != null) reasons.push(`Max pain ${c.maxPain} (nearest expiry)`);
    const signal = score >= 2 ? "bullish" : score <= -2 ? "bearish" : "neutral";
    return { agent: "OPTIONS FLOW", signal, confidence: Math.min(100, Math.round(Math.abs(score) / 5 * 100)), reasons, data: c };
  } catch (e) {
    return { agent: "OPTIONS FLOW", signal: "neutral", confidence: 0, reasons: [`Chain fetch failed: ${e.message}`], data: {} };
  }
}

function riskAgent(finalConviction, direction, propRules, degradedData) {
  const reasons = [];
  let approved = true;
  const threshold = Number(propRules?.minConviction) || 60;
  if (finalConviction < threshold) { approved = false; reasons.push(`Conviction ${finalConviction}% below ${threshold}% threshold`); }
  else reasons.push(`Conviction ${finalConviction}% clears ${threshold}% threshold`);
  if (propRules?.dailyLossUsed != null && propRules?.dailyLossLimit != null) {
    const usedPct = Math.abs(propRules.dailyLossUsed) / propRules.dailyLossLimit;
    if (usedPct >= 0.8) { approved = false; reasons.push(`Daily loss ${Math.round(usedPct * 100)}% used — HALT per prop rules`); }
    else if (usedPct >= 0.5) reasons.push(`⚠ Daily loss ${Math.round(usedPct * 100)}% used — reduce size 50%`);
    else reasons.push(`Daily loss usage ${Math.round(usedPct * 100)}% — clear`);
  }
  if (degradedData) { approved = false; reasons.push("Data feed degraded (provider discrepancy) — standing down"); }
  if (direction === "NEUTRAL") { approved = false; reasons.push("No directional edge — stand down"); }
  return { agent: "RISK", approved, reasons };
}

// V13.6: CONFIRMATION GATE — raises the bar for FIRE from "the agents leaned this
// way" to "this is a confirmed, actionable move". A FIRE now requires real
// participation (above-average volume) AND either momentum thrust (a breakout)
// or a high-quality reversal structure (MSS / liquidity sweep). Everything that
// clears conviction but NOT this stays a HOLD (forming) instead of firing.
//
// This is the honest lever on win-rate: it can't guarantee outcomes (nothing
// can — markets aren't guaranteed), but it reserves FIRE for the setups worth
// acting on and feeds cleaner data to the self-learning loop. Momentum threshold
// is intentionally low (0.3%) so genuine early breakouts aren't missed; volume
// is skipped (not failed) when a provider returns no volume, so a data gap never
// silently blocks every signal.
function confirmationGate(direction, candles, tech, struct) {
  if (direction === "NEUTRAL") return { confirmed: false, reasons: ["no direction"] };
  const mom = tech?.data?.momentum ?? 0;
  const momOk = direction === "LONG" ? mom > 0.3 : mom < -0.3;

  const vols = candles.map((c) => c.volume || 0);
  const rv = relVolume(vols, 20);
  const volOk = rv == null ? true : rv >= 1.1;

  const ev = struct?.data?.events || [];
  const sweep = struct?.data?.sweep;
  const strongCatalyst = direction === "LONG"
    ? ev.includes("MSS_BULL") || sweep === "BULL"
    : ev.includes("MSS_BEAR") || sweep === "BEAR";

  const confirmed = volOk && (momOk || strongCatalyst);
  const reasons = [
    `momentum ${mom.toFixed(1)}% ${momOk ? "confirms" : "weak"}`,
    `rel-vol ${rv != null ? rv.toFixed(2) + "x" : "n/a"} ${volOk ? "ok" : "thin"}`,
    `catalyst ${strongCatalyst ? "MSS/sweep present" : "none"}`,
  ];
  return { confirmed, momOk, volOk, strongCatalyst, relVolume: rv != null ? Math.round(rv * 100) / 100 : null, reasons };
}

function portfolioManager(agents) {
  const W = { TECHNICAL: 0.35, STRUCTURE: 0.40, SENTIMENT: 0.25, "OPTIONS FLOW": 0.25 };
  let bull = 0, bear = 0;
  for (const a of agents) {
    const w = W[a.agent] ?? 0.2;
    if (a.signal === "bullish") bull += w * (a.confidence / 100);
    if (a.signal === "bearish") bear += w * (a.confidence / 100);
  }
  const net = bull - bear;
  const direction = net > 0.12 ? "LONG" : net < -0.12 ? "SHORT" : "NEUTRAL";
  const conviction = Math.min(100, Math.round(Math.abs(net) * 100 + agents.filter((a) => a.signal !== "neutral" && ((net > 0 && a.signal === "bullish") || (net < 0 && a.signal === "bearish"))).length * 12));
  return { direction, conviction, bullWeight: Math.round(bull * 100), bearWeight: Math.round(bear * 100) };
}

// Generic (standardized, non-personalized) option contract guidance.
// V13.6: SHORT-DATED and daily-tradeable. The old "2–4 weeks out" was a
// multi-week swing — not actionable for someone trading options day-to-day.
// The engine analyzes near-term structure, so the contract should match it:
// this week's expiry (0–5 DTE), near-the-money so directional moves pay off
// without a far-OTM lotto's theta bleed. IV note scales the caution.
function contractGuidance(direction, price, atmIV) {
  if (direction === "NEUTRAL" || !price) return null;
  const side = direction === "LONG" ? "CALLS" : "PUTS";
  const ivNote = atmIV != null
    ? (atmIV > 60 ? "IV rich — prefer a debit spread or slightly ITM to blunt theta"
      : atmIV > 40 ? "IV moderate — keep size small on 0–2 DTE"
      : "IV calm — clean environment for a directional debit")
    : "";
  return `${side} · this week's expiry (0–5 DTE) · ~0.45–0.55 delta (near-the-money)${ivNote ? ` · ${ivNote}` : ""}`;
}

// ─── PUBLIC: runSignalEngine ─────────────────────────────────────────────────
export async function runSignalEngine({ assetClass = "futures", symbol, interval, propRules = null }) {
  const iv = interval || MODE_DEFAULT_INTERVAL[assetClass] || "15min";
  const candleData = await getCandles(symbol, iv, { crossValidate: true });
  const { candles, currentPrice, degraded, source } = candleData;
  if (!candles?.length) throw new Error(candleData.errors?.[0]?.error || "No candle data");
  if (candles.length < 30) throw new Error(`Only ${candles.length} candles — need 30+`);

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const thirdAgentP = assetClass === "options"
    ? optionsFlowAgent(symbol)
    : sentimentAgent(symbol.replace("=F", "").replace("-USD", ""), finnhubKey);

  const tech = technicalAgent(candles);
  const struct = structureAgent(candles);
  const third = await thirdAgentP;

  const agents = [tech, struct, third];
  const pm = portfolioManager(agents);
  const risk = riskAgent(pm.conviction, pm.direction, propRules, degraded);
  // V13.6: confirmation gate — a FIRE must be a confirmed move, not just a vote.
  const confirm = confirmationGate(pm.direction, candles, tech, struct);

  const price = currentPrice ?? candles[candles.length - 1].close;
  const s = struct.data;
  let plan = null;
  if (pm.direction === "LONG" && risk.approved) {
    const stop = s.lastSwingLow ?? price * 0.995;
    const riskAmt = price - stop;
    plan = { entry: price, stop, t1: price + riskAmt * 1.5, t2: price + riskAmt * 3, rr: 3.0 };
  } else if (pm.direction === "SHORT" && risk.approved) {
    const stop = s.lastSwingHigh ?? price * 1.005;
    const riskAmt = stop - price;
    plan = { entry: price, stop, t1: price - riskAmt * 1.5, t2: price - riskAmt * 3, rr: 3.0 };
  }
  if (plan && assetClass === "options") {
    plan.contractGuidance = contractGuidance(pm.direction, price, third?.data?.atmIV ?? null);
  }

  // FIRE requires the risk gate AND a directional edge AND confirmation. Without
  // confirmation a real setup is still shown — as HOLD (forming) — so the user
  // sees it building without it being presented as an actionable trade yet.
  const canFire = risk.approved && pm.direction !== "NEUTRAL" && confirm.confirmed;
  return {
    assetClass, symbol, interval: iv, price,
    status: canFire ? "FIRE" : pm.direction !== "NEUTRAL" ? "HOLD" : "SCAN",
    direction: pm.direction,
    conviction: pm.conviction,
    confirmation: confirm,
    bullWeight: pm.bullWeight,
    bearWeight: pm.bearWeight,
    plan,
    agents: agents.map((a) => ({ agent: a.agent, signal: a.signal, confidence: a.confidence, reasons: a.reasons })),
    risk,
    structure: { events: s.events, sweep: s.sweep, fvgs: s.fvgs, swingHigh: s.lastSwingHigh, swingLow: s.lastSwingLow },
    candleCount: candles.length,
    dataSource: source,
    degraded: Boolean(degraded),
    fetchedAt: Date.now(),
    source: ENGINE_VERSION,
  };
}
