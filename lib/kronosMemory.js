// lib/kronosMemory.js — V12 Phase 1: the KRONOS self-learning core.
//
// ONE deterministic engine. The 15 "behaviors" in the V12 spec (autopsy, pattern
// memory, adaptive conviction, self-doubt, confidence, teaching, mood, …) are not
// 15 subsystems — they are OUTPUT FACETS of the statistics computed here. This
// module owns the math; the LLM (scan/route.js) owns the voice, grounded in these
// numbers so it narrates real outcomes instead of inventing them.
//
// Design rules (see vault: "V12 Self-Learning Engine architecture"):
//   • Deterministic and auditable — never an LLM guess, same principle as the
//     signalEngine risk gate. Adaptive conviction is a computed delta, not magic.
//   • Honest at low sample size — below MIN_SAMPLES we say "insufficient history"
//     rather than fabricate a win-rate from 2 trades. Confidence claims cite N.
//   • Pure and dependency-free — runs server-side in the scan route today, and
//     could run client-side unchanged.
//
// "Learning" here = accumulating real graded outcomes and computing honest
// CONDITIONAL statistics (by setup, time, volatility, timeframe, direction). No
// black-box ML — there isn't enough trade volume to train anything honest.

// A win-rate from fewer than this many graded trades is not reported as a rate;
// it's reported as "forming" with the raw count. Prevents "100% win rate (1/1)".
export const MIN_SAMPLES = 5;
// Below this we won't nudge conviction at all — not enough signal to justify it.
export const MIN_SAMPLES_FOR_ADJUST = 8;
// Hard cap on how far history may move a signal's conviction, in points. The base
// engine vote stays the primary driver; memory only tilts it.
export const MAX_CONVICTION_ADJUST = 12;

const isGraded = (o) => ["WIN", "WINNING", "STOPPED", "LOSING"].includes(o);
const isWin = (o) => o === "WIN" || o === "WINNING";

// ── time-of-day + volatility buckets (the "conditions" behaviors 2/5/9 key on) ──
export function sessionBucket(ts) {
  if (ts == null) return "unknown";
  const h = new Date(ts).getUTCHours(); // ET ≈ UTC-4/5; buckets are coarse on purpose
  if (h >= 13 && h < 15) return "morning";   // ~9:30–11:00 ET open drive
  if (h >= 15 && h < 18) return "midday";     // ~11:00–14:00 ET chop
  if (h >= 18 && h < 21) return "afternoon";  // ~14:00–16:00 ET close
  return "extended";                          // pre/post market
}
export function vixRegime(vix) {
  if (vix == null) return "unknown";
  if (vix >= 25) return "high-vol";
  if (vix >= 18) return "elevated";
  return "calm";
}

// Normalize whatever the shadow-account/localStorage stores into one record shape.
// Defensive: trade history is user data that has changed format across versions.
function normalize(t) {
  if (!t || typeof t !== "object") return null;
  const outcome = String(t.outcome || "OPEN").toUpperCase();
  return {
    symbol: String(t.symbol || "").toUpperCase() || null,
    direction: t.direction === "SHORT" ? "SHORT" : t.direction === "LONG" ? "LONG" : null,
    conviction: Number.isFinite(+t.conviction) ? +t.conviction : null,
    interval: t.interval || t.timeframe || null,
    setup: t.setup || t.pattern || t.type || null, // Kronos Map condition / signal type
    outcome,
    movePct: Number.isFinite(+t.movePct) ? +t.movePct : null,
    session: t.session || sessionBucket(t.time ?? t.createdAt ?? t.ts),
    regime: t.regime || vixRegime(t.vix),
    ts: t.time ?? t.createdAt ?? t.ts ?? null,
    note: t.note || null,
  };
}

