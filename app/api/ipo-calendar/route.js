// app/api/ipo-calendar/route.js — Upcoming IPO calendar.
// Finnhub's free /calendar/ipo endpoint (same key as the earnings calendar).
//   GET /api/ipo-calendar?days=30   (window: today-3 .. today+days)
const FINNHUB = "https://finnhub.io/api/v1";
const fmt = (d) => d.toISOString().slice(0, 10);

export async function GET(request) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return Response.json({ error: "FINNHUB_API_KEY not set" }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30", 10) || 30, 1), 90);
  const from = new Date(); from.setDate(from.getDate() - 3);   // include the last few days (just-priced)
  const to = new Date(); to.setDate(to.getDate() + days);

  try {
    const r = await fetch(`${FINNHUB}/calendar/ipo?from=${fmt(from)}&to=${fmt(to)}&token=${apiKey}`,
      { signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error(`Finnhub ${r.status}`);
    const data = await r.json();
    const today = fmt(new Date());
    const rows = (data?.ipoCalendar || [])
      .filter((e) => e.symbol && e.date)
      .map((e) => ({
        symbol: e.symbol,
        name: e.name || e.symbol,
        date: e.date,
        exchange: e.exchange || "",
        // Finnhub statuses: expected / priced / withdrawn / filed.
        status: e.status || "",
        priceRange: e.price || "",          // e.g. "17.00-19.00" or "18.00"
        shares: e.numberOfShares ?? null,
        // Total offering value in USD when Finnhub provides it.
        totalValue: e.totalSharesValue ?? null,
        priced: e.status === "priced",
        past: e.date < today,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 120);
    return Response.json({ count: rows.length, rows, fetchedAt: Date.now() });
  } catch (e) {
    return Response.json({ error: `IPO feed unavailable: ${e.message}` }, { status: 502 });
  }
}
