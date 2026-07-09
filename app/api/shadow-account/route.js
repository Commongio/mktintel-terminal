// app/api/shadow-account/route.js — V.8.2
// Shadow Account pattern from Vibe-Trading (MIT): track every signal vs actual outcome.
// Client stores signals in localStorage and POSTs them here for evaluation.
// We fetch current prices from Yahoo and grade each signal.

const YF = "https://query2.finance.yahoo.com/v8/finance/chart";
const HEADERS = { "User-Agent": "Mozilla/5.0" };
const SYMBOL_MAP = { NQ: "NQ=F", MNQ: "MNQ=F", ES: "ES=F", MES: "MES=F", CL: "CL=F", GC: "GC=F" };

async function currentPrice(symbol) {
  const yf = SYMBOL_MAP[symbol] || symbol;
  const r = await fetch(`${YF}/${encodeURIComponent(yf)}?interval=1d&range=1d`, { headers: HEADERS, signal: AbortSignal.timeout(6000) });
  if (!r.ok) return null;
  const d = await r.json();
  return d?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
}

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const signals = (body.signals || []).slice(0, 50); // cap
  if (!signals.length) return Response.json({ evaluated: [], stats: null });

  // Get unique symbols, fetch prices once each
  const symbols = [...new Set(signals.map(s => s.symbol))];
  const prices = {};
  await Promise.allSettled(symbols.map(async sym => { prices[sym] = await currentPrice(sym); }));

  const evaluated = signals.map(sig => {
    const px = prices[sig.symbol];
    if (px == null || sig.entry == null) return { ...sig, outcome: "UNKNOWN", movePct: null };
    const move = ((px - sig.entry) / sig.entry) * 100;
    const directional = sig.direction === "LONG" ? move : -move;
    let outcome = "OPEN";
    // Grade: hit stop / hit t1 / still open
    if (sig.direction === "LONG") {
      if (sig.stop != null && px <= sig.stop) outcome = "STOPPED";
      else if (sig.t1 != null && px >= sig.t1) outcome = "WIN";
    } else if (sig.direction === "SHORT") {
      if (sig.stop != null && px >= sig.stop) outcome = "STOPPED";
      else if (sig.t1 != null && px <= sig.t1) outcome = "WIN";
    }
    // Age-based grading for signals without levels
    if (outcome === "OPEN" && Math.abs(directional) > 0.4) {
      outcome = directional > 0 ? "WINNING" : "LOSING";
    }
    return { ...sig, currentPrice: px, movePct: Math.round(directional * 100) / 100, outcome };
  });

  const graded = evaluated.filter(e => ["WIN", "STOPPED", "WINNING", "LOSING"].includes(e.outcome));
  const wins   = graded.filter(e => e.outcome === "WIN" || e.outcome === "WINNING").length;
  const stats = graded.length ? {
    total: evaluated.length,
    graded: graded.length,
    wins,
    winRate: Math.round((wins / graded.length) * 100),
    avgMove: Math.round(graded.reduce((s, e) => s + (e.movePct || 0), 0) / graded.length * 100) / 100,
    // Accuracy by conviction bucket
    highConvWinRate: (() => {
      const hc = graded.filter(e => (e.conviction ?? 0) >= 70);
      if (!hc.length) return null;
      return Math.round(hc.filter(e => e.outcome === "WIN" || e.outcome === "WINNING").length / hc.length * 100);
    })(),
  } : null;

  return Response.json({ evaluated, stats, fetchedAt: Date.now() });
}
