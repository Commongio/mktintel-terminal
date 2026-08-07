/**
 * Every case in the classify() block is a real feed that was probed live and
 * behaved this way. They are written down as tests because each one returns
 * HTTP 200 and would otherwise be counted as a working source.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { parseFeed, newestMs, decode, stripHtml } from "./rss.js";
import { classify, cluster, clusterKey, aggregate, looksNonEnglish, _clearCache } from "./newsAggregator.js";
import { SOURCES, REJECTED, SOURCE_BY_ID } from "./newsSources.js";

const NOW = Date.parse("2026-08-07T15:00:00Z");
const src = (o = {}) => ({ id: "t", label: "T", kind: "market", maxAgeH: 6, ...o });
const item = (msAgo) => ({ title: "x", link: "", summary: "", ms: NOW - msAgo });

// ── rss parsing ─────────────────────────────────────────────────────────────

test("parses RSS 2.0 items", () => {
  const xml = `<rss><channel><item><title>Fed holds rates</title>
    <link>https://x.com/a</link><description>Body text</description>
    <pubDate>Fri, 07 Aug 2026 14:30:00 GMT</pubDate></item></channel></rss>`;
  const [it] = parseFeed(xml);
  assert.equal(it.title, "Fed holds rates");
  assert.equal(it.link, "https://x.com/a");
  assert.equal(it.ms, Date.parse("2026-08-07T14:30:00Z"));
});

test("parses Atom entries, and takes the alternate link not the self link", () => {
  const xml = `<feed><entry><title>8-K filed</title>
    <link rel="self" href="https://sec.gov/self"/>
    <link rel="alternate" href="https://sec.gov/real"/>
    <updated>2026-08-07T14:00:00Z</updated><summary>s</summary></entry></feed>`;
  const [it] = parseFeed(xml);
  assert.equal(it.title, "8-K filed");
  // Picking the first href blind lands on rel="self", which is the feed itself.
  assert.equal(it.link, "https://sec.gov/real");
});

test("unwraps CDATA and decodes entities", () => {
  const xml = `<rss><item><title><![CDATA[AT&T beats & raises]]></title>
    <description>Q3 &#39;beat&#39; &amp; raise, &lt;b&gt;strong&lt;/b&gt;</description></item></rss>`;
  const [it] = parseFeed(xml);
  assert.equal(it.title, "AT&T beats & raises");
  assert.match(it.summary, /'beat' & raise/);
});

test("decoding happens exactly once", () => {
  // Decoding twice is how escaped markup stops being escaped. "&amp;lt;" is an
  // author writing the literal text "&lt;" and must survive as that.
  assert.equal(decode("&amp;lt;"), "&lt;");
  assert.equal(decode("&amp;#39;"), "&#39;");
  assert.equal(decode("&lt;script&gt;"), "<script>");
  assert.equal(decode("&#8217;"), "’");
  assert.equal(decode("&#x27;"), "'");
  // An unknown entity is left alone rather than silently dropped.
  assert.equal(decode("&notarealentity;"), "&notarealentity;");
});

test("a missing date stays null and is never filled in with now()", () => {
  // The staleness check is the whole defence against feeds serving year-old
  // content. Defaulting a missing date to now() would make every dead feed
  // look perfectly fresh.
  const [it] = parseFeed(`<rss><item><title>t</title></item></rss>`);
  assert.equal(it.ms, null);
});

test("newestMs reads items only, never the channel", () => {
  // A Business Wire error response is well-formed RSS with a FRESH channel
  // date and no items. Reading the channel reports a dead feed as healthy.
  const xml = `<rss><channel><title>Business Wire</title>
    <pubDate>Fri, 07 Aug 2026 14:59:00 GMT</pubDate>
    <description>The channel you requested is unavailable.</description></channel></rss>`;
  assert.equal(newestMs(parseFeed(xml)), null);
});

test("stripHtml removes markup and collapses whitespace", () => {
  assert.equal(stripHtml("<p>a  <b>b</b></p>\n<i>c</i>"), "a b c");
});

// ── health classification: the five live 200-but-dead cases ─────────────────

test("CNBC: 200 with a zero-byte body is empty, not ok", () => {
  assert.equal(classify(src(), { httpStatus: 200, items: parseFeed(""), now: NOW }), "empty");
});

test("Business Wire: 200 with valid RSS and no items is empty", () => {
  const xml = `<rss><channel><description>unavailable due to an error</description></channel></rss>`;
  assert.equal(classify(src(), { httpStatus: 200, items: parseFeed(xml), now: NOW }), "empty");
});

test("MarketWatch realtime: 200, ten good items, fourteen months old is stale", () => {
  const items = Array.from({ length: 10 }, () => item(14 * 30 * 864e5));
  assert.equal(classify(src(), { httpStatus: 200, items, now: NOW }), "stale");
});

test("Investing.com: timestamps seven hours ahead are future, not fresh", () => {
  // Sorted by date these pin to the top of the timeline forever and read as
  // permanently breaking.
  assert.equal(classify(src(), { httpStatus: 200, items: [item(-7 * 3.6e6)], now: NOW }), "future");
});

test("Nasdaq: a hang is timeout, distinct from error", () => {
  assert.equal(classify(src(), { httpStatus: "timeout", items: [], now: NOW }), "timeout");
  assert.equal(classify(src(), { httpStatus: "error", items: [], now: NOW }), "error");
});

test("Treasury: a 404 keeps its status code", () => {
  assert.equal(classify(src(), { httpStatus: 404, items: [], now: NOW }), "http_404");
});

test("small clock skew is tolerated; publishers do get this slightly wrong", () => {
  assert.equal(classify(src(), { httpStatus: 200, items: [item(-30 * 60_000)], now: NOW }), "ok");
});

test("undated is its own verdict, neither ok nor discarded", () => {
  const items = [{ title: "t", link: "", summary: "", ms: null }];
  assert.equal(classify(src(), { httpStatus: 200, items, now: NOW }), "undated");
});

test("maxAgeH is per source: a quiet Fed is healthy, a quiet wire is not", () => {
  const tenDays = [item(10 * 864e5)];
  assert.equal(classify(src({ maxAgeH: 24 * 21 }), { httpStatus: 200, items: tenDays, now: NOW }), "ok");
  assert.equal(classify(src({ maxAgeH: 4 }), { httpStatus: 200, items: tenDays, now: NOW }), "stale");
});

// ── clustering ──────────────────────────────────────────────────────────────

const mk = (headline, source, minsAgo, url) =>
  ({ headline, source, url: url ?? `u/${source}/${minsAgo}`, datetime: NOW - minsAgo * 60_000 });

test("republications collapse, and the earliest publisher is kept as primary", () => {
  const out = cluster([
    mk("Acme Corp announces $2B buyback", "Yahoo", 8),
    mk("Acme Corp announces $2B buyback - MarketWatch", "MarketWatch", 6),
    mk("Acme Corp Announces $2B Buyback", "CNBC", 2),
  ]);
  assert.equal(out.length, 1);
  // Who published FIRST is the fact worth keeping; sorting by prestige loses it.
  assert.equal(out[0].source, "Yahoo");
  assert.equal(out[0].sourceCount, 3);
  assert.equal(out[0].spreadMinutes, 6);
  assert.deepEqual(out[0].alsoIn.map((a) => a.source), ["MarketWatch", "CNBC"]);
});

test("a lone item reports spreadMinutes null, not zero", () => {
  // "Nobody else carried it" and "everybody carried it instantly" are opposite
  // facts and must not collapse to the same number.
  const [only] = cluster([mk("Unique headline about widgets", "Yahoo", 5)]);
  assert.equal(only.sourceCount, 1);
  assert.equal(only.spreadMinutes, null);
});

test("different stories are not merged", () => {
  assert.equal(cluster([
    mk("Nvidia beats on earnings", "Yahoo", 5),
    mk("Tesla misses on deliveries", "CNBC", 4),
  ]).length, 2);
});

test("the same headline weeks apart is recurring news, not a republication", () => {
  const out = cluster([
    mk("Fed holds interest rates steady", "Reuters", 5),
    mk("Fed holds interest rates steady", "Reuters", 60 * 24 * 40),
  ]);
  assert.equal(out.length, 2);
});

test("publisher suffixes do not change identity", () => {
  assert.equal(clusterKey("Acme wins contract - Reuters"), clusterKey("Acme wins contract | MarketWatch"));
});

test("identical urls dedupe even when headlines were rewritten", () => {
  const out = cluster([
    mk("Original headline here now", "Yahoo", 5, "https://a/1"),
    mk("Completely different wording used", "Yahoo", 4, "https://a/1"),
  ]);
  assert.equal(out.length, 1);
});

// ── aggregate ───────────────────────────────────────────────────────────────

function stubFetcher(map) {
  return async (url) => {
    const key = Object.keys(map).find((k) => url.includes(k));
    const v = map[key];
    if (v === "timeout") { const e = new Error("aborted"); e.name = "TimeoutError"; throw e; }
    if (typeof v === "number") return { ok: false, status: v, text: async () => "" };
    return { ok: true, status: 200, text: async () => v ?? "" };
  };
}

test("aggregate reports failed sources rather than hiding them", async () => {
  _clearCache();
  const fresh = `<rss><item><title>Real market headline today</title><link>https://a/1</link>
    <pubDate>${new Date(NOW - 6e5).toUTCString()}</pubDate></item></rss>`;
  const res = await aggregate({ now: NOW, fetcher: stubFetcher({ "": fresh }) });

  assert.ok(res.items.length > 0);
  assert.equal(res.attempted, res.sources.length);
  // Every attempted source appears, healthy or not -- the denominator is the
  // whole point of returning this.
  assert.ok(res.sources.every((s) => typeof s.status === "string"));
});

test("aggregate flags degradation when most sources are down", async () => {
  _clearCache();
  const res = await aggregate({ now: NOW, fetcher: stubFetcher({ "": 503 }) });
  assert.equal(res.healthy, 0);
  assert.equal(res.degraded, true);
  assert.equal(res.items.length, 0);
  assert.ok(res.sources.every((s) => s.status === "http_503"));
});

test("a timed-out source does not take the others down with it", async () => {
  _clearCache();
  const fresh = `<rss><item><title>Wire story crossing right now</title><link>https://a/2</link>
    <pubDate>${new Date(NOW - 3e5).toUTCString()}</pubDate></item></rss>`;
  const res = await aggregate({ now: NOW, fetcher: stubFetcher({ "sec.gov": "timeout", "": fresh }) });
  assert.ok(res.healthy > 0);
  assert.ok(res.sources.some((s) => s.status === "timeout"));
});

test("symbol queries add the per-symbol source and tag items with it", async () => {
  _clearCache();
  const fresh = `<rss><item><title>NVDA guidance raised for the quarter</title><link>https://a/3</link>
    <pubDate>${new Date(NOW - 3e5).toUTCString()}</pubDate></item></rss>`;
  const res = await aggregate({ symbol: "NVDA", now: NOW, fetcher: stubFetcher({ "": fresh }) });
  assert.ok(res.sources.some((s) => s.id === "yahoo_symbol"));
  assert.ok(res.items.some((i) => i.related === "NVDA"));
});

test("kinds filter restricts the source set", async () => {
  _clearCache();
  const res = await aggregate({ kinds: ["wire"], now: NOW, fetcher: stubFetcher({ "": 500 }) });
  assert.ok(res.sources.length > 0);
  assert.ok(res.sources.every((s) => SOURCE_BY_ID[s.id].kind === "wire"));
});

// ── quality filters, all three found on the first live run ──────────────────

test("non-English headlines are dropped, English ones with accents are not", () => {
  // The first live run was led by a Danish small-cap buyback notice.
  assert.equal(looksNonEnglish("Iværksættelse af aktietilbagekøbsprogram"), true);
  assert.equal(looksNonEnglish("Übernahmeangebot für die Aktionäre der Gesellschaft"), true);

  // Must survive. Dropping real English news is much worse than letting a
  // foreign headline through, so these are the assertions that set the bar.
  // "Nestlé" alone is 2.2% of the letters in its headline -- a ratio test on
  // its own rejects it, which is why two non-ASCII letters are required.
  assert.equal(looksNonEnglish("Nestlé raises full-year guidance after strong quarter"), false);
  assert.equal(looksNonEnglish("Apple’s services revenue hits a record — again"), false);
  assert.equal(looksNonEnglish("Implementation of share buyback programme"), false);
  assert.equal(looksNonEnglish("Iværk"), false);   // too short to judge

  // The accepted cost, asserted so it is a known limit rather than a surprise:
  // a short foreign headline with a single diacritic gets through.
  assert.equal(looksNonEnglish("Aktietilbagekøbsprogram - afslutning"), false);
});

test("social sources are excluded unless explicitly requested", async () => {
  _clearCache();
  const off = await aggregate({ now: NOW, fetcher: stubFetcher({ "": 500 }) });
  assert.ok(!off.sources.some((s) => SOURCE_BY_ID[s.id].kind === "social"),
    "Reddit outranked two 8-K filings in the first live run; weight alone does not keep it out");
  const on = await aggregate({ kinds: ["social"], now: NOW, fetcher: stubFetcher({ "": 500 }) });
  assert.ok(on.sources.every((s) => SOURCE_BY_ID[s.id].kind === "social"));
});

test("impact sort outranks recency; sort=time keeps the raw chronology", async () => {
  _clearCache();
  const boring = `<rss><item><title>Routine share buyback programme update</title><link>https://a/b</link>
    <pubDate>${new Date(NOW - 6e4).toUTCString()}</pubDate></item></rss>`;
  const big = `<rss><item><title>Fed cuts rates in emergency FOMC decision</title><link>https://a/c</link>
    <pubDate>${new Date(NOW - 18e5).toUTCString()}</pubDate></item></rss>`;
  const f = stubFetcher({ "prnewswire": big, "": boring });

  const ranked = await aggregate({ now: NOW, sort: "impact", score: (it) => /fed cuts/i.test(it.headline) ? 90 : 10, fetcher: f });
  assert.match(ranked.items[0].headline, /Fed cuts/, "older but far more important item must rank first");

  _clearCache();
  const timed = await aggregate({ now: NOW, sort: "time", fetcher: f });
  assert.match(timed.items[0].headline, /buyback/, "sort=time must stay chronological");
});

// ── registry hygiene ────────────────────────────────────────────────────────

test("every source is well formed and ids are unique", () => {
  const ids = new Set();
  for (const s of SOURCES) {
    assert.ok(s.id && !ids.has(s.id), `duplicate or missing id: ${s.id}`);
    ids.add(s.id);
    assert.ok(s.label && s.kind, `${s.id} missing label/kind`);
    assert.ok(typeof s.maxAgeH === "number" && s.maxAgeH > 0, `${s.id} needs a maxAgeH`);
    assert.ok(["market", "wire", "filing", "macro", "social"].includes(s.kind), `${s.id} bad kind`);
    if (s.perSymbol) assert.equal(typeof s.url, "function", `${s.id} perSymbol needs a url function`);
    else assert.equal(typeof s.url, "string", `${s.id} needs a url string`);
  }
});

test("rejected sources record WHY, so nobody re-probes them by hand", () => {
  assert.ok(REJECTED.length > 0);
  for (const r of REJECTED) {
    assert.ok(r.id && r.why && r.why.length > 20, `${r.id} needs a real reason`);
    assert.equal(typeof r.retryable, "boolean");
  }
});

test("no rejected source is also registered as live", () => {
  for (const r of REJECTED) assert.ok(!SOURCE_BY_ID[r.id], `${r.id} is both rejected and live`);
});
