// app/api/options-flow/route.js
// Uses Yahoo Finance unofficial API (no key needed)
// Calculates: UOA, Max Pain, Earnings Implied Move
// Add ?symbols=AAPL,NVDA,TSLA (max 6)

const YF_BASE = "https://query2.finance.yahoo.com/v7/finance/options";

async function fetchOptionsChain(symbol) {
  const r = await fetch(`${YF_BASE}/${symbol}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 300 }, // cache 5 min
  });
  if (!r.ok) throw new Error(`YF ${r.status} for ${symbol}`);
  return r.json();
}

function calcUOA(chain, symbol, currentPrice) {
  const results = [];
  const expirations = chain?.optionChain?.result?.[0]?.expirationDates ?? [];
  const options     = chain?.optionChain?.result?.[0]?.options?.[0] ?? {};
  const allContracts = [
    ...(options.calls || []).map(c => ({ ...c, type: "CALL" })),
    ...(options.puts  || []).map(c => ({ ...c, type: "PUT"  })),
  ];
  for (const c of allContracts) {
    const vol = c.volume ?? 0;
    const oi  = c.openInterest ?? 1;
    const ratio = vol / oi;
    if (vol >= 500 && ratio >= 2.5) {
      results.push({
        symbol,
        type:       c.type,
        strike:     c.strike,
        expiry:     c.expiration ? new Date(c.expiration * 1000).toISOString().slice(0, 10) : "?",
        volume:     vol,
        openInt:    oi,
        ratio:      Math.round(ratio * 10) / 10,
        iv:         c.impliedVolatility ? Math.round(c.impliedVolatility * 100) : null,
        premium:    c.lastPrice ? Math.round(c.lastPrice * 100 * 100) / 100 : null, // contract premium
        inTheMoney: c.inTheMoney ?? false,
        sentiment:  c.type === "CALL" ? "BULLISH" : "BEARISH",
      });
    }
  }
  return results.sort((a, b) => b.ratio - a.ratio).slice(0, 8);
}

function calcMaxPain(chain) {
  const options = chain?.optionChain?.result?.[0]?.options?.[0] ?? {};
  const calls   = options.calls ?? [];
  const puts    = options.puts  ?? [];
  const strikes = [...new Set([...calls.map(c => c.strike), ...puts.map(c => c.strike)])].sort((a,b)=>a-b);
  let minPain = Infinity, maxPainStrike = null;
  for (const strike of strikes) {
    let pain = 0;
    for (const c of calls) if (c.strike < strike) pain += (strike - c.strike) * (c.openInterest || 0);
    for (const p of puts)  if (p.strike > strike) pain += (p.strike - strike) * (p.openInterest || 0);
    if (pain < minPain) { minPain = pain; maxPainStrike = strike; }
  }
  return maxPainStrike;
}

function calcImpliedMove(chain, currentPrice) {
  if (!currentPrice || currentPrice <= 0) return null;
  const options = chain?.optionChain?.result?.[0]?.options?.[0] ?? {};
  const calls   = options.calls ?? [];
  const puts    = options.puts  ?? [];
  // Find ATM call and put (closest to current price)
  const atmCall = calls.reduce((best, c) => !best || Math.abs(c.strike - currentPrice) < Math.abs(best.strike - currentPrice) ? c : best, null);
  const atmPut  = puts.reduce ((best, p) => !best || Math.abs(p.strike - currentPrice) < Math.abs(best.strike - currentPrice) ? p : best, null);
  if (!atmCall || !atmPut) return null;
  const straddle = (atmCall.lastPrice || 0) + (atmPut.lastPrice || 0);
  const pct      = (straddle / currentPrice) * 100;
  return { straddle: Math.round(straddle * 100) / 100, pct: Math.round(pct * 100) / 100 };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get("symbols") || "SPY,QQQ,NVDA,AAPL,TSLA")
    .split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 6);

  const results = await Promise.allSettled(
    symbols.map(async (sym) => {
      const chain = await fetchOptionsChain(sym);
      const quote = chain?.optionChain?.result?.[0]?.quote ?? {};
      const price = quote.regularMarketPrice ?? 0;
      return {
        symbol:        sym,
        price,
        uoa:           calcUOA(chain, sym, price),
        maxPain:       calcMaxPain(chain),
        impliedMove:   calcImpliedMove(chain, price),
        expirations:   (chain?.optionChain?.result?.[0]?.expirationDates ?? [])
                         .slice(0, 4)
                         .map(t => new Date(t * 1000).toISOString().slice(0, 10)),
      };
    })
  );

  const data = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

  const errors = results
    .filter(r => r.status === "rejected")
    .map((r, i) => ({ symbol: symbols[i], error: r.reason?.message }));

  // Flatten all UOA across symbols, sort by ratio
  const allUOA = data.flatMap(d => d.uoa).sort((a, b) => b.ratio - a.ratio).slice(0, 20);

  return Response.json({
    uoa:     allUOA,
    bySymbol: data,
    errors,
    fetchedAt: Date.now(),
    source: "Yahoo Finance (unofficial)",
  });
}