// app/api/sec-filings/route.js
// Free SEC EDGAR data — no API key required, just a contact User-Agent.
// Returns recent filings + Form 4 insider trades for given tickers, each with a
// deterministic baseline impact rating (lib/filingImpact). The AI reasoning pass
// that refines those ratings lives in /api/filing-intel.
import { baselineFilingScore, ratingLabel } from "../../../lib/filingImpact";

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

// ── V10.5: Form 4 enrichment ──────────────────────────────────────────────────
// A Form 4 without its transaction code is close to useless: you cannot tell an
// open-market BUY (a real conviction signal) from a routine tax withholding. So we
// fetch the filing's XML and pull out what actually happened.
//
// Best-effort by design — SEC layouts vary and we are rate-limited, so on any
// failure we return the bare filing rather than failing the request.
const F4_CACHE = new Map(); // accession -> parsed detail (filings are immutable)

// EDGAR's `primaryDocument` for a Form 4 points at the XSL-RENDERED HTML view
// (".../xslF345X06/wk-form4_123.xml") — human-readable, but it contains no
// <transactionCode> tags. The machine-readable XML is the same file with the
// "xsl*/" path segment stripped. Fetching the rendered view and regexing it was
// silently returning "type not parsed" for every insider trade.
function rawForm4Url(url) {
  return url.replace(/\/xsl[^/]*\//i, "/");
}

async function enrichForm4(item, userAgent) {
  if (F4_CACHE.has(item.url)) return { ...item, ...F4_CACHE.get(item.url) };
  try {
    const res = await fetch(rawForm4Url(item.url), { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return item;
    const xml = await res.text();

    const pick = (tag) => {
      const m = xml.match(new RegExp(`<${tag}>\\s*(?:<value>)?\\s*([^<]+)`, "i"));
      return m ? m[1].trim() : null;
    };

    // Non-derivative transaction is the one that matters for open-market activity.
    const code = (xml.match(/<transactionCode>\s*([A-Z])\s*<\/transactionCode>/i) || [])[1] || null;
    const shares = parseFloat((xml.match(/<transactionShares>\s*<value>\s*([\d.]+)/i) || [])[1] || "0");
    const price = parseFloat((xml.match(/<transactionPricePerShare>\s*<value>\s*([\d.]+)/i) || [])[1] || "0");
    const acquiredDisposed = (xml.match(/<transactionAcquiredDisposedCode>\s*<value>\s*([AD])/i) || [])[1] || null;

    const detail = {
      txnCode: code,
      txnShares: shares || null,
      txnPrice: price || null,
      txnValue: shares && price ? Math.round(shares * price) : null,
      // A = acquired (bought/received), D = disposed (sold/given up)
      direction: acquiredDisposed === "A" ? "ACQUIRED" : acquiredDisposed === "D" ? "DISPOSED" : null,
      insiderName: pick("rptOwnerName"),
      isOfficer: /<isOfficer>\s*(?:1|true)/i.test(xml),
      isDirector: /<isDirector>\s*(?:1|true)/i.test(xml),
      officerTitle: pick("officerTitle"),
    };
    F4_CACHE.set(item.url, detail);
    return { ...item, ...detail };
  } catch {
    return item; // never let enrichment break the feed
  }
}

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

    // Enrich only the insider trades we'll actually show — each is an extra SEC
    // request, and EDGAR rate-limits (~10/s). Capped and run in parallel.
    const topInsiders = insiderTrades.slice(0, 12);
    const enriched = await Promise.all(topInsiders.map((t) => enrichForm4(t, userAgent)));

    // Score everything with the deterministic baseline. The AI reasoning pass
    // (/api/filing-intel) refines these client-side — it never blocks this fetch.
    const withBase = (arr) => arr.map((it) => {
      const { score, reasons } = baselineFilingScore(it);
      return { ...it, impact: { score, label: ratingLabel(score), explanation: reasons.slice(0, 3).join(" · "), source: "baseline" } };
    });

    return Response.json({
      filings: withBase(filings.slice(0, 20)),
      insiderTrades: withBase(enriched),
      fetchedAt: Date.now(),
    });
  } catch (err) {
    return Response.json({ error: "Failed to fetch SEC data", detail: String(err) }, { status: 502 });
  }
}