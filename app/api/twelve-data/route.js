// app/api/twelve-data/route.js
// Twelve Data free tier: 800 req/day, 8/min
// Supplements Finnhub with: RSI, MACD, candles, global tickers

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbols = (searchParams.get("symbols") || "AAPL")
    .split(",").map(s => s.trim().toUpperCase()).filter(Boolean).slice(0, 8);
  const type = searchParams.get("type") || "quote";

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "TWELVE_DATA_API_KEY not set in .env.local" },
      { status: 500 }
    );
  }

  const BASE = "https://api.twelvedata.com";
  const sym  = symbols.join(",");

  try {
    // ── QUOTE (batch) ─────────────────────────────────────────────────────────
    if (type === "quote") {
      const r = await fetch(`${BASE}/quote?symbol=${sym}&apikey=${apiKey}`);
      if (!r.ok) throw new Error(`Twelve Data error ${r.status}`);
      const data = await r.json();
      // Normalize single vs multi-symbol response
      const normalized = symbols.length === 1
        ? { [symbols[0]]: data }
        : data;
      return Response.json({ type: "quote", data: normalized, fetchedAt: Date.now() });
    }

    // ── TECHNICALS (single symbol: RSI + MACD + price) ────────────────────────
    if (type === "technicals") {
      const s = symbols[0];
      const [rsiR, macdR, priceR, percentR] = await Promise.all([
        fetch(`${BASE}/rsi?symbol=${s}&interval=1day&time_period=14&apikey=${apiKey}&outputsize=1`),
        fetch(`${BASE}/macd?symbol=${s}&interval=1day&fast_period=12&slow_period=26&signal_period=9&apikey=${apiKey}&outputsize=1`),
        fetch(`${BASE}/price?symbol=${s}&apikey=${apiKey}`),
        fetch(`${BASE}/quote?symbol=${s}&apikey=${apiKey}`),
      ]);
      const [rsi, macd, price, quote] = await Promise.all([
        rsiR.json(), macdR.json(), priceR.json(), percentR.json(),
      ]);
      return Response.json({
        type: "technicals",
        symbol: s,
        rsi:    rsi?.values?.[0]?.rsi ?? null,
        macd:   macd?.values?.[0] ?? null,
        price:  price?.price ?? null,
        change: quote?.percent_change ?? null,
        volume: quote?.volume ?? null,
        fetchedAt: Date.now(),
      });
    }

    // ── CANDLES (1min for intraday view) ──────────────────────────────────────
    if (type === "candles") {
      const s = symbols[0];
      const r = await fetch(`${BASE}/time_series?symbol=${s}&interval=1min&outputsize=30&apikey=${apiKey}`);
      if (!r.ok) throw new Error(`Twelve Data error ${r.status}`);
      const data = await r.json();
      return Response.json({ type: "candles", symbol: s, candles: data?.values ?? [], fetchedAt: Date.now() });
    }

    return Response.json({ error: "Unknown type. Use: quote | technicals | candles" }, { status: 400 });

  } catch (err) {
    return Response.json({ error: String(err) }, { status: 502 });
  }
}