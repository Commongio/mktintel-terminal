// lib/newsSources.js — the source registry.
//
// Every entry here was probed live before it was written down. The ones that
// failed are recorded at the bottom WITH their failure mode, because the most
// expensive thing about this list is not finding sources, it is re-testing a
// source someone already found to be dead.
//
// ── WHY EACH ENTRY CARRIES A maxAgeH ────────────────────────────────────────
// Five of the feeds probed returned HTTP 200 and were still useless:
//
//   CNBC              200, content-type application/json, ZERO bytes
//   Business Wire     200, valid RSS, the error text inside <description>
//   MarketWatch rt    200, valid RSS, 10 items, newest ~14 MONTHS old
//   Investing.com     200, valid RSS, timestamps ~7 hours in the FUTURE
//   Nasdaq            connection accepted, then hangs past any timeout
//
// So `r.ok` is not evidence a feed works, and neither is "it parsed". A source
// is healthy only if it yields items AND the newest one is plausibly recent.
// `maxAgeH` is that threshold, per source, because a press-release wire going
// quiet for an hour is broken while the BLS going quiet for a week is Tuesday.
//
// ── LICENSING ───────────────────────────────────────────────────────────────
// Headline + link + short excerpt, attributed to the publisher, is what an RSS
// feed is published for. Do not store or display full article bodies from
// these; the feeds do not carry them and fetching the article page to get them
// is a different act with different terms.

/**
 * kind:
 *   market   broad market/company news
 *   wire     primary-source press releases (issuer-published, no editorial lag)
 *   filing   regulatory filings
 *   macro    central bank / statistical agency / policy
 *   social   retail sentiment
 *
 * weight: multiplies the impact score's source component. Primary sources beat
 * aggregators reporting on them, and social is discounted hard.
 *
 * perSymbol: url is a function of a ticker rather than a constant.
 */
