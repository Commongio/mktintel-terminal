// app/api/news/route.js
// Fetches market news from Finnhub.
// Usage: /api/news                -> general market news
// Usage: /api/news?symbol=NVDA    -> company-specific news (last 7 days)

const FINNHUB_BASE = "https://finnhub.io/api/v1";

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const limit = Math.min(parseInt(searchParams.get("limit") || "15", 10), 50);

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Server misconfigured: FINNHUB_API_KEY not set" },
      { status: 500 }
    );
  }

  try {
    let url;
    if (symbol) {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 7);
      url = `${FINNHUB_BASE}/company-news?symbol=${symbol.toUpperCase()}&from=${formatDate(
        from
      )}&to=${formatDate(to)}&token=${apiKey}`;
    } else {
      url = `${FINNHUB_BASE}/news?category=general&token=${apiKey}`;
    }

    const res = await fetch(url);
    if (!res.ok) {
      return Response.json(
        { error: `News fetch failed (${res.status})` },
        { status: 502 }
      );
    }

    const raw = await res.json();

    const items = (Array.isArray(raw) ? raw : [])
      .slice(0, limit)
      .map((item) => ({
        id: item.id,
        headline: item.headline,
        summary: item.summary,
        source: item.source,
        url: item.url,
        image: item.image || null,
        datetime: item.datetime ? item.datetime * 1000 : null, // ms epoch
        related: item.related || symbol || null,
      }));

    return Response.json({ data: items, fetchedAt: Date.now() });
  } catch (err) {
    return Response.json(
      { error: "Failed to fetch news", detail: String(err) },
      { status: 502 }
    );
  }
}