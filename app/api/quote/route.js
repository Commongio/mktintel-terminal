// app/api/quote/route.js
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
    .slice(0, 60);

  try {
    const results = await Promise.all(
      symbols.map(async (symbol) => {
        const res = await fetch(`${FINNHUB_BASE}/quote?symbol=${symbol}&token=${apiKey}`);
        if (!res.ok) {
          return { symbol, error: `Quote fetch failed (${res.status})` };
        }
        const quote = await res.json();
        if (quote.c === 0 && quote.pc === 0) {
          return { symbol, error: "No data for this symbol" };
        }
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