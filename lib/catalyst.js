// lib/catalyst.js — was there a catalyst behind this signal?
//
// The scoring here is NOT new. lib/newsImpact.js already detects breaking
// items and live speeches, already matches Trump, Powell, the FOMC, the White
// House and the Treasury by name, already weights by source and decays by age.
// It was written, tested in the UI, and never once consulted when a signal was
// generated.
//
// That is the gap this closes. signalEngine imports candles, the options chain
// and indicators -- and nothing else. Seven catalyst routes exist in the app
// and not one of them is reachable from a decision. On options signals the
// sentiment agent does not even run (signalEngine.js:298), so the largest
// slice of the corpus has had no news input of any kind.
//
// RECORDED, NOT VOTING. Nothing here touches conviction, direction or status.
// It is captured at decision time, shipped to the Lab, and tested against
// outcomes there. The engine currently runs at roughly -0.5R per trade on 59
// verdicts; wiring three new inputs into the vote at once would mean never
// learning which of them, if any, was worth having. This gets measured first.

import { scoreNewsImpact } from "./newsImpact.js";

const MINUTE = 60_000;

// Per-symbol, and one market-wide. Chains and headlines both move slowly
// relative to a 5-minute scan, and a 40-symbol run should not make 40 macro
// calls for the same answer.
const symCache = new Map();
const SYM_TTL = 10 * MINUTE;
let macroCache = { at: 0, value: null };
const MACRO_TTL = 5 * MINUTE;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const EMPTY = {
  catalyst_present: false,
  headline_count: 0,
  max_impact: null,
  breaking_count: 0,
  live_speech: false,
  top_headline: null,
  top_source: null,
  top_age_minutes: null,
  looked: false,
};

/**
 * Finnhub company news, scored through the existing impact model.
 *
 * `looked: false` is the important field. A symbol with no catalyst and a
 * symbol nobody checked are completely different facts, and a zero that cannot
 * distinguish them would quietly become "no news" in every downstream slice.
 */
export async function symbolCatalyst(symbol, finnhubKey, now = Date.now()) {
  if (!symbol || !finnhubKey) return { ...EMPTY };

  const hit = symCache.get(symbol);
  if (hit && now - hit.at < SYM_TTL) return hit.value;

  let value = { ...EMPTY };
  try {
    const to = new Date(now).toISOString().slice(0, 10);
    const from = new Date(now - 2 * 864e5).toISOString().slice(0, 10);
    const r = await fetch(
      `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}&token=${finnhubKey}`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!r.ok) throw new Error(`Finnhub ${r.status}`);

    const items = (await r.json()).slice(0, 40).map((n) => ({
      headline: n.headline, summary: n.summary, source: n.source,
      // Finnhub reports seconds; the impact model expects milliseconds, and
      // getting this wrong silently ages every item by fifty years, which the
      // freshness decay would read as "nothing recent".
      datetime: isNum(n.datetime) ? n.datetime * 1000 : null,
    }));

    value = summarise(items, now);
    value.looked = true;
  } catch {
    value = { ...EMPTY, looked: false };
  }

  symCache.set(symbol, { at: now, value });
  return value;
}

/**
 * Market-wide catalysts: FOMC, macro prints, political statements. Fetched once
 * per scan batch rather than per symbol, since the answer is identical for all
 * of them.
 */
export async function macroCatalyst(finnhubKey, now = Date.now()) {
  if (!finnhubKey) return { ...EMPTY };
  if (macroCache.value && now - macroCache.at < MACRO_TTL) return macroCache.value;

  let value = { ...EMPTY };
  try {
    const r = await fetch(`https://finnhub.io/api/v1/news?category=general&token=${finnhubKey}`,
      { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`Finnhub ${r.status}`);
    const items = (await r.json()).slice(0, 40).map((n) => ({
      headline: n.headline, summary: n.summary, source: n.source,
      datetime: isNum(n.datetime) ? n.datetime * 1000 : null,
    }));
    value = summarise(items, now);
    value.looked = true;
  } catch {
    value = { ...EMPTY, looked: false };
  }

  macroCache = { at: now, value };
  return value;
}

/** Reduce a scored feed to the few fields a signal record should carry. */
function summarise(items, now) {
  if (!items.length) return { ...EMPTY, looked: true };

  let max = null, breaking = 0, live = false, top = null;
  for (const item of items) {
    // scoreNewsImpact already runs detectBreaking internally and returns its
    // verdict, so calling both would score every headline twice for the same
    // answer -- and the two could drift apart if either changed.
    let scored;
    try { scored = scoreNewsImpact(item); } catch { continue; }
    if (!isNum(scored?.score)) continue;

    if (scored.breaking) breaking++;
    if (scored.live) live = true;
    if (max === null || scored.score > max) { max = scored.score; top = item; }
  }

  return {
    // A real catalyst, not merely a busy news day: something genuinely
    // breaking, a live speech from someone who moves markets, or an item the
    // existing impact model rates high.
    catalyst_present: breaking > 0 || live || (isNum(max) && max >= 55),
    headline_count: items.length,
    max_impact: isNum(max) ? Math.round(max) : null,
    breaking_count: breaking,
    live_speech: live,
    // Truncated: this is stored on every signal, and a full summary would
    // dwarf the row it describes.
    top_headline: top?.headline ? String(top.headline).slice(0, 180) : null,
    top_source: top?.source ? String(top.source).slice(0, 60) : null,
    top_age_minutes: isNum(top?.datetime) ? Math.round((now - top.datetime) / MINUTE) : null,
    looked: true,
  };
}

/** Both halves, flattened onto one object for the signal record. */
export function mergeCatalyst(sym, macro) {
  return {
    catalyst_present: Boolean(sym?.catalyst_present || macro?.catalyst_present),
    symbol_catalyst: Boolean(sym?.catalyst_present),
    macro_catalyst: Boolean(macro?.catalyst_present),
    news_count: (sym?.headline_count ?? 0) + (macro?.headline_count ?? 0),
    max_impact: Math.max(sym?.max_impact ?? 0, macro?.max_impact ?? 0) || null,
    breaking_count: (sym?.breaking_count ?? 0) + (macro?.breaking_count ?? 0),
    live_speech: Boolean(sym?.live_speech || macro?.live_speech),
    top_headline: (sym?.max_impact ?? 0) >= (macro?.max_impact ?? 0) ? sym?.top_headline : macro?.top_headline,
    top_source: (sym?.max_impact ?? 0) >= (macro?.max_impact ?? 0) ? sym?.top_source : macro?.top_source,
    top_age_minutes: (sym?.max_impact ?? 0) >= (macro?.max_impact ?? 0) ? sym?.top_age_minutes : macro?.top_age_minutes,
    // False here means nobody looked -- no key, or the feed was down. Every
    // catalyst-sliced metric has to exclude those rather than read them as
    // quiet.
    catalyst_checked: Boolean(sym?.looked || macro?.looked),
  };
}