export const SOURCES = [
  // ── per-symbol ────────────────────────────────────────────────────────────
  // The most valuable entry in the list. catalyst.js currently gets company
  // news from Finnhub alone, so per-symbol coverage is capped by one free
  // tier; this has no key and no published quota.
  {
    id: "yahoo_symbol", label: "Yahoo Finance", kind: "market", weight: 1.0,
    perSymbol: true, maxAgeH: 72, timeout: 6000,
    url: (s) => `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(s)}&region=US&lang=en-US`,
  },

  // ── market ────────────────────────────────────────────────────────────────
  { id: "yahoo_market", label: "Yahoo Finance", kind: "market", weight: 1.0, maxAgeH: 6, timeout: 6000,
    url: "https://finance.yahoo.com/news/rssindex" },
  { id: "mw_top", label: "MarketWatch", kind: "market", weight: 1.1, maxAgeH: 6, timeout: 6000,
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories" },
  // Breaking-only, and it stays that way: a handful of items a day. The one to
  // reach for when the question is "is anything happening right now".
  { id: "mw_bulletins", label: "MarketWatch", kind: "market", weight: 1.2, maxAgeH: 24, timeout: 6000,
    url: "https://feeds.content.dowjones.io/public/rss/mw_bulletins" },
  { id: "seeking_alpha", label: "Seeking Alpha", kind: "market", weight: 0.9, maxAgeH: 6, timeout: 6000,
    url: "https://seekingalpha.com/feed.xml" },

  // ── wires: primary sources ────────────────────────────────────────────────
  // These carry the issuer's own words with no editorial delay, which is why
  // they weigh more than an outlet writing about them twenty minutes later.
  { id: "prnewswire", label: "PR Newswire", kind: "wire", weight: 1.3, maxAgeH: 4, timeout: 8000,
    url: "https://www.prnewswire.com/rss/financial-services-latest-news/financial-services-latest-news-list.rss" },
  // Weighted BELOW PR Newswire despite being the same class of source. Its
  // "public companies" feed is global, and in practice a large share of it is
  // Nordic and French small-cap regulatory filler -- share-buyback notices
  // that are legally required and market-irrelevant to a US equities desk.
  // Non-English items are dropped by the aggregator; English-language releases
  // from non-US issuers still come through, which is a judgement call left
  // open rather than hard-coded.
  { id: "globenewswire", label: "GlobeNewswire", kind: "wire", weight: 1.0, maxAgeH: 4, timeout: 8000,
    url: "https://www.globenewswire.com/RssFeed/orgclass/1/feedTitle/GlobeNewswire%20-%20News%20about%20Public%20Companies" },

  // ── filings ───────────────────────────────────────────────────────────────
  // 8-K is the material-event filing: the thing a company is legally required
  // to disclose promptly. Newest item was zero minutes old when probed.
  //
  // It is also the slowest source by an order of magnitude -- 10.2 SECONDS
  // against ~300ms for everything else -- so it gets a long timeout, a long
  // cache, and it must never be on the critical path of a page render.
  { id: "sec_8k", label: "SEC EDGAR", kind: "filing", weight: 1.4, maxAgeH: 24, timeout: 14000, ttlMs: 300_000,
    url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=40&output=atom" },
  { id: "sec_press", label: "SEC", kind: "filing", weight: 1.2, maxAgeH: 24 * 14, timeout: 8000,
    url: "https://www.sec.gov/news/pressreleases.rss" },

  // ── macro ─────────────────────────────────────────────────────────────────
  // Long maxAgeH by design. These are quiet for days and that is correct
  // behaviour, not an outage -- the Fed does not publish on a schedule that
  // suits a health check.
  { id: "fed_all", label: "Federal Reserve", kind: "macro", weight: 1.4, maxAgeH: 24 * 21, timeout: 8000,
    url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { id: "fed_monetary", label: "Federal Reserve", kind: "macro", weight: 1.5, maxAgeH: 24 * 60, timeout: 8000,
    url: "https://www.federalreserve.gov/feeds/press_monetary.xml" },
  { id: "bls", label: "BLS", kind: "macro", weight: 1.3, maxAgeH: 24 * 21, timeout: 8000,
    url: "https://www.bls.gov/feed/bls_latest.rss" },
  { id: "fda_press", label: "FDA", kind: "macro", weight: 1.2, maxAgeH: 24 * 14, timeout: 8000,
    url: "https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml" },
  // JSON, not RSS -- a real documented API with no key. Handled by its own
  // adapter in the aggregator rather than being forced through parseFeed.
  { id: "fed_register", label: "Federal Register", kind: "macro", weight: 1.1, maxAgeH: 24 * 7, timeout: 8000,
    json: true, url: "https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&fields[]=title&fields[]=html_url&fields[]=publication_date&fields[]=abstract" },

  // ── social ────────────────────────────────────────────────────────────────
  // Discounted hard: this is a sentiment input, not a news input. Reddit rate-
  // limits aggressively -- r/wallstreetbets returned 429 in the same sweep
  // that r/stocks returned 200 -- so it is cached longer than everything else
  // and its failures are expected rather than alarming.
  { id: "reddit_stocks", label: "r/stocks", kind: "social", weight: 0.4, maxAgeH: 12, timeout: 6000, ttlMs: 600_000,
    url: "https://www.reddit.com/r/stocks/new/.rss" },
  { id: "reddit_investing", label: "r/investing", kind: "social", weight: 0.4, maxAgeH: 24, timeout: 6000, ttlMs: 600_000,
    url: "https://www.reddit.com/r/investing/new/.rss" },
];

/**
 * Probed and rejected. Kept so the next person to go looking does not spend an
 * afternoon rediscovering that CNBC returns an empty 200.
 *
 * `retryable` marks the ones worth re-probing occasionally -- a bot block or a
 * moved URL can come back, whereas a shut-down service will not.
 */
export const REJECTED = [
  { id: "cnbc_top",    why: "HTTP 200, content-type application/json, zero-byte body. Both CNBC feed ids.", retryable: true },
  { id: "businesswire", why: "HTTP 200 and valid RSS, but the body is an error notice with no items.", retryable: true },
  { id: "mw_realtime", why: "HTTP 200, 10 well-formed items, newest ~14 months old. Dead feed, live cache.", retryable: false },
  // Registered as live at first: it returns 30 well-formed items with entirely
  // plausible headlines ("Jobless claims fall to lowest level since mid-May").
  // The staleness check found it on the first real run -- newest item 9,606
  // hours old. Two of the three Dow Jones feeds are abandoned this way, which
  // is the clearest argument available for checking dates rather than counts.
  { id: "mw_pulse", why: "HTTP 200, 30 plausible items, newest ~13 months old. Abandoned like mw_realtime.", retryable: false },
  { id: "nasdaq",      why: "Connection accepted then hangs; timed out at 12s on every attempt. Bot-blocked.", retryable: true },
  { id: "treasury",    why: "404 on both documented feed paths.", retryable: true },
  { id: "reuters",     why: "Public RSS discontinued; DNS no longer resolves for feeds.reuters.com.", retryable: false },
  { id: "investing",   why: "Works, but timestamps run ~7h in the FUTURE and the ToS restricts reuse.", retryable: false },
  { id: "nitter",      why: "Every instance dead (DNS failure / 403). Public Nitter network shut down.", retryable: false },
];

export const SOURCE_BY_ID = Object.fromEntries(SOURCES.map((s) => [s.id, s]));
export const MARKET_SOURCES = SOURCES.filter((s) => !s.perSymbol);
export const SYMBOL_SOURCES = SOURCES.filter((s) => s.perSymbol);
