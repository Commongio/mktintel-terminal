// lib/indicators.js — pure-JS indicator math shared by the signal engine,
// the technicals route, and anything else that needs it. No dependencies.

export function ema(values, period) {
  if (values.length < period) return [];
  const k = 2 / (period + 1);
  const out = [values.slice(0, period).reduce((a, b) => a + b, 0) / period];
  for (let i = period; i < values.length; i++) out.push(values[i] * k + out[out.length - 1] * (1 - k));
  return out;
}

export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let avgG = gains / period, avgL = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (avgL === 0) return 100;
  return 100 - 100 / (1 + avgG / avgL);
}

export function macd(closes) {
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  if (!e12.length || !e26.length) return null;
  const off = e12.length - e26.length;
  const line = e26.map((v, i) => e12[i + off] - v);
  const sig = ema(line, 9);
  if (!sig.length) return null;
  const m = line[line.length - 1], s = sig[sig.length - 1];
  return { macd: m, signal: s, hist: m - s };
}

export function bollinger(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const sd = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
  const price = closes[closes.length - 1];
  return { upper: mean + 2 * sd, lower: mean - 2 * sd, mid: mean, pctB: sd ? (price - (mean - 2 * sd)) / (4 * sd) : 0.5 };
}
