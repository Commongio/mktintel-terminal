// app/api/movers/route.js — V12: Top Movers / Top Losers / Most Active.
//
// Powered by Yahoo's predefined MARKET-WIDE screener (the most reliable free
// gainers/losers source in the redundant data layer — Finnhub/Twelve Data have
// no free market-wide movers endpoint). Covers every tradeable US equity, not
// the curated universe.
//   GET /api/movers?type=gainers|losers|actives&count=25
import { fetchScreener } from "../../../lib/universe";

const SCR = { gainers: "day_gainers", losers: "day_losers", actives: "most_actives" };

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = SCR[searchParams.get("type")] ? searchParams.get("type") : "gainers";
  const count = Math.min(Math.max(parseInt(searchParams.get("count") || "25", 10) || 25, 5), 100);
  try {
    const rows = await fetchScreener(SCR[type], count);
    return Response.json({ type, count: rows.length, rows, fetchedAt: Date.now() });
  } catch (e) {
    return Response.json({ error: `Movers unavailable: ${e.message}`, type }, { status: 502 });
  }
}
