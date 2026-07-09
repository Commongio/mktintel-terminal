// lib/optionsData.js — V9 options chain data for the options-mode agent.
// Yahoo Finance unofficial chain endpoint (same source the V.7 options-flow
// route uses). Free + delayed; summarized into agent-friendly stats.

const YF_OPTIONS = "https://query2.finance.yahoo.com/v7/finance/options";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "application/json",
};

const cache = new Map(); // symbol -> { at, value }
const TTL = 5 * 60_000;  // chains are delayed anyway; 5 min cache

// Yahoo's v7 endpoints now require a session cookie + crumb (same dance
// yfinance does). Cached ~25 min; refreshed on 401.
let session = null; // { cookie, crumb, at }
async function getYahooSession(force = false) {
  if (!force && session && Date.now() - session.at < 25 * 60_000) return session;
  // Bootstrap cookies from fc.yahoo.com (returns 404 but sets the A3 cookie).
  const r1 = await fetch("https://fc.yahoo.com/", {
    headers: { "User-Agent": HEADERS["User-Agent"], Accept: "text/html,application/xhtml+xml,*/*;q=0.8" },
    redirect: "manual", signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  const setCookie = r1?.headers?.get("set-cookie") || "";
  const cookie = setCookie.split(";")[0] || "";
  if (!cookie) throw new Error("No Yahoo session cookie");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: {
      "User-Agent": HEADERS["User-Agent"],
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: cookie,
    },
    signal: AbortSignal.timeout(6000),
  });
  if (!r2.ok) throw new Error(`Crumb fetch ${r2.status}`);
  const crumb = (await r2.text()).trim();
  if (!crumb || crumb.includes("<")) throw new Error("Invalid crumb");
  session = { cookie, crumb, at: Date.now() };
  return session;
}

async function fetchChainRaw(symbol) {
  const s = await getYahooSession();
  const url = `${YF_OPTIONS}/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(s.crumb)}`;
  let r = await fetch(url, { headers: { ...HEADERS, Cookie: s.cookie }, signal: AbortSignal.timeout(8000) });
  if (r.status === 401 || r.status === 403) {
    const s2 = await getYahooSession(true);
    r = await fetch(`${YF_OPTIONS}/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(s2.crumb)}`, {
      headers: { ...HEADERS, Cookie: s2.cookie }, signal: AbortSignal.timeout(8000),
    });
  }
  if (!r.ok) throw new Error(`Options chain ${r.status}`);
  return r.json();
}

export async function fetchChainSummary(symbol) {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL) return hit.value;

  const data = await fetchChainRaw(symbol);
  const result = data?.optionChain?.result?.[0];
  const options = result?.options?.[0] || {};
  const calls = options.calls || [];
  const puts = options.puts || [];
  const price = result?.quote?.regularMarketPrice ?? null;
  if (!calls.length && !puts.length) throw new Error("Empty options chain");

  const sum = (arr, f) => arr.reduce((s, c) => s + (f(c) || 0), 0);
  const callVol = sum(calls, (c) => c.volume);
  const putVol = sum(puts, (c) => c.volume);
  const callOI = sum(calls, (c) => c.openInterest);
  const putOI = sum(puts, (c) => c.openInterest);

  // Unusual activity: volume >= 500 and vol/OI >= 2.5 (same thresholds as V.7)
  const unusual = [...calls.map((c) => ({ ...c, type: "CALL" })), ...puts.map((c) => ({ ...c, type: "PUT" }))]
    .filter((c) => (c.volume ?? 0) >= 500 && (c.volume ?? 0) / Math.max(1, c.openInterest ?? 1) >= 2.5);
  const unusualCalls = unusual.filter((c) => c.type === "CALL").length;
  const unusualPuts = unusual.filter((c) => c.type === "PUT").length;

  // ATM implied volatility (nearest strikes to spot)
  const nearest = (arr) => arr.reduce((best, c) => (!best || Math.abs(c.strike - price) < Math.abs(best.strike - price) ? c : best), null);
  const atmCall = price ? nearest(calls) : null;
  const atmPut = price ? nearest(puts) : null;
  const atmIV = atmCall?.impliedVolatility && atmPut?.impliedVolatility
    ? ((atmCall.impliedVolatility + atmPut.impliedVolatility) / 2) * 100
    : (atmCall?.impliedVolatility ?? atmPut?.impliedVolatility ?? null) * 100 || null;

  // Implied move from ATM straddle
  const straddle = (atmCall?.lastPrice || 0) + (atmPut?.lastPrice || 0);
  const impliedMovePct = price && straddle ? Math.round((straddle / price) * 10000) / 100 : null;

  // Max pain
  const strikes = [...new Set([...calls.map((c) => c.strike), ...puts.map((p) => p.strike)])].sort((a, b) => a - b);
  let minPain = Infinity, maxPain = null;
  for (const strike of strikes) {
    let pain = 0;
    for (const c of calls) if (c.strike < strike) pain += (strike - c.strike) * (c.openInterest || 0);
    for (const p of puts) if (p.strike > strike) pain += (p.strike - strike) * (p.openInterest || 0);
    if (pain < minPain) { minPain = pain; maxPain = strike; }
  }

  const value = {
    symbol, price,
    putCallVolumeRatio: callVol ? Math.round((putVol / callVol) * 100) / 100 : null,
    putCallOIRatio: callOI ? Math.round((putOI / callOI) * 100) / 100 : null,
    callVol, putVol, unusualCalls, unusualPuts,
    atmIV: atmIV ? Math.round(atmIV * 10) / 10 : null,
    impliedMovePct, maxPain,
    expiry: options.expirationDate ? new Date(options.expirationDate * 1000).toISOString().slice(0, 10) : null,
    fetchedAt: Date.now(),
  };
  cache.set(symbol, { at: Date.now(), value });
  return value;
}
