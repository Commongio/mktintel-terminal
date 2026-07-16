// lib/marketData.js — V9 redundant market data layer (server-side only).
//
// One entry point for quotes and candles behind every API route. Providers are
// tried in priority order with per-provider health tracking and circuit
// breakers: a provider that errors or rate-limits gets benched with an
// exponential cooldown instead of being hammered. Failover, not fan-out —
// querying every provider in parallel would burn the free-tier rate limits
// that make this stack viable.
//
// Providers: Yahoo Finance (primary, no key) → Finnhub (quotes) / Twelve Data
// (candles+quotes, if key) → Alpha Vantage (quotes, if key).
// Short-TTL cache so N users don't mean N× upstream calls.

const YF = "https://query2.finance.yahoo.com";
const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  Accept: "application/json",
};

// Friendly futures/crypto symbols → Yahoo tickers
export const SYMBOL_MAP = { NQ: "NQ=F", MNQ: "MNQ=F", ES: "ES=F", MES: "MES=F", CL: "CL=F", GC: "GC=F", YM: "YM=F", BTC: "BTC-USD", ETH: "ETH-USD" };
export const toYahoo = (s) => SYMBOL_MAP[s] || s;

const INTERVAL_MAP = {
  "1min":  { yf: "1m",  range: "1d",  td: "1min"  },
  "5min":  { yf: "5m",  range: "5d",  td: "5min"  },
  "15min": { yf: "15m", range: "5d",  td: "15min" },
  "1h":    { yf: "60m", range: "1mo", td: "1h"    },
  "4h":    { yf: "60m", range: "3mo", td: "1h"    }, // aggregated from 1h
  "1d":    { yf: "1d",  range: "6mo", td: "1day"  },
  "1w":    { yf: "1wk", range: "5y",  td: "1week" },  // swing/position — monthly feed bucket
  "1mo":   { yf: "1mo", range: "10y", td: "1month" }, // long-horizon — yearly feed bucket
};

// ── health tracking / circuit breaker ────────────────────────────────────────
const health = new Map(); // provider -> { fails, benchedUntil, lastLatency }
function benched(p) {
  const h = health.get(p);
  return h && h.benchedUntil && Date.now() < h.benchedUntil;
}
function reportOk(p, ms) {
  health.set(p, { fails: 0, benchedUntil: 0, lastLatency: ms });
}
function reportFail(p) {
  const h = health.get(p) || { fails: 0 };
  const fails = h.fails + 1;
  // 30s, 60s, 2m, 4m... capped at 10 minutes
  const cooldown = Math.min(10 * 60_000, 30_000 * 2 ** Math.min(fails - 1, 5));
  health.set(p, { fails, benchedUntil: Date.now() + cooldown, lastLatency: h.lastLatency });
}
export function providerHealth() {
  return Object.fromEntries([...health.entries()].map(([k, v]) => [k, { ...v, benched: benched(k) }]));
}

// ── tiny TTL cache ────────────────────────────────────────────────────────────
const cache = new Map(); // key -> { at, ttl, value }
function cGet(key) {
  const e = cache.get(key);
  if (e && Date.now() - e.at < e.ttl) return e.value;
  if (e) cache.delete(key);
  return null;
}
function cSet(key, value, ttl) {
  if (cache.size > 500) cache.clear(); // crude memory guard
  cache.set(key, { at: Date.now(), ttl, value });
}

async function timed(provider, fn) {
  const t0 = Date.now();
  try {
    const v = await fn();
    reportOk(provider, Date.now() - t0);
    return v;
  } catch (e) {
    reportFail(provider);
    throw e;
  }
}

// ── QUOTE PROVIDERS (each returns array of normalized quotes) ────────────────
async function yahooQuotes(symbols) {
  const url = `${YF}/v7/finance/quote?symbols=${encodeURIComponent(symbols.map(toYahoo).join(","))}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketVolume,regularMarketPreviousClose,shortName,longName,marketState`;
  const r = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const data = await r.json();
  const back = Object.fromEntries(symbols.map((s) => [toYahoo(s), s]));
  return (data?.quoteResponse?.result || []).map((q) => ({
    symbol: back[q.symbol] || q.symbol,
    price: q.regularMarketPrice ?? null,
    change: q.regularMarketChange ?? null,
    changePercent: q.regularMarketChangePercent ?? null,
    open: q.regularMarketOpen ?? null,
    high: q.regularMarketDayHigh ?? null,
    low: q.regularMarketDayLow ?? null,
    volume: q.regularMarketVolume ?? null,
    prevClose: q.regularMarketPreviousClose ?? null,
    marketState: q.marketState ?? "CLOSED",
    name: q.shortName ?? q.longName ?? q.symbol,
    _src: "yahoo",
  }));
}