// Win-rate over a filtered slice, guarded for sample size.
function rate(records, predicate = () => true) {
  const graded = records.filter((r) => isGraded(r.outcome) && predicate(r));
  const n = graded.length;
  if (n === 0) return { n: 0, wins: 0, winRate: null, status: "none" };
  const wins = graded.filter((r) => isWin(r.outcome)).length;
  if (n < MIN_SAMPLES) return { n, wins, winRate: null, status: "forming" };
  return { n, wins, winRate: Math.round((wins / n) * 100), status: "ready" };
}

// Group win-rates by a key extractor, keeping only buckets with any graded trades.
function breakdown(records, keyFn) {
  const keys = [...new Set(records.map(keyFn).filter((k) => k != null && k !== "unknown"))];
  const out = {};
  for (const k of keys) out[k] = rate(records, (r) => keyFn(r) === k);
  return out;
}

/**
 * Build the full memory snapshot from raw trade history.
 * This object is what gets serialized into the LLM's context — every downstream
 * "behavior" reads from it, so the model can only speak to numbers that exist.
 */
export function buildMemory(rawTrades = [], { vix = null } = {}) {
  const records = (Array.isArray(rawTrades) ? rawTrades : []).map(normalize).filter(Boolean);
  const graded = records.filter((r) => isGraded(r.outcome));

  const overall = rate(records);
  const byConvictionBucket = {
    "80+": rate(records, (r) => (r.conviction ?? 0) >= 80),
    "65-79": rate(records, (r) => (r.conviction ?? 0) >= 65 && (r.conviction ?? 0) < 80),
    "50-64": rate(records, (r) => (r.conviction ?? 0) >= 50 && (r.conviction ?? 0) < 65),
    "<50": rate(records, (r) => (r.conviction ?? 0) < 50),
  };

  const bySetup = breakdown(records, (r) => r.setup);
  const bySession = breakdown(records, (r) => r.session);
  const byRegime = breakdown(records, (r) => r.regime);
  const byInterval = breakdown(records, (r) => r.interval);
  const byDirection = breakdown(records, (r) => r.direction);

  // Trader profile (behavior #4): where the user actually makes vs loses money.
  const profile = traderProfile(records, { bySetup, bySession, byInterval });

  // Autopsy queue (behavior #1): most recent decided losers, newest first.
  const autopsyQueue = records
    .filter((r) => r.outcome === "STOPPED" || r.outcome === "LOSING")
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, 5);

  // Market mood (behaviors #3/#9): coarse read from recent hit-rate + volatility.
  const mood = marketMood(records, vix);

  return {
    sampleSize: graded.length,
    totalLogged: records.length,
    overall, byConvictionBucket, bySetup, bySession, byRegime, byInterval, byDirection,
    profile, autopsyQueue, mood,
    vixRegime: vixRegime(vix),
    // Explicit so the LLM never has to guess whether it can make statistical claims.
    canMakeStatClaims: graded.length >= MIN_SAMPLES,
  };
}

function traderProfile(records, { bySetup, bySession, byInterval }) {
  const best = (obj) => Object.entries(obj)
    .filter(([, v]) => v.status === "ready")
    .sort((a, b) => b[1].winRate - a[1].winRate)[0]?.[0] || null;
  const worst = (obj) => Object.entries(obj)
    .filter(([, v]) => v.status === "ready")
    .sort((a, b) => a[1].winRate - b[1].winRate)[0]?.[0] || null;
  return {
    bestSetup: best(bySetup), worstSetup: worst(bySetup),
    bestSession: best(bySession), worstSession: worst(bySession),
    bestInterval: best(byInterval), worstInterval: worst(byInterval),
    // Null until there's enough decided history to say anything true.
    established: records.filter((r) => isGraded(r.outcome)).length >= MIN_SAMPLES,
  };
}

function marketMood(records, vix) {
  const recent = records
    .filter((r) => isGraded(r.outcome))
    .sort((a, b) => (b.ts || 0) - (a.ts || 0))
    .slice(0, 10);
  const reg = vixRegime(vix);
  if (reg === "high-vol") return { label: "high-volatility", basis: `VIX ${vix}` };
  const r = rate(recent);
  if (r.status !== "ready") return { label: "forming", basis: `${r.n} recent graded` };
  if (r.winRate >= 60) return { label: "constructive", basis: `${r.winRate}% recent hit-rate` };
  if (r.winRate <= 35) return { label: "hostile", basis: `${r.winRate}% recent hit-rate` };
  return { label: "choppy", basis: `${r.winRate}% recent hit-rate` };
}

