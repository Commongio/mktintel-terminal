// app/api/technicals/route.js — V9 → V12
// RSI/MACD + EMA stack, Bollinger, ATR, Stochastic RSI, VWAP, relative volume,
// and key stats — all computed locally from candles (no paid API, no rate limits).
import { getCandles } from "../../../lib/marketData";
import { rsi, macd, bollinger, emaLast, atr, stochRsi, vwap, relVolume } from "../../../lib/indicators";

const r2 = (v, p = 2) => (v == null ? null : Math.round(v * 10 ** p) / 10 ** p);

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbols") || searchParams.get("symbol") || "").split(",")[0]?.trim().toUpperCase();
  if (!symbol) return Response.json({ error: "Missing 'symbol' param" }, { status: 400 });

  const { candles, source } = await getCandles(symbol, "1d");
  if (candles.length < 30) {
    return Response.json({ symbol, rsi: null, macd: null, error: "Not enough candle data" });
  }

  const closes = candles.map((c) => c.close);
  const vols = candles.map((c) => c.volume || 0);
  const price = closes[closes.length - 1];
  const m = macd(closes);
  const bb = bollinger(closes, 20);

  // Key stats over the daily lookback we actually have (labelled by bar count).
  const highs = candles.map((c) => c.high), lows = candles.map((c) => c.low);
  const rangeHigh = Math.max(...highs), rangeLow = Math.min(...lows);
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : null;

  return Response.json({
    symbol,
    source,
    price: r2(price),
    rsi: r2(rsi(closes)),
    macd: m ? { macd: r2(m.macd, 4), signal: r2(m.signal, 4), hist: r2(m.hist, 4) } : null,
    ema: { e20: r2(emaLast(closes, 20)), e50: r2(emaLast(closes, 50)), e200: r2(emaLast(closes, 200)) },
    bollinger: bb ? { upper: r2(bb.upper), mid: r2(bb.mid), lower: r2(bb.lower), pctB: r2(bb.pctB * 100, 0) } : null,
    atr: r2(atr(candles, 14)),
    stochRsi: r2(stochRsi(closes), 0),
    vwap: r2(vwap(candles, 20)),
    relVolume: r2(relVolume(vols, 20)),
    keyStats: {
      rangeHigh: r2(rangeHigh), rangeLow: r2(rangeLow), lookbackBars: candles.length,
      avgVolume: avgVol != null ? Math.round(avgVol) : null,
    },
    fetchedAt: Date.now(),
  });
}
