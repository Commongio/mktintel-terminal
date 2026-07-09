// app/api/yf-quotes/route.js — V9
// Quotes now come from the redundant market-data layer (Yahoo → Finnhub →
// Twelve Data → Alpha Vantage with failover + caching). Route name kept for
// backward compatibility with existing client fetches.
import { getQuotes, providerHealth } from "../../../lib/marketData";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");
  if (!symbolsParam) {
    return Response.json({ error: "Missing 'symbols' param" }, { status: 400 });
  }
  const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 40);

  const { data, errors, missing, fetchedAt, sources } = await getQuotes(symbols);
  return Response.json({
    data,
    errors,
    missing,
    total: data.length,
    fetchedAt,
    source: sources.join("+") || "none",
    health: providerHealth(),
  });
}
