// lib/lessons.js — V14 "lessons learned" ledger for the dev self-teaching view.
//
// WHAT THIS IS
// ------------
// signalStats.js computes the aggregate win/loss statistics and applies them as a
// conviction gate. That gate is real but invisible: a signal quietly gets 6 points
// cut and nobody can see WHY. This module turns those same numbers into an
// explicit, human-readable ledger — for each thing the engine has learned, what it
// observed and what it CHANGED as a result.
//
// DESIGN RULES (identical to kronosMemory / signalStats — deliberately):
//   • Deterministic. A lesson is derived from graded outcomes, never invented by
//     an LLM. Same inputs → same ledger, so it's auditable.
//   • Honest at low N. Below MIN_LESSON_SAMPLES a bucket produces NO lesson; it
//     shows up as "still forming" instead of a confident claim from 3 trades.
//   • Every lesson names its evidence (win rate + sample size) and its effect.
//
// It reads ONLY what already exists (the signals table's won/lost lifecycle), so
// there's no new data collection and nothing to keep in sync.

import { aggregateConvictionAdjust, setupKey } from "./signalStats";

// A bucket needs at least this many graded trades before it may become a lesson.
// Matches signalStats' own MIN_SAMPLES so the ledger can never claim the engine
// "learned" something the gate isn't actually acting on yet.
export const MIN_LESSON_SAMPLES = 6;

// Win-rate thresholds that make a bucket noteworthy in either direction.
const WEAK = 45;    // at/below → the engine is cutting conviction here
const STRONG = 60;  // at/above → the engine trusts this signature more

const pct = (n) => `${n}%`;

// Human label for a setup signature ("options:1h:LONG" → "OPTIONS · 1h · LONG").
function describeKey(key) {
  const [assetClass, interval, direction] = String(key).split(":");
  return `${String(assetClass).toUpperCase()} · ${interval} · ${direction}`;
}

/**
 * Build the lessons ledger from an aggregate stats snapshot (buildSignalStats).
 * Returns newest-most-significant first. Each lesson is:
 *   { id, kind, title, observed, changed, evidence:{winRate,n}, severity }
 */
export function buildLessons(stats) {
  if (!stats?.available) {
    return { available: false, lessons: [], forming: [], sampleSize: 0 };
  }

  const lessons = [];
  const forming = [];

  for (const [key, bucket] of Object.entries(stats.byKey || {})) {
    // Not enough decided trades yet — record it as forming, don't fabricate a lesson.
    if (bucket.status !== "ready" || bucket.n < MIN_LESSON_SAMPLES) {
      forming.push({ key, label: describeKey(key), n: bucket.n, needed: MIN_LESSON_SAMPLES });
      continue;
    }

    // Ask the REAL gate what it does with this signature, so the "what changed"
    // line is the actual production behavior rather than a re-implementation.
    const [assetClass, interval, direction] = key.split(":");
    const adj = aggregateConvictionAdjust({ assetClass, interval, direction }, stats);

    if (bucket.winRate <= WEAK) {
      lessons.push({
        id: `weak:${key}`,
        kind: "weakness",
        severity: 2,
        title: `${describeKey(key)} setups are underperforming`,
        observed: `This signature won ${pct(bucket.winRate)} of ${bucket.n} graded trades — at or below the ${pct(WEAK)} weakness line.`,
        changed: adj.delta
          ? `The brain-sync gate now subtracts ${Math.abs(adj.delta)} conviction points from every new ${describeKey(key)} signal, and demotes it FIRE → HOLD if that drops it under the fire floor.`
          : `No conviction cut is being applied yet — the computed adjustment rounded to zero. The gate is watching this signature.`,
        evidence: { winRate: bucket.winRate, n: bucket.n },
      });
    } else if (bucket.winRate >= STRONG) {
      lessons.push({
        id: `strong:${key}`,
        kind: "strength",
        severity: 1,
        title: `${describeKey(key)} setups are outperforming`,
        observed: `This signature won ${pct(bucket.winRate)} of ${bucket.n} graded trades — at or above the ${pct(STRONG)} strength line.`,
        changed: adj.delta > 0
          ? `The gate now adds ${adj.delta} conviction points to new ${describeKey(key)} signals. The boost is capped far tighter than the cut (capital preservation first), so a hot streak can't inflate conviction the way a cold one deflates it.`
          : `No boost applied — upward adjustment is deliberately capped and this hasn't cleared it. The signature is trusted at face value.`,
        evidence: { winRate: bucket.winRate, n: bucket.n },
      });
    }
  }

  // Per-symbol lessons: a single ticker the engine keeps getting wrong is worth
  // calling out separately from its whole setup class.
  for (const [symbol, bucket] of Object.entries(stats.bySymbol || {})) {
    if (bucket.status !== "ready" || bucket.n < MIN_LESSON_SAMPLES) continue;
    if (bucket.winRate <= WEAK) {
      lessons.push({
        id: `sym:${symbol}`,
        kind: "symbol",
        severity: 3,
        title: `${symbol} has been a poor read`,
        observed: `Signals on ${symbol} won only ${pct(bucket.winRate)} of ${bucket.n} graded trades.`,
        changed: `Flagged for review. Per-symbol history does NOT auto-adjust conviction — the sample is too thin per ticker to act on safely, so this is surfaced for a human call rather than silently applied.`,
        evidence: { winRate: bucket.winRate, n: bucket.n },
      });
    }
  }

  // Overall calibration lesson — the single most important one, so it sorts first.
  if (stats.overall?.status === "ready") {
    const wr = stats.overall.winRate;
    lessons.unshift({
      id: "overall",
      kind: "calibration",
      severity: 0,
      title: `Overall engine hit-rate is ${pct(wr)}`,
      observed: `Across ${stats.overall.n} graded signals in the lookback window, ${stats.overall.wins} won.`,
      changed: wr < 50
        ? `Below break-even. The aggregate gate is running net-restrictive: more signatures are being cut than boosted, which suppresses marginal FIREs into HOLDs.`
        : `At or above break-even. The gate is applying per-signature adjustments only; no blanket restriction is in force.`,
      evidence: { winRate: wr, n: stats.overall.n },
    });
  }

  lessons.sort((a, b) => a.severity - b.severity);
  return {
    available: true,
    sampleSize: stats.sampleSize ?? 0,
    lessons,
    forming: forming.sort((a, b) => b.n - a.n).slice(0, 12),
  };
}

