// app/api/quote/route.js
// Fetches live quote data from Finnhub for one or more tickers.
// Usage: /api/quote?symbols=NVDA,TSLA,SPY

const FINNHUB_BASE = "https://finnhub.io/api/v1";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");

  if (!symbolsParam) {
    return Response.json(
      { error: "Missing 'symbols' query param, e.g. ?symbols=NVDA,TSLA" },
      { status: 400 }
    );
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Server misconfigured: FINNHUB_API_KEY not set" },
      { status: 500 }
    );
  }

  const symbols = symbolsParam
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 30); // safety cap per request

  try {
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const [quoteRes, profileRes] = await Promise.all([
          fetch(`${FINNHUB_BASE}/quote?symbol=${symbol}&token=${apiKey}`),
          fetch(`${FINNHUB_BASE}/stock/profile2?symbol=${symbol}&token=${apiKey}`),
        ]);

        if (!quoteRes.ok) {
          return { symbol, error: `Quote fetch failed (${quoteRes.status})` };
        }

        const quote = await quoteRes.json();
        const profile = profileRes.ok ? await profileRes.json() : {};

        // Finnhub quote fields: c=current, d=change, dp=percent change,
        // h=high, l=low, o=open, pc=previous close, t=timestamp
        return {
          symbol,
          price: quote.c ?? null,
          change: quote.d ?? null,
          changePercent: quote.dp ?? null,
          high: quote.h ?? null,
          low: quote.l ?? null,
          open: quote.o ?? null,
          previousClose: quote.pc ?? null,
          timestamp: quote.t ?? null,
          name: profile.name ?? symbol,
          marketCap: profile.marketCapitalization ?? null,
          exchange: profile.exchange ?? null,
        };
      })
    );

    return Response.json({ data: results, fetchedAt: Date.now() });
  } catch (err) {
    return Response.json(
      { error: "Failed to fetch quotes", detail: String(err) },
      { status: 502 }
    );
  }
}