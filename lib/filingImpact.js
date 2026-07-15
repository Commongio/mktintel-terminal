// lib/filingImpact.js — V10.5 SEC filing + insider-trade rating.
//
// Two layers, deliberately:
//
//   1. BASELINE (this file, free, instant, deterministic) — a prior based on what
//      the form type actually is and, for Form 4s, whether it's an open-market BUY
//      or a SELL. Always available, even with no API key.
//
//   2. AI REASONING PASS (/api/filing-intel) — the model is forced to interrogate
//      each item BEFORE it scores it: what is this form, is this routine or
//      material, does the insider's role and transaction type change the read?
//      Only after answering does it emit a rating. It starts from the baseline and
//      must justify moving away from it.
//
// Why the two layers: an LLM rating with no grounding drifts and hallucinates
// significance. A pure heuristic can't tell a routine 10b5-1 sale from a
// conviction buy. The baseline anchors the model; the model adds the judgement.

// Form 4 transaction codes that actually matter.
// P = open-market purchase (the strongest insider signal there is)
// S = open-market sale (weak on its own — insiders sell for a hundred reasons)
// A = grant/award, M = option exercise, F = shares withheld for tax
//     → these are COMPENSATION, not conviction. Rating them as bullish/bearish
//       is the classic insider-data mistake.
export const TXN_CODES = {
  P: { label: "BUY",       weight: 34, note: "Open-market purchase — insider spending own money" },
  S: { label: "SELL",      weight: 12, note: "Open-market sale — often scheduled, weak signal alone" },
  A: { label: "GRANT",     weight: 2,  note: "Equity award — compensation, not a conviction trade" },
  M: { label: "EXERCISE",  weight: 4,  note: "Option exercise — mechanical, not directional" },
  F: { label: "TAX",       weight: 1,  note: "Shares withheld for taxes — no market signal" },
  G: { label: "GIFT",      weight: 1,  note: "Gift — no market signal" },
  C: { label: "CONVERT",   weight: 3,  note: "Derivative conversion" },
};

const FORM_WEIGHT = [
  [/^8-K$/i,     42, "Material event — companies file this when something happened"],
  [/^10-K$/i,    30, "Annual report — full-year numbers and risk disclosures"],
  [/^10-Q$/i,    28, "Quarterly report — the numbers behind the last earnings print"],
  [/^S-1$/i,     34, "Registration statement — IPO or new share issuance (dilution risk)"],
  [/^SC 13D$/i,  46, "Activist stake — an investor taking a position to push change"],
  [/^SC 13G$/i,  24, "Passive 5%+ stake"],
  [/^13F/i,      18, "Institutional holdings — a quarter stale by the time it's public"],
  [/^DEF 14A$/i, 14, "Proxy — governance, pay, and shareholder votes"],
  [/^424B/i,     26, "Prospectus — pricing of a new offering (dilution)"],
];

// Deterministic prior. This is what the AI starts from and must argue against.
export function baselineFilingScore(item) {
  const form = String(item.form || "");
  const reasons = [];
  let score = 12;

  if (form === "4") {
    const code = String(item.txnCode || "").toUpperCase();
    const t = TXN_CODES[code];
    if (t) { score += t.weight; reasons.push(t.note); }
    else { score += 8; reasons.push("Insider transaction — type not parsed"); }

    // Size matters: a $50k token buy is not a $5M conviction buy.
    const val = Number(item.txnValue || 0);
    if (val >= 5_000_000)      { score += 22; reasons.push("Very large size (>$5M)"); }
    else if (val >= 1_000_000) { score += 14; reasons.push("Large size (>$1M)"); }
    else if (val >= 250_000)   { score += 7;  reasons.push("Moderate size (>$250k)"); }
    else if (val > 0)          { reasons.push("Small size — limited signal"); }

    if (item.isDirector || item.isOfficer) { score += 6; reasons.push("Filed by an officer/director"); }
  } else {
    let matched = false;
    for (const [re, pts, why] of FORM_WEIGHT) {
      if (re.test(form)) { score += pts; reasons.push(why); matched = true; break; }
    }
    if (!matched) { score += 8; reasons.push(`${form} filing`); }
  }

  // Recency: a filing loses its edge fast.
  const ageDays = item.date ? (Date.now() - new Date(item.date).getTime()) / 86400000 : 99;
  if (ageDays <= 1) { score += 10; reasons.push("Filed today"); }
  else if (ageDays <= 3) score += 4;
  else if (ageDays > 14) score -= Math.min(16, (ageDays - 14) * 0.8);

  score = Math.max(2, Math.min(98, Math.round(score)));
  return { score, reasons };
}

export const ratingLabel = (s) => (s >= 70 ? "HIGH IMPACT" : s >= 45 ? "NOTABLE" : "ROUTINE");