/**
 * Deterministic plain-English summary of the whole ledger — the "generate a short
 * summary on demand" button. Deliberately NOT an LLM call: this is a factual
 * roll-up of numbers that already exist, so it's instant, free, and can't
 * hallucinate a lesson the engine never actually learned.
 */
export function summarizeLessons(ledger) {
  if (!ledger?.available || !ledger.lessons.length) {
    const formingN = ledger?.forming?.length ?? 0;
    return formingN
      ? `No lessons yet. ${formingN} setup signature${formingN === 1 ? " is" : "s are"} still accumulating graded trades — each needs ${MIN_LESSON_SAMPLES} before the engine will draw a conclusion from it. This is intentional: a win-rate from 2 trades is noise, not a lesson.`
      : `No graded outcomes in the lookback window yet, so the engine has nothing to learn from. Lessons appear once signals start resolving to won/lost.`;
  }

  const weaknesses = ledger.lessons.filter((l) => l.kind === "weakness");
  const strengths = ledger.lessons.filter((l) => l.kind === "strength");
  const symbols = ledger.lessons.filter((l) => l.kind === "symbol");
  const overall = ledger.lessons.find((l) => l.kind === "calibration");

  const parts = [];
  if (overall) parts.push(overall.observed.replace(/^Across/, "Across"));
  if (weaknesses.length) {
    const one = weaknesses.length === 1;
    parts.push(`${weaknesses.length} setup signature${one ? " is" : "s are"} underperforming and now get${one ? "s" : ""} conviction cut automatically (${weaknesses.map((l) => l.title.replace(" setups are underperforming", "")).join(", ")}).`);
  }
  if (strengths.length) {
    parts.push(`${strengths.length} signature${strengths.length === 1 ? " is" : "s are"} outperforming (${strengths.map((l) => l.title.replace(" setups are outperforming", "")).join(", ")}).`);
  }
  if (symbols.length) {
    parts.push(`${symbols.length} individual ticker${symbols.length === 1 ? "" : "s"} flagged for manual review: ${symbols.map((l) => l.title.replace(" has been a poor read", "")).join(", ")}.`);
  }
  if (ledger.forming?.length) {
    const one = ledger.forming.length === 1;
    parts.push(`${ledger.forming.length} more signature${one ? " is" : "s are"} still forming and ${one ? "is" : "are"} deliberately not being acted on yet.`);
  }
  return parts.join(" ");
}
