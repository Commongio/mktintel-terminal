// app/api/filing-intel/route.js — V10.5
// The AI reasoning pass over SEC filings + Form 4 insider trades.
//
// THE POINT: the model is not allowed to just emit a number. For each item it must
// first answer a fixed set of questions about the filing — what the form actually
// is, whether this is routine or material, whether the insider's role and the
// transaction TYPE change the read — and only then produce a rating. The questions
// are in the prompt as required output fields, so a rating literally cannot be
// returned without the reasoning that produced it.
//
// It also receives the deterministic baseline (lib/filingImpact) and must justify
// any move away from it. That stops the two classic failure modes: the model
// inventing significance for a routine tax withholding, and the model rating every
// insider sale as bearish when most sales are scheduled 10b5-1 disposals.
//
// Cost control: ONE batched call for the whole page, cheap model, cached by the
// filing's accession URL (filings are immutable — a rating never needs recomputing).
import { baselineFilingScore, ratingLabel, TXN_CODES } from "../../../lib/filingImpact";

export const maxDuration = 30;

const CACHE = new Map();      // url -> rating object
const MAX_BATCH = 24;

const SYSTEM = `You rate SEC filings and Form 4 insider transactions for a professional trading terminal.

For EVERY item you MUST work through these questions before you rate it. Your answer is rejected if the reasoning does not actually address them:

1. WHAT IS IT? What does this specific form type actually disclose?
2. ROUTINE OR MATERIAL? Most filings are housekeeping. Is there a real reason a trader should care about THIS one, today?
3. FOR FORM 4 ONLY — what is the transaction CODE?
   - P (open-market purchase) is the single strongest insider signal: the insider spent their own money.
   - S (open-market sale) is weak on its own — executives sell for taxes, diversification, and pre-scheduled 10b5-1 plans. Do NOT treat a sale as bearish without more.
   - A (grant), M (option exercise), F (shares withheld for tax), G (gift) are COMPENSATION MECHANICS, not conviction. These should almost always rate LOW. Rating them as directional is the most common mistake in insider data — do not make it.
4. SIZE AND WHO? Is the size meaningful for this person, and are they an officer/director?
5. SO WHAT? Does this plausibly move the stock, or is it noise?

You are given a deterministic BASELINE score. Start there. You may move it, but if you move it more than 15 points you must say why in the reasoning.

Return STRICT JSON only, no prose, no markdown:
{"ratings":[{"id":"<id>","score":<0-100 int>,"reasoning":"<1-2 sentences that actually answer the questions above>","takeaway":"<max 12 words, what a trader does with this>"}]}`;

export async function POST(request) {
  const key = process.env.ANTHROPIC_API_KEY;
  let items;
  try {
    ({ items } = await request.json());
  } catch {
    return Response.json({ error: "Bad request body" }, { status: 400 });
  }
  if (!Array.isArray(items) || !items.length) {
    return Response.json({ ratings: [] });
  }

  // Serve anything we've already reasoned about; only send the rest.
  const ratings = [];
  const todo = [];
  for (const it of items.slice(0, MAX_BATCH)) {
    const cached = CACHE.get(it.url);
    if (cached) ratings.push({ ...cached, id: it.url });
    else todo.push(it);
  }

  // No key → the baseline still stands on its own. Degrade, don't fail.
  if (!key || !todo.length) {
    for (const it of todo) {
      const b = baselineFilingScore(it);
      ratings.push({ id: it.url, score: b.score, label: ratingLabel(b.score), reasoning: b.reasons.join(" · "), takeaway: "", source: "baseline" });
    }
    return Response.json({ ratings, reasoned: 0 });
  }

  // Give the model the facts, not the vibes.
  const payload = todo.map((it) => {
    const b = baselineFilingScore(it);
    const t = it.txnCode ? TXN_CODES[String(it.txnCode).toUpperCase()] : null;
    return {
      id: it.url,
      symbol: it.symbol,
      form: it.form,
      formName: it.formName,
      date: it.date,
      baseline: b.score,
      baselineWhy: b.reasons,
      ...(it.form === "4" ? {
        transactionCode: it.txnCode || "unknown",
        transactionMeaning: t ? t.label : "unknown",
        direction: it.direction || null,
        shares: it.txnShares || null,
        pricePerShare: it.txnPrice || null,
        valueUSD: it.txnValue || null,
        insider: it.insiderName || null,
        isOfficer: !!it.isOfficer,
        isDirector: !!it.isDirector,
        officerTitle: it.officerTitle || null,
      } : {}),
    };
  });

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // high volume, low stakes per item → cheap model
        max_tokens: 2000,
        system: SYSTEM,
        messages: [{ role: "user", content: `Rate these ${payload.length} items:\n${JSON.stringify(payload, null, 1)}` }],
      }),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const data = await res.json();
    const raw = data?.content?.[0]?.text || "";
    const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));

    for (const r of json.ratings || []) {
      const score = Math.max(2, Math.min(98, Math.round(Number(r.score) || 0)));
      const out = {
        id: r.id,
        score,
        label: ratingLabel(score),
        reasoning: String(r.reasoning || "").slice(0, 300),
        takeaway: String(r.takeaway || "").slice(0, 90),
        source: "ai",
      };
      CACHE.set(r.id, out);     // immutable filing → cache forever
      ratings.push(out);
    }

    // Anything the model skipped still gets its baseline — never leave a gap.
    for (const it of todo) {
      if (!ratings.some((r) => r.id === it.url)) {
        const b = baselineFilingScore(it);
        ratings.push({ id: it.url, score: b.score, label: ratingLabel(b.score), reasoning: b.reasons.join(" · "), takeaway: "", source: "baseline" });
      }
    }

    return Response.json({ ratings, reasoned: (json.ratings || []).length });
  } catch (err) {
    // AI unavailable → fall back to the baseline. The feed must never break because
    // the model timed out.
    for (const it of todo) {
      const b = baselineFilingScore(it);
      ratings.push({ id: it.url, score: b.score, label: ratingLabel(b.score), reasoning: b.reasons.join(" · "), takeaway: "", source: "baseline" });
    }
    return Response.json({ ratings, reasoned: 0, degraded: String(err.message) });
  }
}
