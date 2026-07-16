// lib/newsImpact.js — V10 news market-impact scorer (0–100) + explanation.
// Deterministic keyword/source/recency heuristic — free, instant, no LLM cost.
// Runs server-side in /api/news so every article ships with a rating.

const HIGH = [
  [/fomc|fed (rate|decision|cuts|hikes)|rate (cut|hike|decision)|powell|warsh/i, 30, "Fed/rates — moves the whole market"],
  [/cpi|inflation|pce|jobs report|nonfarm|payrolls|unemployment/i, 26, "Macro data release — market-wide repricing"],
  [/tariff|trade war|sanctions|executive order/i, 22, "Policy shock — sector-wide impact"],
  [/earnings|beats|misses|guidance|revenue|forecast/i, 18, "Earnings event — direct single-stock mover"],
  [/upgrade|downgrade|price target/i, 14, "Analyst action — near-term flow driver"],
  [/merger|acquisition|acquire|buyout|takeover/i, 22, "M&A — immediate repricing of target"],
  [/bankruptcy|default|fraud|investigation|probe|lawsuit|recall/i, 20, "Legal/credit stress — downside risk event"],
  [/fda|approval|phase 3|clinical/i, 18, "FDA/clinical catalyst — binary biotech move"],
  [/war|strike|attack|missile|escalat/i, 20, "Geopolitical risk — volatility driver"],
  [/bitcoin|crypto/i, 8, "Crypto-correlated flows"],
  [/nvidia|apple|microsoft|tesla|amazon|meta|alphabet|google/i, 10, "Mega-cap — index-level weight"],
  [/breaking/i, 8, "Flagged breaking"],
];
const SOURCE_WEIGHT = { reuters: 8, bloomberg: 8, cnbc: 6, wsj: 7, marketwatch: 4 };

// ── V10.5: BREAKING NEWS + LIVE SPEECH DETECTION ──────────────────────────────
// Drives the pulsing alert on the News tab. Deliberately NARROW: if everything
// pulses, nothing does. An item must be genuinely time-critical AND fresh.

// Explicit "this is happening right now" markers.
const BREAKING_RE = /\b(breaking|just in|urgent|developing|alert)\b/i;

// A speech/appearance that is live or imminent — these move the tape in real time,
// which is exactly when a trader needs to look up from the chart.
const LIVE_SPEECH_RE = /\b(live|speaks|speech|address(?:es|ing)?|press conference|presser|testimony|testifies|remarks|briefing|statement|news conference)\b/i;
const SPEAKER_RE = /\b(warsh|powell|fed chair|fomc|trump|president|white house|treasury secretary|yellen|bessent|lagarde|ecb|boj|opec)\b/i;

// Events that are breaking by nature, no keyword needed.
const CRITICAL_RE = /\b(rate (cut|hike|decision)|fomc decision|emergency|halt(ed)? trading|circuit breaker|invasion|attack|missile strike|assassinat|coup|default)\b/i;

const MINUTE = 60_000;

export function detectBreaking(item) {
  const text = `${item.headline || ""} ${item.summary || ""}`;
  const ageMs = item.datetime ? Date.now() - item.datetime : Infinity;

  // Live speeches stay "live" longer than a headline stays "breaking" — an address
  // runs for a while. Everything else has to be genuinely fresh.
  const isLiveSpeech = LIVE_SPEECH_RE.test(text) && SPEAKER_RE.test(text) && ageMs < 90 * MINUTE;
  const isBreaking = (BREAKING_RE.test(text) || CRITICAL_RE.test(text)) && ageMs < 45 * MINUTE;

  if (!isLiveSpeech && !isBreaking) return { breaking: false, live: false, kind: null };
  return {
    breaking: true,
    live: isLiveSpeech,
    kind: isLiveSpeech ? "LIVE" : "BREAKING",
  };
}

export function scoreNewsImpact(item) {
  const text = `${item.headline || ""} ${item.summary || ""}`;
  let score = 12; // base: ordinary market chatter
  const reasons = [];
  for (const [re, pts, why] of HIGH) {
    if (re.test(text)) { score += pts; reasons.push(why); }
  }
  const src = String(item.source || "").toLowerCase();
  for (const [name, pts] of Object.entries(SOURCE_WEIGHT)) {
    if (src.includes(name)) { score += pts; break; }
  }
  // Freshness: news older than 6h decays (timing edge is the point).
  if (item.datetime) {
    const ageH = (Date.now() - item.datetime) / 3.6e6;
    if (ageH > 6) score -= Math.min(18, (ageH - 6) * 1.5);
    else if (ageH < 1) { score += 6; reasons.push("Fresh — under an hour old"); }
  }

  // A live speech or genuine breaking item is, by definition, high impact.
  const flash = detectBreaking(item);
  if (flash.breaking) {
    score += flash.live ? 22 : 16;
    reasons.unshift(flash.live ? "LIVE — speech/appearance in progress" : "BREAKING — developing right now");
  }

  score = Math.max(2, Math.min(98, Math.round(score)));
  const label = score >= 70 ? "HIGH IMPACT" : score >= 45 ? "NOTABLE" : "NEUTRAL";
  const explanation = reasons.length
    ? reasons.slice(0, 3).join(" · ")
    : "No high-impact catalysts detected — routine coverage, low repricing risk";
  return { score, label, explanation, breaking: flash.breaking, live: flash.live, flashKind: flash.kind };
}
