// app/api/econ-calendar/route.js — V12: US economic "folder" calendar.
//
// SOURCE (Option A): FRED release-dates API — free, official (St. Louis Fed), and
// works natively from Vercel's datacenter IPs (unlike the FairEconomy/ForexFactory
// feed, which Cloudflare-blocks datacenter IPs). We fetch the upcoming US data-
// release schedule and assign red/amber impact via a hand-maintained map of the
// major market-movers. FOMC decisions aren't a FRED data-release, so they're
// supplemented from the Fed's published 2026 schedule.
//
// Each event links out to that day's page on ForexFactory's PUBLIC calendar
// (?day=mmmDD.YYYY, format verified) — a plain hyperlink to their site, NOT
// scraping/republishing their data, so it's clean on ToS.
//
// Needs a FREE FRED api key (fred.stlouisfed.org/docs/api/api_key.html) in
// FRED_API_KEY. Without it, the tab still shows FOMC (hardcoded) + an honest note.
const FRED = "https://api.stlouisfed.org/fred/releases/dates";

// release-name (from FRED) → { impact folder, display label }. Regex so minor
// name variations still match. red = high impact, amber = medium.
const IMPACT_MAP = [
  [/employment situation/i,                         "red",   "Nonfarm Payrolls"],
  [/consumer price index/i,                         "red",   "CPI"],
  [/gross domestic product/i,                       "red",   "GDP"],
  [/personal income and outlays/i,                  "amber", "PCE / Personal Income"],
  [/producer price index/i,                         "amber", "PPI"],
  [/(advance )?(monthly )?(sales for )?retail/i,    "amber", "Retail Sales"],
  [/unemployment insurance weekly claims/i,         "amber", "Jobless Claims"],
  [/job openings and labor turnover|jolts/i,        "amber", "JOLTS"],
  [/durable goods|manufacturers.{0,20}orders/i,     "amber", "Durable Goods"],
  [/new residential construction|housing starts/i,  "amber", "Housing Starts"],
  [/surveys of consumers|consumer sentiment/i,      "amber", "Consumer Sentiment"],
  [/consumer confidence/i,                          "amber", "Consumer Confidence"],
];
// Typical ET release time per label (FRED gives date only). A hint — the FF link
// carries the authoritative time.
const TYPICAL_TIME = {
  "Nonfarm Payrolls": "8:30a", "CPI": "8:30a", "PPI": "8:30a", "GDP": "8:30a",
  "PCE / Personal Income": "8:30a", "Retail Sales": "8:30a", "Jobless Claims": "8:30a",
  "Durable Goods": "8:30a", "JOLTS": "10:00a", "Housing Starts": "8:30a",
  "Consumer Sentiment": "10:00a", "Consumer Confidence": "10:00a",
};

// Fed's published 2026 FOMC decision days (announcement ~2:00pm ET). Red.
const FOMC_2026 = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09"];

const MON = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
// ForexFactory day-link: ?day=mmm{d}.{yyyy} (lowercase month, no leading zero). Verified.
function ffUrl(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `https://www.forexfactory.com/calendar?day=${MON[m - 1]}${d}.${y}`;
}
const iso = (dt) => dt.toISOString().slice(0, 10);

let CACHE = { rows: null, at: 0 };
const CACHE_TTL = 30 * 60_000;

export async function GET() {
  const now = Date.now();
  if (CACHE.rows && now - CACHE.at < CACHE_TTL) {
    return Response.json({ rows: CACHE.rows, source: "fred", cached: true });
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(today); end.setDate(end.getDate() + 21);
  const inWindow = (d) => d >= iso(today) && d <= iso(end);

  // FOMC first — always present even without a FRED key.
  const rows = FOMC_2026.filter(inWindow).map((d) => ({
    date: d, title: "FOMC Rate Decision", impact: "High", folder: "red", time: "2:00p", ffUrl: ffUrl(d),
  }));

  // Trim: a key pasted into an env var (esp. via a dashboard) often carries a
  // stray newline/space/quote — FRED then 400s with "api_key is not registered".
  const key = (process.env.FRED_API_KEY || "").trim().replace(/^["']|["']$/g, "");
  if (!key) {
    rows.sort(byDate);
    return Response.json({
      rows, source: "fomc-only",
      note: "Add a free FRED_API_KEY (fred.stlouisfed.org) to show the full US data-release calendar. Showing FOMC only for now.",
    });
  }
  // FRED keys are exactly 32 lowercase-alphanumeric chars. Fail fast with a clear
  // message instead of a raw 400 if the value is obviously the wrong string.
  if (!/^[a-z0-9]{32}$/.test(key)) {
    rows.sort(byDate);
    return Response.json({
      rows, source: "fomc-only",
      note: `FRED key looks malformed (must be 32 lowercase letters/numbers; got ${key.length} chars). Re-check the value in Vercel. Showing FOMC only.`,
    });
  }

  try {
    const url = `${FRED}?api_key=${key}&file_type=json&include_release_dates_with_no_data=true`
      + `&realtime_start=${iso(today)}&realtime_end=${iso(end)}&sort_order=asc&limit=1000`;
    const r = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) {
      // Surface FRED's real reason (e.g. "api_key is not registered") not just "400".
      let why = `HTTP ${r.status}`;
      try { const b = await r.json(); if (b?.error_message) why = b.error_message; } catch {}
      throw new Error(why);
    }
    const data = await r.json();
    const seen = new Set();
    for (const rd of data?.release_dates || []) {
      if (!inWindow(rd.date)) continue;
      const hit = IMPACT_MAP.find(([re]) => re.test(rd.release_name || ""));
      if (!hit) continue;
      const [, folder, label] = hit;
      const dedupe = `${rd.date}|${label}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      rows.push({
        date: rd.date, title: label, impact: folder === "red" ? "High" : "Medium",
        folder, time: TYPICAL_TIME[label] || "", ffUrl: ffUrl(rd.date),
      });
    }
    rows.sort(byDate);
    CACHE = { rows, at: now };
    return Response.json({ rows, source: "fred", cached: false });
  } catch (e) {
    // FRED failed — still serve FOMC (+ cache if we have a better one).
    if (CACHE.rows) return Response.json({ rows: CACHE.rows, source: "fred", cached: true, stale: true });
    rows.sort(byDate);
    return Response.json({ rows, source: "fomc-only", note: `FRED unavailable (${e.message}); showing FOMC only.` });
  }
}

function byDate(a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.folder === "red" ? -1 : 1); }
