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

// ── V12 additions: all pure OHLCV math, no paid data ──────────────────────────

// Simple moving average (last value). Null until enough data.
export function sma(values, period) {
  if (values.length < period) return null;
  const s = values.slice(-period);
  return s.reduce((a, b) => a + b, 0) / period;
}

// Last EMA value (convenience over the array-returning ema()).
export function emaLast(values, period) {
  const e = ema(values, period);
  return e.length ? e[e.length - 1] : null;
}

// Average True Range — volatility / stop-sizing. Wilder's RMA of True Range.
export function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const tr = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  let a = tr.slice(0, period).reduce((x, y) => x + y, 0) / period;
  for (let i = period; i < tr.length; i++) a = (a * (period - 1) + tr[i]) / period;
  return a;
}

// RSI series (one value per bar once warmed up) — needed for Stochastic RSI.
function rsiSeries(closes, period = 14) {
  if (closes.length < period + 1) return [];
  const out = [];
  let avgG = 0, avgL = 0;
  for (let i = 1; i <= period; i++) { const d = closes[i] - closes[i - 1]; if (d >= 0) avgG += d; else avgL -= d; }
  avgG /= period; avgL /= period;
  out.push(avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period;
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period;
    out.push(avgL === 0 ? 100 : 100 - 100 / (1 + avgG / avgL));
  }
  return out;
}

// Stochastic RSI (0–100): where current RSI sits in its recent range. Momentum.
export function stochRsi(closes, rsiPeriod = 14, stochPeriod = 14) {
  const rs = rsiSeries(closes, rsiPeriod);
  if (rs.length < stochPeriod) return null;
  const window = rs.slice(-stochPeriod);
  const min = Math.min(...window), max = Math.max(...window);
  const cur = rs[rs.length - 1];
  return max === min ? 50 : ((cur - min) / (max - min)) * 100;
}

// Rolling volume-weighted average price over `period` bars. (True session VWAP
// is intraday; on daily candles this is an anchored N-bar VWAP — labelled as such.)
export function vwap(candles, period = 20) {
  if (candles.length < period) return null;
  const s = candles.slice(-period);
  let pv = 0, v = 0;
  for (const c of s) { const tp = (c.high + c.low + c.close) / 3; pv += tp * (c.volume || 0); v += c.volume || 0; }
  return v ? pv / v : null;
}

// Relative volume: latest bar's volume vs the average of the prior `period` bars.
export function relVolume(volumes, period = 20) {
  if (volumes.length < period + 1) return null;
  const prior = volumes.slice(-period - 1, -1);
  const avg = prior.reduce((a, b) => a + b, 0) / period;
  return avg ? (volumes[volumes.length - 1] || 0) / avg : null;
}
