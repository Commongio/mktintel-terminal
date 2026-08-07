// lib/rss.js — one RSS/Atom parser, shared.
//
// Extracted from app/api/twitter-rss/route.js, which had the only working
// parser in the codebase and kept it private to that route. The aggregator
// needs the same job done against fifteen more feeds, and a second copy would
// drift from the first.
//
// Regex, not a DOM parser. That is a deliberate trade: these are machine-
// generated feeds from a fixed set of publishers, the fields wanted are five
// scalars per item, and pulling in an XML dependency to read <title> is a poor
// bargain in a serverless function that has to cold-start. If a publisher ever
// ships genuinely malformed XML the parser degrades to "fewer items", which is
// the correct failure -- a strict parser would throw away the whole feed
// because one item had a stray ampersand.
//
// Handles RSS 2.0 (<item>) and Atom (<entry>) in one pass, because the source
// list mixes them and which one a publisher uses is not interesting.

const TAG = (block, name) => {
  // CDATA first: publishers wrap headlines in it precisely because they
  // contain the characters that would otherwise need escaping.
  const cdata = block.match(new RegExp(`<${name}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${name}>`, "i"));
  if (cdata) return cdata[1].trim();
  const plain = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return plain ? plain[1].trim() : "";
};

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Decode HTML entities in a SINGLE pass.
 *
 * Single-pass matters. An earlier version ran named entities first and numeric
 * ones second, which meant "&amp;#39;" decoded to an apostrophe -- the "&amp;"
 * became "&", and the second pass then read the "&#39;" it had just created.
 * Named entities came out single-decoded and numeric ones double-decoded, from
 * the same function.
 *
 * Decoding twice is how escaped markup stops being escaped, so the answer is
 * one pass rather than a cleverer ordering. A feed that double-escapes will
 * show a literal "&#39;" in a headline, which is a cosmetic flaw in a rare
 * case and much better than a decoder whose output depends on which entity
 * form the publisher happened to use.
 */
export function decode(s) {
  if (!s) return "";
  return String(s).replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (m, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      // Surrogates and out-of-range values would throw or produce garbage.
      if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return m;
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return NAMED[body.toLowerCase()] ?? m;   // unknown names pass through intact
  });
}

export const stripHtml = (s) => decode(String(s || "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

/**
 * Parse a feed body into raw items: { title, link, summary, ms }.
 *
 * `ms` is epoch milliseconds or null. Null is meaningful and is NOT replaced
 * with Date.now(): the aggregator's staleness check exists to catch feeds
 * serving year-old content, and defaulting a missing date to "now" would make
 * every dead feed look perfectly fresh. That is the exact bug this whole
 * module is defending against.
 */
export function parseFeed(xml) {
  const body = String(xml || "");
  const out = [];

  // Atom <entry> and RSS <item> are read with the same code. A feed containing
  // both is malformed, but taking whichever appears is still the right answer.
  const blocks = [
    ...body.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...body.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ];

  for (const [block] of blocks) {
    const title = stripHtml(TAG(block, "title"));

    // Atom puts the URL in an attribute, RSS in element text. Prefer a
    // rel="alternate" link; Atom feeds also carry rel="self" and rel="edit",
    // and picking the first href blind lands on the wrong one.
    let link = TAG(block, "link");
    if (!link || /^\s*$/.test(link)) {
      link = block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1]
          || block.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1]
          || "";
    }

    const summary = stripHtml(TAG(block, "description") || TAG(block, "summary") || TAG(block, "content"));

    const raw = TAG(block, "pubDate") || TAG(block, "published") || TAG(block, "updated") || TAG(block, "dc:date");
    const parsed = raw ? Date.parse(raw) : NaN;

    if (!title && !summary) continue;
    out.push({
      title: title || summary.slice(0, 140),
      link: decode(link),
      summary: summary.slice(0, 400),
      ms: Number.isFinite(parsed) ? parsed : null,
    });
  }
  return out;
}

/**
 * The newest timestamp in a parsed feed, or null if nothing carried a date.
 *
 * Read from the ITEMS only. Several publishers put a <pubDate> or <copyright>
 * year on the channel element itself, and a Business Wire error response --
 * which is well-formed RSS containing an apology and no items -- has a fresh
 * channel date. Reading the channel would have reported that feed as healthy.
 */
export function newestMs(items) {
  let best = null;
  for (const it of items) if (it.ms != null && (best == null || it.ms > best)) best = it.ms;
  return best;
}
