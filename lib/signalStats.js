// lib/signalStats.js — V13.5 server-side aggregate self-learning.
//
// kronosMemory.js computes PER-USER conditional win-rates from a user's own
// graded trade history (client localStorage → the AI chat). This module is its
// SERVER-SIDE, GLOBAL sibling: it reads the shared `signals` table's own graded
// lifecycle (state = won/lost, set by signalLifecycle.js) and computes aggregate
// win-rates across every signal the engine has ever fired.
//
// Two consumers:
//   1. The cron (generate-signals) consults it BEFORE handing a FIRE to users —
//      the "bot checks in with the terminal brain" sync: a setup signature that
//      has been losing recently gets its conviction nudged down, and can be
//      demoted FIRE → HOLD. Downgrade-only, evidence-gated, bounded.
//   2. The admin loss log (/api/admin/brain) reads the same stats + recent
//      losers — the dev-only self-teaching view.
//
// Same design rules as kronosMemory: deterministic, honest at low N, bounded.

const MIN_SAMPLES = 6;          // below this, no rate is reported and no nudge applied
const MAX_DOWN = 8;             // max points the aggregate memory may CUT conviction
const MAX_UP = 3;               // max it may ADD — asymmetric: capital preservation first
const FIRE_FLOOR_AFTER_ADJUST = 62; // a demoted FIRE below this becomes HOLD

// A signal's "setup signature" for aggregation. Not per-symbol (too sparse to
// learn from) — the class+timeframe+direction combo is the repeatable pattern.
export function setupKey(assetClass, interval, direction) {
  return `${assetClass || "?"}:${interval || "?"}:${direction || "?"}`;
}

function rate(rows) {
  const n = rows.length;
  if (n === 0) return { n: 0, wins: 0, winRate: null, status: "none" };
  const wins = rows.filter((r) => r.state === "won").length;
  if (n < MIN_SAMPLES) return { n, wins, winRate: null, status: "forming" };
  return { n, wins, winRate: Math.round((wins / n) * 100), status: "ready" };
}

/**
 * Build the aggregate stats snapshot from the shared signals table.
 * Reads only TERMINAL (won/lost) rows in the lookback window. Degrades safely to
 * an empty snapshot if the `state` column doesn't exist yet (migration 006).
 */
export async function buildSignalStats(admin, { lookbackDays = 30 } = {}) {
  const empty = { sampleSize: 0, overall: rate([]), byKey: {}, bySymbol: {}, byAssetClass: {}, recentLosers: [], available: false };
  if (!admin) return empty;

  const sinceISO = new Date(Date.now() - lookbackDays * 86400000).toISOString();
  const { data, error } = await admin
    .from("signals")
    .select("symbol,asset_class,interval,direction,conviction,state,created_at,resolved_at")
    .in("state", ["won", "lost"])
    .gte("created_at", sinceISO)
    .order("resolved_at", { ascending: false })
    .limit(2000);

  // 42703 = column "state" does not exist (migration 006 not run) → no stats yet.
  if (error) return empty;
  const rows = data || [];
  if (!rows.length) return { ...empty, available: true };

  const groupRate = (keyFn) => {
    const buckets = {};
    for (const r of rows) {
      const k = keyFn(r);
      (buckets[k] ||= []).push(r);
    }
    const out = {};
    for (const [k, list] of Object.entries(buckets)) out[k] = rate(list);
    return out;
  };

  return {
    sampleSize: rows.length,
    available: true,
    overall: rate(rows),
    byKey: groupRate((r) => setupKey(r.asset_class, r.interval, r.direction)),
    bySymbol: groupRate((r) => r.symbol),
    byAssetClass: groupRate((r) => r.asset_class),
    // Newest resolved losers — the raw material for the admin loss log + autopsy.
    recentLosers: rows.filter((r) => r.state === "lost").slice(0, 40),
  };
}

/**
 * How the aggregate memory tilts a candidate FIRE's conviction. Downgrade-heavy
 * and evidence-gated: only a setup signature with a READY (>= MIN_SAMPLES) rate
 * moves anything, and a losing bucket cuts harder than a winning one boosts.
 * Returns { delta, winRate, n, reason } — delta already bounded.
 */
export function aggregateConvictionAdjust({ assetClass, interval, direction }, stats) {
  if (!stats?.available) return { delta: 0, reason: "no aggregate history yet" };
  const bucket = stats.byKey?.[setupKey(assetClass, interval, direction)];
  if (!bucket || bucket.status !== "ready") return { delta: 0, reason: "insufficient history for this setup" };

  const edge = (bucket.winRate - 50) / 50;          // -1..+1
  const raw = edge * 10;                            // ~±10 before clamping
  let delta = Math.round(Math.max(-MAX_DOWN, Math.min(MAX_UP, raw)));
  if (delta === 0) return { delta: 0, winRate: bucket.winRate, n: bucket.n, reason: `neutral (${bucket.winRate}% over ${bucket.n})` };
  return {
    delta,
    winRate: bucket.winRate,
    n: bucket.n,
    reason: `aggregate ${bucket.winRate}% over ${bucket.n} similar setups → ${delta >= 0 ? "+" : ""}${delta}`,
  };
}

/**
 * Apply the aggregate gate to an engine signal IN PLACE-safe fashion (returns a
 * new object). This is the "terminal brain validates the bot" step: a FIRE whose
 * setup signature has been losing gets its conviction cut and may be demoted to
 * HOLD, with the reason recorded so it's auditable, never a black box.
 */
export function applyAggregateGate(sig, stats) {
  const adj = aggregateConvictionAdjust(
    { assetClass: sig.assetClass ?? sig.asset_class, interval: sig.interval, direction: sig.direction },
    stats
  );
  if (!adj.delta) return { sig, adjustment: adj };

  const newConviction = Math.max(0, Math.min(100, (sig.conviction ?? 0) + adj.delta));
  let status = sig.status;
  // Only a DOWNGRADE may change the verdict, and only FIRE → HOLD (never the
  // reverse — the aggregate memory can veto a fire, never manufacture one).
  if (adj.delta < 0 && status === "FIRE" && newConviction < FIRE_FLOOR_AFTER_ADJUST) {
    status = "HOLD";
  }
  return {
    sig: { ...sig, conviction: newConviction, status, aggregateAdjust: adj },
    adjustment: adj,
    demoted: status !== sig.status,
  };
}
