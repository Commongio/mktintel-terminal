// app/api/technicals/route.js — V9
// RSI/MACD computed locally from candles (replaces the Twelve Data
// technicals dependency — zero extra API keys, no rate limits).
import { getCandles } from "../../../lib/marketData";
import { rsi, macd } from "../../../lib/indicators";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbols") || searchParams.get("symbol") || "").split(",")[0]?.trim().toUpperCase();
  if (!symbol) return Response.json({ error: "Missing 'symbol' param" }, { status: 400 });

  const { candles, source } = await getCandles(symbol, "1d");
  if (candles.length < 30) {
    return Response.json({ symbol, rsi: null, macd: null, error: "Not enough candle data" });
  }
  const closes = candles.map((c) => c.close);
  const r = rsi(closes);
  const m = macd(closes);
  return Response.json({
    symbol,
    rsi: r != null ? Math.round(r * 100) / 100 : null,
    macd: m ? { macd: Math.round(m.macd * 10000) / 10000, signal: Math.round(m.signal * 10000) / 10000, hist: Math.round(m.hist * 10000) / 10000 } : null,
    source,
    fetchedAt: Date.now(),
  });
}
