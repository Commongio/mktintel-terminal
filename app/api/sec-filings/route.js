// app/api/sec-filings/route.js
// Free SEC EDGAR data — no API key required, just a contact User-Agent.
// Returns recent filings + Form 4 insider trades for given tickers.

let tickerMapCache = null;

async function getTickerMap(userAgent) {
  if (tickerMapCache) return tickerMapCache;
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": userAgent },
  });
  if (!res.ok) throw new Error("Failed to load SEC ticker map");
  const raw = await res.json();
  const map = {};
  Object.values(raw).forEach((entry) => {
    map[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, "0");
  });
  tickerMapCache = map;
  return map;
}

const FORM_NAMES = {
  "10-K": "Annual Report",
  "10-Q": "Quarterly Report",
  "8-K": "Material Event",
  "4": "Insider Transaction",
  "13F-HR": "Institutional Holdings",
  "S-1": "Registration Statement",
  "DEF 14A": "Proxy Statement",
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbolsParam = searchParams.get("symbols");
  const userAgent = process.env.EDGAR_USER_AGENT || "TradingTerminal contact@example.com";

  if (!symbolsParam) {
    return Response.json({ error: "Missing 'symbols' query param" }, { status: 400 });
  }

  const symbols = symbolsParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean).slice(0, 12);

  try {
    const tickerMap = await getTickerMap(userAgent);
    const filings = [];
    const insiderTrades = [];

    await Promise.all(
      symbols.map(async (symbol) => {
        const cik = tickerMap[symbol];
        if (!cik) return;
        try {
          const res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
            headers: { "User-Agent": userAgent },
          });
          if (!res.ok) return;
          const data = await res.json();
          const recent = data.filings?.recent;
          if (!recent) return;

          const count = Math.min(recent.form?.length || 0, 6);
          for (let i = 0; i < count; i++) {
            const form = recent.form[i];
            const date = recent.filingDate[i];
            const accession = recent.accessionNumber[i].replace(/-/g, "");
            const doc = recent.primaryDocument[i];
            const url = `https://www.sec.gov/Archives/edgar/data/${parseInt(cik, 10)}/${accession}/${doc}`;
            const item = { symbol, form, date, url, formName: FORM_NAMES[form] || form };

            if (form === "4") {
              insiderTrades.push(item);
            } else {
              filings.push(item);
            }
          }
        } catch {
          // skip this symbol on error, don't fail the whole request
        }
      })
    );

    filings.sort((a, b) => (a.date < b.date ? 1 : -1));
    insiderTrades.sort((a, b) => (a.date < b.date ? 1 : -1));

    return Response.json({
      filings: filings.slice(0, 20),
      insiderTrades: insiderTrades.slice(0, 20),
      fetchedAt: Date.now(),
    });
  } catch (err) {
    return Response.json({ error: "Failed to fetch SEC data", detail: String(err) }, { status: 502 });
  }
}