// app/api/news/route.js
// Fetches market news from Finnhub + mock Trump/Truth Social news.
// V10: every article ships with a market-impact rating (score/label/why).
import { scoreNewsImpact } from "../../../lib/newsImpact";
// Usage: /api/news                -> general market news
// Usage: /api/news?type=trump     -> Trump/Truth Social news (mocked)
// Usage: /api/news?symbol=NVDA    -> company-specific news (last 7 days)

const FINNHUB_BASE = "https://finnhub.io/api/v1";

// Mock Trump/Truth Social news (placeholder until we have a real API)
const TRUMP_NEWS_MOCKS = [
  {
    id: "trump-1",
    headline: "Trump Truth Social: 'Rebuilding American energy independence. Offshore drilling permits approved.'",
    source: "Truth Social",
    datetime: Date.now() - 300000,
    related: "XOM,COP,MPC",
  },
  {
    id: "trump-2",
    headline: "Trump tweet: 'EV tax credits under review. American auto manufacturing is key to competitiveness.'",
    source: "Truth Social",
    datetime: Date.now() - 600000,
    related: "TSLA,F,GM",
  },
  {
    id: "trump-3",
    headline: "Trump Truth Social: 'Rebuilding the greatest military ever. Defense spending to increase.'",
    source: "Truth Social",
    datetime: Date.now() - 900000,
    related: "LMT,RTX,BA,NOC",
  },
  {
    id: "trump-4",
    headline: "Trump post: 'Crypto is the future. Regulatory clarity coming soon.'",
    source: "Truth Social",
    datetime: Date.now() - 1200000,
    related: "MSTR,COIN,RIOT",
  },
];

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol");
  const type = searchParams.get("type");
  const limit = Math.min(parseInt(searchParams.get("limit") || "15", 10), 50);

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Server misconfigured: FINNHUB_API_KEY not set" },
      { status: 500 }
    );
  }

  try {
    // Trump/Truth Social news (mocked)
    if (type === "trump") {
      const items = TRUMP_NEWS_MOCKS.slice(0, limit).map((item) => ({
        id: item.id,
        headline: item.headline,
        source: item.source,
        datetime: item.datetime,
        related: item.related,
        summary: item.headline,
        url: null,
        image: null,
      }));
      return Response.json({ data: items, fetchedAt: Date.now() });
    }

    // General or company-specific news
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
      .map((item) => {
        const base = {
          id: item.id,
          headline: item.headline,
          summary: item.summary,
          source: item.source,
          url: item.url,
          image: item.image || null,
          datetime: item.datetime ? item.datetime * 1000 : null,
          related: item.related || symbol || null,
        };
        return { ...base, impact: scoreNewsImpact(base) };
      });

    return Response.json({ data: items, fetchedAt: Date.now() });
  } catch (err) {
    return Response.json(
      { error: "Failed to fetch news", detail: String(err) },
      { status: 502 }
    );
  }
}