async function yahooQuoteSingle(symbol) {
  const url = `${YF}/v8/finance/chart/${encodeURIComponent(toYahoo(symbol))}?interval=1d&range=1d&includePrePost=true`;
  const r = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`Yahoo chart ${r.status}`);
  const meta = (await r.json())?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error("No chart data");
  const prev = meta.previousClose ?? meta.chartPreviousClose ?? null;
  return {
    symbol,
    price: meta.regularMarketPrice ?? null,
    change: prev != null ? (meta.regularMarketPrice ?? 0) - prev : null,
    changePercent: prev ? (((meta.regularMarketPrice ?? 0) - prev) / prev) * 100 : null,
    open: meta.regularMarketOpen ?? null,
    high: meta.regularMarketDayHigh ?? null,
    low: meta.regularMarketDayLow ?? null,
    volume: meta.regularMarketVolume ?? null,
    prevClose: prev,
    marketState: meta.marketState ?? "CLOSED",
    name: meta.shortName ?? symbol,
    _src: "yahoo-chart",
  };
}

async function finnhubQuotes(symbols) {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) throw new Error("No Finnhub key");
  const out = [];
  // Finnhub is 1 symbol/request; keep batches small to respect 60/min.
  for (const s of symbols.slice(0, 12)) {
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${key}`, { signal: AbortSignal.timeout(5000) });
    if (r.status === 429) throw new Error("Finnhub 429");
    if (!r.ok) continue;
    const q = await r.json();
    if (q && q.c) out.push({
      symbol: s, price: q.c, change: q.d ?? null, changePercent: q.dp ?? null,
      open: q.o ?? null, high: q.h ?? null, low: q.l ?? null,
      volume: null, prevClose: q.pc ?? null, marketState: "REGULAR", name: s, _src: "finnhub",
    });
  }
  if (!out.length) throw new Error("Finnhub returned nothing");
  return out;
}

async function twelveDataQuotes(symbols) {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("No Twelve Data key");
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.slice(0, 8).join(","))}&apikey=${key}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`TwelveData ${r.status}`);
  const data = await r.json();
  if (data.code === 429) throw new Error("TwelveData 429");
  const items = symbols.length === 1 ? { [symbols[0]]: data } : data;
  const out = [];
  for (const [sym, q] of Object.entries(items)) {
    if (!q || q.status === "error" || q.code) continue;
    out.push({
      symbol: sym, price: Number(q.close) || null, change: Number(q.change) || null,
      changePercent: Number(q.percent_change) || null, open: Number(q.open) || null,
      high: Number(q.high) || null, low: Number(q.low) || null,
      volume: Number(q.volume) || null, prevClose: Number(q.previous_close) || null,
      marketState: q.is_market_open ? "REGULAR" : "CLOSED", name: q.name || sym, _src: "twelvedata",
    });
  }
  if (!out.length) throw new Error("TwelveData returned nothing");
  return out;
}

async function alphaVantageQuotes(symbols) {
  const key = process.env.ALPHA_VANTAGE_API_KEY;
  if (!key) throw new Error("No Alpha Vantage key");
  // 25 req/day free — emergency use, first 3 symbols only.
  const out = [];
  for (const s of symbols.slice(0, 3)) {
    const r = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(s)}&apikey=${key}`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) continue;
    const q = (await r.json())?.["Global Quote"];
    if (q && q["05. price"]) out.push({
      symbol: s, price: Number(q["05. price"]), change: Number(q["09. change"]) || null,
      changePercent: Number(String(q["10. change percent"] || "").replace("%", "")) || null,
      open: Number(q["02. open"]) || null, high: Number(q["03. high"]) || null,
      low: Number(q["04. low"]) || null, volume: Number(q["06. volume"]) || null,
      prevClose: Number(q["08. previous close"]) || null, marketState: "CLOSED", name: s, _src: "alphavantage",
    });
  }
  if (!out.length) throw new Error("Alpha Vantage returned nothing");
  return out;
}

// NOTE: health keys are per-endpoint, not per-vendor — Yahoo's v7 quote API
// failing must not bench Yahoo's v8 chart API (different endpoints, different
// failure modes).
const QUOTE_PROVIDERS = [
  ["yahoo-quotes", yahooQuotes],
  ["finnhub-quotes", finnhubQuotes],
  ["twelvedata-quotes", twelveDataQuotes],
  ["alphavantage-quotes", alphaVantageQuotes],
];

