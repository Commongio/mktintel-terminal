// app/api/twitter-rss/route.js
// Fetches trading-relevant X/Twitter feeds via public Nitter RSS (no API key needed)
// Falls back through multiple Nitter instances for reliability

const NITTER_INSTANCES = [
  "https://nitter.privacydev.net",
  "https://nitter.poast.org",
  "https://nitter.1d4.us",
  "https://nitter.kavin.rocks",
];

// Key fintwit accounts — edit these to your preference
const DEFAULT_ACCOUNTS = [
  "unusual_whales",  // options flow alerts
  "DeItaone",        // breaking market news
  "StockMKTNewz",    // market news
  "zerohedge",       // macro/risk
  "realDonaldTrump", // political/market moves
];

async function fetchNitterRSS(instance, account) {
  const url = `${instance}/${account}/rss`;
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 Kronos/1.0" },
    signal: AbortSignal.timeout(4000),
  });
  if (!r.ok) throw new Error(`${instance} returned ${r.status}`);
  return r.text();
}

function parseRSS(xml, account) {
  const items = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const match of itemMatches) {
    const block = match[1];
    const title   = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/)?.[1]?.trim()
                 ?? block.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "";
    const link    = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? "";
    const desc    = block.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/)?.[1]
                 ?? block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "";

    // Strip HTML from description
    const cleanDesc = desc.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const headline  = title || cleanDesc.slice(0, 120);

    if (!headline) continue;
    items.push({
      account,
      headline: headline.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'"),
      summary:  cleanDesc.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&#39;/g,"'").slice(0, 280),
      url:      link,
      pubDate,
      timestamp: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      source:   `@${account}`,
      type:     "twitter",
    });
  }
  return items.slice(0, 5);
}

async function fetchAccountWithFallback(account) {
  for (const instance of NITTER_INSTANCES) {
    try {
      const xml   = await fetchNitterRSS(instance, account);
      const items = parseRSS(xml, account);
      if (items.length > 0) return items;
    } catch { /* try next instance */ }
  }
  return []; // all instances failed for this account
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const accounts = (searchParams.get("accounts") || DEFAULT_ACCOUNTS.join(","))
    .split(",").map(a => a.trim().replace(/^@/, "")).filter(Boolean).slice(0, 6);

  const results = await Promise.allSettled(accounts.map(fetchAccountWithFallback));

  const tweets = results
    .flatMap((r, i) => r.status === "fulfilled" ? r.value : [])
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const succeeded = results.filter(r => r.status === "fulfilled" && r.value.length > 0).length;

  return Response.json({
    tweets,
    total:      tweets.length,
    accounts:   accounts.length,
    succeeded,
    fetchedAt:  Date.now(),
    note: succeeded === 0
      ? "All Nitter instances unavailable. X/Twitter feed temporarily offline."
      : null,
  });
}