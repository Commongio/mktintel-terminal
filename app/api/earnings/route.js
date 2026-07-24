// app/api/earnings/route.js — V12: upcoming/recent earnings calendar.
// Finnhub's free /calendar/earnings endpoint (verified on the current key).
//   GET /api/earnings?days=14            (window: today-3 .. today+days)
//   GET /api/earnings?symbol=AAPL        (that ticker only; wider 120d window,
//                                          no coverage filter — we want its date)
const FINNHUB = "https://finnhub.io/api/v1";
const fmt = (d) => d.toISOString().slice(0, 10);

export async function GET(request) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return Response.json({ error: "FINNHUB_API_KEY not set" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") || "").trim().toUpperCase();
  // Per-symbol lookups want a longer horizon (next report can be ~90d out) and
  // shouldn't drop the row just because Finnhub has no estimate for it.
  const defaultDays = symbol ? 120 : 14;
  const maxDays = symbol ? 120 : 30;
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || String(defaultDays), 10) || defaultDays, 1), maxDays);
  const from = new Date(); from.setDate(from.getDate() - 3);   // include the last few days (recent reports)
  const to = new Date(); to.setDate(to.getDate() + days);

  try {
    const url = `${FINNHUB}/calendar/earnings?from=${fmt(from)}&to=${fmt(to)}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ""}&token=${apiKey}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error(`Finnhub ${r.status}`);
    const data = await r.json();
    const rows = (data?.earningsCalendar || [])
      .filter((e) => e.symbol && /^[A-Z]{1,5}$/.test(e.symbol))   // US equities, real tickers
      // Keep analyst-covered names (has an EPS or revenue estimate). Drops the
      // long tail of obscure micro-caps with no coverage that just add noise.
      // Skipped for a single-symbol lookup — there we want the date regardless.
      .filter((e) => symbol || e.epsEstimate != null || e.revenueEstimate != null)
      .map((e) => ({
        symbol: e.symbol,
        date: e.date,
        // bmo = before open, amc = after close, dmh = during market hours.
        when: e.hour === "bmo" ? "PRE" : e.hour === "amc" ? "AFTER" : e.hour === "dmh" ? "MID" : "",
        epsEst: e.epsEstimate ?? null,
        epsActual: e.epsActual ?? null,
        revEst: e.revenueEstimate ?? null,
        revActual: e.revenueActual ?? null,
        quarter: e.quarter ?? null,
        year: e.year ?? null,
        reported: e.epsActual != null,   // already out vs upcoming
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 120); // chronological window — keep the DOM light
    return Response.json({ count: rows.length, rows, fetchedAt: Date.now() });
  } catch (e) {
    return Response.json({ error: `Earnings feed unavailable: ${e.message}` }, { status: 502 });
  }
}
