// lib/newsAggregator.js — many feeds in, one timeline out.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
// It is not a scoring engine. scoreNewsImpact and newsIntelligence.interrogate
// already do that, deterministically, and this feeds them rather than
// competing with them. Everything here emits the SAME normalized item shape
// /api/news already returns -- { id, headline, summary, source, url, image,
// datetime, related } -- so existing consumers take aggregated items without
// knowing anything changed.
//
// ── HEALTH IS THE POINT ─────────────────────────────────────────────────────
// A live probe of 32 endpoints found five that return HTTP 200 and are still
// dead: an empty body, an error notice wrapped in valid RSS, a feed whose
// newest item is fourteen months old, timestamps seven hours in the future,
// and one that accepts the connection then hangs.
//
// A try/catch would have marked all five healthy. So every fetch here is
// classified, not just caught, and the classification is returned to the
// caller alongside the items. A source that contributes nothing must SAY it
// contributes nothing -- the alternative is a pipeline that quietly runs on
// four of its sixteen sources and reports success, which is a failure mode
// this codebase has already paid for more than once.
//
// ── CLUSTERING ──────────────────────────────────────────────────────────────
// Minimal, and included because it is load-bearing rather than a feature: the
// moment a wire, an aggregator and two outlets all carry the same press
// release, an un-clustered timeline shows the same event four times and any
// count taken over it is really a measure of republication. Grouping is by
// normalized headline within a time window. It is deliberately conservative --
// it will miss rewrites, and missing a duplicate is much cheaper than merging
// two genuinely different stories.

import { parseFeed, newestMs, stripHtml } from "./rss.js";
import { MARKET_SOURCES, SYMBOL_SOURCES, SOURCE_BY_ID } from "./newsSources.js";

const UA = "Mozilla/5.0 (compatible; KronosTerminal/1.0; +https://kronoslab.online)";
const DEFAULT_TTL = 120_000;
const MINUTE = 60_000;

// Clock skew tolerance. Publishers do get this wrong -- one probed feed ran
// seven hours ahead -- and an item dated in the future would otherwise sort to
// the top of the timeline forever and read as permanently "breaking".
const FUTURE_TOLERANCE_MS = 90 * MINUTE;

const cache = new Map();

/** Health verdict for one fetch. `ok` is the only value that contributes items. */
export function classify(src, { httpStatus, items, now = Date.now() }) {
  if (httpStatus === "timeout") return "timeout";
  if (httpStatus === "error") return "error";
  if (typeof httpStatus === "number" && httpStatus >= 400) return `http_${httpStatus}`;
  // The Business Wire and CNBC cases: a 200 that parsed to nothing.
  if (!items || items.length === 0) return "empty";

  const newest = newestMs(items);
  // No dates at all. Cannot be checked for staleness, so it is not trusted as
  // fresh -- but it is not discarded either, since a few macro feeds are
  // legitimately undated. The caller sees the distinction.
  if (newest == null) return "undated";
  if (newest - now > FUTURE_TOLERANCE_MS) return "future";
  const maxAge = (src.maxAgeH ?? 24) * 3.6e6;
  if (now - newest > maxAge) return "stale";
  return "ok";
}

