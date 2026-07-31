/**
 * Market context, captured at decision time.
 *
 * WHY THIS MUST HAPPEN HERE. The Lab could compute all of it after the fact,
 * and that is precisely why it must not: looking up what VIX was when a past
 * signal fired attaches knowledge to a decision that did not have it. Every
 * value below is read at the moment the engine decides, or it is null forever.
 *
 * SAFETY. Same contract as labEmitter: nothing here throws into the signal
 * path, nothing blocks generation, and every function returns a partial or
 * empty result rather than failing. A missing regime costs one column of
 * analysis; a regime lookup that breaks signal generation costs the product.
 */

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * US equity session from a timestamp. Cheapest regime variable and probably the
 * most explanatory: a 15-minute futures signal at 04:00 is not the same
 * instrument as the same signal at 10:30.
 *
 * Uses America/New_York via Intl rather than a UTC offset, so it stays correct
 * across DST without a table of transition dates.
 */
export function sessionOf(when = new Date()) {
  let h, m, weekday;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hour: "2-digit", minute: "2-digit",
      weekday: "short", hour12: false,
    }).formatToParts(when);
    const get = (t) => parts.find((p) => p.type === t)?.value;
    h = Number(get("hour"));
    m = Number(get("minute"));
    weekday = get("weekday");
  } catch {
    return { session: null, minutes_from_open: null };
  }

  if (weekday === "Sat" || weekday === "Sun") return { session: "closed", minutes_from_open: null };

  const mins = h * 60 + m;
  const open = 9 * 60 + 30;
  const close = 16 * 60;

  const session = mins < 4 * 60 ? "closed"
    : mins < open ? "pre"
    : mins < close ? "regular"
    : mins < 20 * 60 ? "after"
    : "closed";

  // Negative before the open and positive after it, on purpose: "40 minutes
  // before the bell" and "40 minutes after" are different regimes and
  // clamping both to zero would merge them.
  return { session, minutes_from_open: session === "closed" ? null : mins - open };
}

// One fetch per scan batch, not per signal. A 40-symbol scan would otherwise
// make 80 redundant quote calls for two values that change slowly.
let _cache = { at: 0, value: null };
const CACHE_MS = 120_000;

/**
 * VIX level and SPY trend. Returns nulls rather than throwing when the quote
 * feed is unavailable -- the Lab distinguishes "calm market" from "nobody
 * looked" via regime_missing, so a null here stays honest.
 */
export async function marketContext() {
  if (_cache.value && Date.now() - _cache.at < CACHE_MS) return _cache.value;

  const empty = { vix_level: null, vix_change_1d: null, spy_trend_20d: null };
  let value = empty;
  try {
    // Imported here rather than at the top so the pure functions in this file
    // -- sessionOf, instrumentRegime -- can be tested and used without pulling
    // in the market-data layer. It also keeps the extensionless module
    // specifier out of the import graph, which bare Node cannot resolve.
    const { getQuotes } = await import("./marketData");
    const { data } = await getQuotes(["^VIX", "SPY"]);
    const by = new Map((data ?? []).map((q) => [q.symbol, q]));
    const vix = by.get("^VIX");
    const spy = by.get("SPY");
    value = {
      vix_level: isNum(vix?.price) ? Number(vix.price.toFixed(2)) : null,
      // Percent change on the day, as the feed reports it.
      vix_change_1d: isNum(vix?.changePercent) ? Number(vix.changePercent.toFixed(2)) : null,
      spy_trend_20d: isNum(spy?.changePercent) ? Number(spy.changePercent.toFixed(2)) : null,
    };
  } catch {
    value = empty;
  }

  _cache = { at: Date.now(), value };
  return value;
}

/**
 * Volatility and liquidity of the instrument itself, from the candles the
 * engine already fetched. No extra request, and no possibility of reading a
 * different window than the one the decision was made on.
 */
export function instrumentRegime(candles) {
  if (!Array.isArray(candles) || candles.length < 21) {
    return { atr_pct: null, dollar_volume_rel: null };
  }
  try {
    const recent = candles.slice(-21);

    // True range, averaged, as a percentage of price -- comparable across
    // symbols in a way a raw ATR is not.
    let trSum = 0, n = 0;
    for (let i = 1; i < recent.length; i++) {
      const c = recent[i], p = recent[i - 1];
      if (!isNum(c.high) || !isNum(c.low) || !isNum(p.close)) continue;
      trSum += Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
      n++;
    }
    const last = recent.at(-1);
    const atr_pct = n > 0 && isNum(last?.close) && last.close !== 0
      ? Number(((trSum / n) / last.close * 100).toFixed(4)) : null;

    // Dollar volume against its own 20-bar average: liquidity, in the only
    // form available without order-book data.
    const dv = recent.map((c) => (isNum(c.volume) && isNum(c.close) ? c.volume * c.close : null))
      .filter(isNum);
    let dollar_volume_rel = null;
    if (dv.length >= 5) {
      const prior = dv.slice(0, -1);
      const avg = prior.reduce((a, b) => a + b, 0) / prior.length;
      if (avg > 0) dollar_volume_rel = Number((dv.at(-1) / avg).toFixed(3));
    }

    return { atr_pct, dollar_volume_rel };
  } catch {
    return { atr_pct: null, dollar_volume_rel: null };
  }
}

/**
 * Everything, assembled.
 *
 * `instrument` is signalEngine's own regime block, computed from the candles it
 * already had -- so it can never describe a different window than the one the
 * decision was made on. `market` comes from marketContext(), fetched once per
 * batch.
 *
 * Named marketCONTEXT, not marketRegime: the cron already imports a
 * marketRegime from the chop halt, and two different things under one name in
 * one file is a bug waiting for whoever edits it next.
 */
export function buildRegime(instrument, market, when = new Date()) {
  return {
    ...sessionOf(when),
    atr_pct: instrument?.atr_pct ?? null,
    dollar_volume_rel: instrument?.dollar_volume_rel ?? null,
    vix_level: market?.vix_level ?? null,
    vix_change_1d: market?.vix_change_1d ?? null,
    spy_trend_20d: market?.spy_trend_20d ?? null,
    captured_at: new Date(when).toISOString(),
  };
}
