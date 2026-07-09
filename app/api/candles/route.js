// app/api/candles/route.js — V9
// OHLCV candles via the redundant market-data layer (Yahoo primary,
// Twelve Data failover, optional cross-validation). Response shape unchanged
// from V8.2 for compatibility.
import { getCandles, toYahoo } from "../../../lib/marketData";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const raw = (searchParams.get("symbol") || "NQ").toUpperCase();
  const interval = searchParams.get("interval") || "15min";
  const crossValidate = searchParams.get("validate") === "1";

  const { candles, currentPrice, source, errors, degraded, crossCheck, fetchedAt } =
    await getCandles(raw, interval, { crossValidate });

  if (!candles.length) {
    return Response.json({ error: errors?.[0]?.error || "No candle data", symbol: raw, errors }, { status: 502 });
  }

  return Response.json({
    symbol: raw,
    yfSymbol: toYahoo(raw),
    interval,
    candles,
    count: candles.length,
    currentPrice,
    degraded,
    crossCheck,
    fetchedAt: fetchedAt || Date.now(),
    source: source || "unknown",
  });
}