async function fetchOne(src, { symbol = null, now = Date.now(), fetcher = fetch } = {}) {
  const url = typeof src.url === "function" ? src.url(symbol) : src.url;
  const key = `${src.id}:${symbol || ""}`;
  const ttl = src.ttlMs ?? DEFAULT_TTL;

  const hit = cache.get(key);
  if (hit && now - hit.at < ttl) return { ...hit.value, cached: true };

  let httpStatus = "error";
  let items = [];
  const t0 = Date.now();
  try {
    const r = await fetcher(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, application/json, */*" },
      signal: AbortSignal.timeout(src.timeout ?? 8000),
    });
    httpStatus = r.status;
    if (r.ok) {
      const body = await r.text();
      items = src.json ? parseJsonFeed(body) : parseFeed(body);
    }
  } catch (e) {
    httpStatus = /abort|timeout/i.test(String(e?.name) + String(e?.message)) ? "timeout" : "error";
  }

  const status = classify(src, { httpStatus, items, now });
  const value = {
    id: src.id, label: src.label, kind: src.kind, status,
    count: items.length,
    newestMs: newestMs(items),
    ms: Date.now() - t0,
    items: status === "ok" || status === "undated" ? items : [],
  };
  cache.set(key, { at: now, value });
  return { ...value, cached: false };
}

/** Federal Register speaks JSON. One adapter beats bending it into XML. */
function parseJsonFeed(body) {
  try {
    const j = JSON.parse(body);
    return (j.results || []).map((d) => ({
      title: stripHtml(d.title),
      link: d.html_url || "",
      summary: stripHtml(d.abstract || "").slice(0, 400),
      // Date-only, so it lands at UTC midnight. Treated as a real timestamp
      // because for a policy document the day IS the resolution.
      ms: d.publication_date ? Date.parse(d.publication_date + "T12:00:00Z") : null,
    }));
  } catch { return []; }
}

// Words carrying no identity. Kept short on purpose: an aggressive stoplist
// starts merging different stories about the same company.
const STOP = new Set(["the","a","an","and","or","of","in","on","for","to","as","at","by","with","its","is","are","be","after","from","that","this","says","said","amid","over","new"]);

/**
 * Identity key for duplicate detection. Publisher suffixes are stripped first
 * -- "... - Reuters" and "... | MarketWatch" are the same headline.
 */
export function clusterKey(headline) {
  return String(headline || "")
    .replace(/\s+[-|–—]\s+[A-Za-z .]{2,30}$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .slice(0, 9)
    .join(" ");
}

const CLUSTER_WINDOW_MS = 18 * 3.6e6;

/**
 * Group republications. The primary is the EARLIEST item, not the highest
 * weighted -- who published first is the fact worth keeping, and a wire
 * beating an outlet by twenty minutes is exactly the signal that gets lost
 * when a timeline is sorted by source prestige.
 */
export function cluster(items) {
  const byUrl = new Map();
  for (const it of items) if (it.url && !byUrl.has(it.url)) byUrl.set(it.url, it);
  const unique = byUrl.size ? [...byUrl.values(), ...items.filter((i) => !i.url)] : items;

  const groups = new Map();
  for (const it of unique) {
    const k = clusterKey(it.headline);
    if (!k) { groups.set(Symbol(), [it]); continue; }
    const existing = groups.get(k);
    // Same words, but weeks apart, is a recurring headline ("Fed holds rates")
    // rather than a republication.
    if (existing && Math.abs((it.datetime ?? 0) - (existing[0].datetime ?? 0)) > CLUSTER_WINDOW_MS) {
      groups.set(k + "#" + (it.datetime ?? 0), [it]);
      continue;
    }
    if (existing) existing.push(it); else groups.set(k, [it]);
  }

  const out = [];
  for (const group of groups.values()) {
    group.sort((a, b) => (a.datetime ?? Infinity) - (b.datetime ?? Infinity));
    const primary = group[0];
    const others = group.slice(1);
    out.push({
      ...primary,
      sourceCount: group.length,
      // How fast it spread, in minutes. Only meaningful with a follower, and
      // null rather than 0 when there is none -- "nobody else carried it" and
      // "everybody carried it instantly" must not collapse to the same number.
      spreadMinutes: others.length && primary.datetime && others.at(-1).datetime
        ? Math.round((others.at(-1).datetime - primary.datetime) / MINUTE) : null,
      alsoIn: others.map((o) => ({ source: o.source, url: o.url })),
    });
  }
  return out.sort((a, b) => (b.datetime ?? 0) - (a.datetime ?? 0));
}

/**
 * Drop headlines that are not in English.
 *
 * GlobeNewswire's public-companies feed is global, and the first live run came
 * back led by "Iværksættelse af aktietilbagekøbsprogram" -- a Danish small-cap
 * buyback notice, legally required and irrelevant to a US desk.
 *
 * DELIBERATELY CONSERVATIVE, and biased in one direction: dropping a real
 * English story is far worse than letting a foreign one through, so the test
 * has to clear two bars -- at least TWO non-ASCII letters and more than 2% of
 * the letters overall.
 *
 * The count bar is the one that matters. A ratio alone rejects "Nestlé raises
 * full-year guidance": one accent in a 46-letter headline is already 2.2%, and
 * headlines are short enough that a single accented surname looks statistically
 * like a foreign language. No headline is foreign on the evidence of one
 * character.
 *
 * The known cost, stated rather than hidden: a short foreign headline carrying
 * only one diacritic -- "Aktietilbagekøbsprogram - afslutning" -- passes
 * through. That is the accepted side of the trade.
 *
 * Punctuation and digits are not counted, so a curly quote or an em-dash
 * cannot trip it. And an English-language release from a French issuer reads
 * as English and comes through, correctly: whether a US desk wants foreign
 * issuers at all is a filtering question, not a language one.
 */
export function looksNonEnglish(text) {
  const s = String(text || "");
  let letters = 0, foreign = 0;
  for (const ch of s) {
    if (/\p{L}/u.test(ch)) {
      letters++;
      if (ch.charCodeAt(0) > 127) foreign++;
    }
  }
  if (letters < 12) return false;   // too short to judge
  return foreign >= 2 && foreign / letters > 0.02;
}

function normalize(raw, src, symbol) {
  return {
    // Stable across refetches: the same story from the same feed keeps its id,
    // so a client can diff two polls without everything appearing to be new.
    id: `${src.id}:${hash(raw.link || raw.title)}`,
    headline: raw.title,
    summary: raw.summary || raw.title,
    source: src.label,
    sourceId: src.id,
    kind: src.kind,
    weight: src.weight ?? 1,
    url: raw.link || null,
    image: null,
    datetime: raw.ms,
    related: symbol || null,
  };
}

function hash(s) {
  let h = 5381;
  for (let i = 0; i < String(s).length; i++) h = ((h << 5) + h + String(s).charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Fetch every applicable source in parallel, normalize, cluster, sort.
 *
 * Returns `sources` alongside `items` and always reports every source that was
 * attempted, including the ones that failed. A caller that wants to know
 * whether the feed is trustworthy needs the denominator, not just the items.
 */
export async function aggregate({ symbol = null, kinds = null, limit = 60, sort = "impact", score = null, now = Date.now(), fetcher = fetch } = {}) {
  // Social is OFF unless asked for. The first live run put "Backdoor Roth IRA
  // question" in the timeline above two 8-K filings -- Reddit is a sentiment
  // input, and a low weight scales its score without keeping it out of a feed
  // that is supposed to be news. Kind is the right lever, not weight.
  const wanted = kinds?.length ? kinds : ["market", "wire", "filing", "macro"];
  let list = symbol ? [...SYMBOL_SOURCES, ...MARKET_SOURCES] : MARKET_SOURCES;
  list = list.filter((s) => wanted.includes(s.kind));

  const results = await Promise.all(list.map((s) => fetchOne(s, { symbol, now, fetcher })));

  const items = [];
  let dropped = 0;
  for (const r of results) {
    const src = SOURCE_BY_ID[r.id];
    for (const raw of r.items) {
      if (looksNonEnglish(raw.title)) { dropped++; continue; }
      items.push(normalize(raw, src, src.perSymbol ? symbol : null));
    }
  }

  let clustered = cluster(items);
  const healthy = results.filter((r) => r.status === "ok").length;

  // Recency alone ranks by how often a publisher posts, not by what matters --
  // it filled the first live timeline with buyback notices and earnings-call
  // boilerplate while 8-K filings sat below them. Impact ordering uses the
  // existing scorer (which already decays with age, so recency is still in
  // there) times the source weight. `sort=time` keeps the raw chronology for
  // anyone who wants a tape rather than a ranking.
  if (sort === "impact" && typeof score === "function") {
    clustered = clustered
      .map((it) => ({ it, s: score(it) * (it.weight ?? 1) }))
      .sort((a, b) => b.s - a.s || (b.it.datetime ?? 0) - (a.it.datetime ?? 0))
      .map((x) => x.it);
  }

  return {
    items: clustered.slice(0, limit),
    droppedNonEnglish: dropped,
    sources: results.map(({ items: _drop, ...rest }) => rest),
    healthy,
    attempted: results.length,
    // Stated rather than implied. If two of sixteen sources answered, the
    // caller should be able to see that without counting.
    degraded: healthy < Math.ceil(results.length / 2),
    fetchedAt: now,
  };
}

/** Test seam: the module-level cache would otherwise leak between cases. */
export function _clearCache() { cache.clear(); }
