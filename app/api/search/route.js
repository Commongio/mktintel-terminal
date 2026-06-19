// app/api/search/route.js
const FINNHUB_BASE = "https://finnhub.io/api/v1";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q");

  if (!q || !q.trim()) {
    return Response.json({ data: [] });
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Server misconfigured: FINNHUB_API_KEY not set" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `${FINNHUB_BASE}/search?q=${encodeURIComponent(q.trim())}&token=${apiKey}`
    );
    if (!res.ok) {
      return Response.json({ error: `Search failed (${res.status})` }, { status: 502 });
    }
    const raw = await res.json();
    const results = (raw.result || [])
      .filter((r) => !r.symbol.includes(".") || r.symbol.endsWith(".US"))
      .slice(0, 15)
      .map((r) => ({
        symbol: r.symbol.replace(".US", ""),
        name: r.description,
        type: r.type,
      }));

    return Response.json({ data: results, fetchedAt: Date.now() });
  } catch (err) {
    return Response.json(
      { error: "Failed to search symbols", detail: String(err) },
      { status: 502 }
    );
  }
}