// ── PUBLIC: getQuotes ─────────────────────────────────────────────────────────
export async function getQuotes(symbols) {
  const key = `q:${symbols.join(",")}`;
  const hit = cGet(key);
  if (hit) return hit;

  const results = new Map();
  const errors = [];
  let missing = [...symbols];

  for (const [name, fn] of QUOTE_PROVIDERS) {
    if (!missing.length) break;
    if (benched(name)) continue;
    try {
      const quotes = await timed(name, () => fn(missing));
      for (const q of quotes) if (q.price != null) results.set(q.symbol, q);
      missing = missing.filter((s) => !results.has(s));
    } catch (e) {
      errors.push({ provider: name, error: String(e.message) });
    }
  }

  // Last-ditch per-symbol Yahoo chart fallback (works when v7 batch is blocked).
  if (missing.length && !benched("yahoo-chart")) {
    const settled = await Promise.allSettled(missing.map((s) => timed("yahoo-chart", () => yahooQuoteSingle(s))));
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") results.set(missing[i], r.value);
      else errors.push({ symbol: missing[i], error: String(r.reason?.message) });
    });
    missing = missing.filter((s) => !results.has(s));
  }

  const data = symbols.map((s) => results.get(s)).filter(Boolean);
  const out = { data, errors, missing, fetchedAt: Date.now(), sources: [...new Set(data.map((d) => d._src))] };
  if (data.length) cSet(key, out, 15_000); // 15s TTL
  return out;
}

// ── CANDLE PROVIDERS ──────────────────────────────────────────────────────────
async function yahooCandles(symbol, interval) {
  const map = INTERVAL_MAP[interval] || INTERVAL_MAP["15min"];
  const url = `${YF}/v8/finance/chart/${encodeURIComponent(toYahoo(symbol))}?interval=${map.yf}&range=${map.range}&includePrePost=false`;
  const r = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Yahoo ${r.status}`);
  const result = (await r.json())?.chart?.result?.[0];
  if (!result) throw new Error("No chart data");
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  let candles = ts.map((t, i) => ({
    time: new Date(t * 1000).toISOString(),
    open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i],
    volume: q.volume?.[i] ?? 0,
  })).filter((c) => c.open != null && c.high != null && c.low != null && c.close != null);
  return { candles, currentPrice: result.meta?.regularMarketPrice ?? candles[candles.length - 1]?.close ?? null, _src: "yahoo" };
}

async function twelveDataCandles(symbol, interval) {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error("No Twelve Data key");
  const map = INTERVAL_MAP[interval] || INTERVAL_MAP["15min"];
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=${map.td}&outputsize=150&apikey=${key}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`TwelveData ${r.status}`);
  const data = await r.json();
  if (data.code || data.status === "error") throw new Error(`TwelveData ${data.code || "error"}`);
  const candles = (data.values || []).reverse().map((v) => ({
    time: new Date(v.datetime).toISOString(),
    open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close),
    volume: Number(v.volume) || 0,
  }));
  if (!candles.length) throw new Error("TwelveData empty");
  return { candles, currentPrice: candles[candles.length - 1]?.close ?? null, _src: "twelvedata" };
}

function aggregate4h(candles) {
  const agg = [];
  for (let i = 0; i < candles.length; i += 4) {
    const chunk = candles.slice(i, i + 4);
    if (!chunk.length) break;
    agg.push({
      time: chunk[0].time,
      open: chunk[0].open,
      high: Math.max(...chunk.map((c) => c.high)),
      low: Math.min(...chunk.map((c) => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + (c.volume || 0), 0),
    });
  }
  return agg;
}

// ── PUBLIC: getCandles ────────────────────────────────────────────────────────
export async function getCandles(symbol, interval = "15min", { crossValidate = false } = {}) {
  const key = `c:${symbol}:${interval}`;
  const hit = cGet(key);
  if (hit) return hit;

  const providers = [["yahoo-candles", yahooCandles], ["twelvedata-candles", twelveDataCandles]];
  let result = null, source = null;
  const errors = [];
  for (const [name, fn] of providers) {
    if (benched(name)) continue;
    try {
      result = await timed(name, () => fn(symbol, interval));
      source = name;
      break;
    } catch (e) { errors.push({ provider: name, error: String(e.message) }); }
  }
  if (!result) return { candles: [], currentPrice: null, errors, degraded: true, source: null };

  let candles = result.candles;
  if (interval === "4h") candles = aggregate4h(candles);
  candles = candles.slice(-120);

  // Cross-validation for signal-critical data: check latest close against a
  // second healthy provider; large discrepancy → mark degraded (engine can
  // choose not to FIRE on degraded data).
  let degraded = false, crossCheck = null;
  if (crossValidate && source === "yahoo-candles" && process.env.TWELVE_DATA_API_KEY && !benched("twelvedata-candles")) {
    try {
      const alt = await timed("twelvedata-candles", () => twelveDataCandles(symbol, interval));
      const a = candles[candles.length - 1]?.close, b = alt.candles[alt.candles.length - 1]?.close;
      if (a && b) {
        const diffPct = Math.abs(a - b) / a * 100;
        crossCheck = { primary: a, secondary: b, diffPct: Math.round(diffPct * 100) / 100 };
        if (diffPct > 0.5) degraded = true;
      }
    } catch { /* cross-check is best-effort */ }
  }

  const out = { candles, currentPrice: result.currentPrice, source, errors, degraded, crossCheck, fetchedAt: Date.now() };
  cSet(key, out, 60_000); // 60s TTL
  return out;
}