/**
 * Adaptive conviction (behaviors #5/#11/#12), DETERMINISTIC.
 * Given a base engine conviction and a candidate signal's attributes, return an
 * adjusted conviction plus a plain-English, auditable reason string. The base
 * vote stays primary; history only tilts within ±MAX_CONVICTION_ADJUST, and only
 * when the relevant bucket has enough decided trades to justify a nudge.
 */
export function adaptConviction(base, candidate, memory) {
  const reasons = [];
  let delta = 0;
  const consider = (bucket, label) => {
    if (!bucket || bucket.status !== "ready" || bucket.n < MIN_SAMPLES_FOR_ADJUST) return;
    // Map win-rate distance from 50% into a bounded nudge; weight by sample size.
    const edge = (bucket.winRate - 50) / 50;            // -1..+1
    const weight = Math.min(1, bucket.n / 20);          // trust grows with N, capped
    const contrib = edge * 8 * weight;                  // per-facet cap ~8pts
    if (Math.abs(contrib) < 1) return;
    delta += contrib;
    reasons.push(`${label}: ${bucket.winRate}% over ${bucket.n} trades → ${contrib >= 0 ? "+" : ""}${contrib.toFixed(1)}`);
  };
  if (candidate?.setup) consider(memory?.bySetup?.[candidate.setup], `setup "${candidate.setup}"`);
  if (candidate?.session) consider(memory?.bySession?.[candidate.session], `${candidate.session} session`);
  if (candidate?.regime) consider(memory?.byRegime?.[candidate.regime], `${candidate.regime} regime`);
  if (candidate?.interval) consider(memory?.byInterval?.[candidate.interval], `${candidate.interval} timeframe`);

  delta = Math.max(-MAX_CONVICTION_ADJUST, Math.min(MAX_CONVICTION_ADJUST, Math.round(delta)));
  const adjusted = Math.max(0, Math.min(100, Math.round(base) + delta));
  return {
    base: Math.round(base),
    adjusted,
    delta,
    reasons,
    // If nothing qualified, say so honestly rather than implying it was "confirmed".
    applied: reasons.length > 0,
    note: reasons.length ? null : "No conditional history with enough samples to adjust; base conviction stands.",
  };
}

// Compact, token-cheap serialization for the LLM context block. Only includes
// buckets that are actually reportable, so the model never sees a null win-rate
// and hallucinates around it.
export function memoryForPrompt(memory) {
  if (!memory || !memory.canMakeStatClaims) {
    return {
      status: "insufficient-history",
      totalLogged: memory?.totalLogged ?? 0,
      sampleSize: memory?.sampleSize ?? 0,
      instruction: "Not enough decided trades to make statistical claims. Do NOT cite win-rates or 'X% of the time' figures. You may still teach and reason qualitatively.",
    };
  }
  const ready = (obj) => Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v.status === "ready").map(([k, v]) => [k, `${v.winRate}% (${v.n})`])
  );
  return {
    status: "active",
    sampleSize: memory.sampleSize,
    overall: memory.overall.status === "ready" ? `${memory.overall.winRate}% (${memory.overall.n})` : "forming",
    byConviction: ready(memory.byConvictionBucket),
    bySetup: ready(memory.bySetup),
    bySession: ready(memory.bySession),
    byRegime: ready(memory.byRegime),
    byInterval: ready(memory.byInterval),
    profile: memory.profile,
    mood: memory.mood,
    autopsyQueue: memory.autopsyQueue.map((r) => ({
      symbol: r.symbol, direction: r.direction, conviction: r.conviction,
      interval: r.interval, setup: r.setup, outcome: r.outcome, movePct: r.movePct,
    })),
  };
}
