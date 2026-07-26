// lib/alertPrefs.js — V14.5 alert + universe filtering preferences.
//
// ONE module owns the shape, the defaults, and the matching logic, because these
// preferences are enforced in three places that must never disagree:
//   1. the ALERTS tab UI (what the user picks),
//   2. the signal feed (which signals they SEE),
//   3. lib/push.js (which signals actually reach their phone).
// If the feed and the push filter drifted apart, a user would get pushed a
// signal they can't find in the app — the worst possible failure for a signals
// product. Pure and dependency-free so the same code runs on both sides.

// ── SIDES ────────────────────────────────────────────────────────────────────
// Matches the asset_class values used everywhere else (DB, engine, universe).
export const SIDES = [
  { id: "futures", label: "Futures", hint: "Intraday LONG / SHORT" },
  { id: "options", label: "Options", hint: "Short-dated CALLS / PUTS" },
  { id: "equity",  label: "Invest",  hint: "Long-term BUY / HOLD / SELL" },
];
export const SIDE_IDS = SIDES.map((s) => s.id);

// ── TIMEFRAMES ───────────────────────────────────────────────────────────────
// Keyed by the HORIZON bucket, not the raw interval, because that's the
// vocabulary the Trading tab's interval buttons already show the user
// ("15min / INTRADAY"). INTERVAL_HORIZON in BotDashboard maps the same way.
export const TIMEFRAMES = [
  { id: "SCALP",    label: "Scalp",    intervals: ["1min", "5min"], hint: "1–5 min" },
  { id: "INTRADAY", label: "Intraday", intervals: ["15min"],        hint: "15 min" },
  { id: "HOURLY",   label: "Hourly",   intervals: ["1h"],           hint: "1 hour" },
  { id: "SWING",    label: "Swing",    intervals: ["4h"],           hint: "4 hour" },
  { id: "DAILY",    label: "Daily",    intervals: ["1d"],           hint: "1 day" },
  { id: "MONTHLY",  label: "Monthly",  intervals: ["1w"],           hint: "Weekly candles" },
  { id: "YEARLY",   label: "Yearly",   intervals: ["1mo"],          hint: "Monthly candles" },
];
export const TIMEFRAME_IDS = TIMEFRAMES.map((t) => t.id);

// Reverse map: interval code -> horizon bucket. Mirrors BotDashboard's
// INTERVAL_HORIZON; derived from TIMEFRAMES so the two cannot drift.
export const INTERVAL_TO_TIMEFRAME = TIMEFRAMES.reduce((acc, t) => {
  for (const iv of t.intervals) acc[iv] = t.id;
  return acc;
}, {});

// ── MARKET-CAP TIERS ─────────────────────────────────────────────────────────
// Thresholds are the conventional US-equity bands. `min` is inclusive.
// Deliberately NOT applied to futures: NQ/ES/CL/GC are index and commodity
// contracts with no market cap, so the control is hidden on that side rather
// than shown as a filter that silently does nothing.
export const CAP_TIERS = [
  { id: "small", label: "Small-cap", min: 0,            max: 2e9,    hint: "Under $2B",     risk: "Highest volatility — thin liquidity, wider spreads, larger gaps." },
  { id: "mid",   label: "Mid-cap",   min: 2e9,          max: 10e9,   hint: "$2B – $10B",    risk: "Elevated volatility with better liquidity than small caps." },
  { id: "large", label: "Large-cap", min: 10e9,         max: 200e9,  hint: "$10B – $200B",  risk: "Established names, moderate volatility." },
  { id: "mega",  label: "Mega-cap",  min: 200e9,        max: Infinity, hint: "Over $200B",  risk: "Deepest liquidity and the steadiest of the four." },
];
export const CAP_IDS = CAP_TIERS.map((c) => c.id);
// Only these sides get a market-cap filter (see note above).
export const CAP_FILTERABLE_SIDES = ["options", "equity"];

/** Classify a raw market cap into a tier id. Returns null when unknown — an
 *  unknown cap must never be silently treated as a match or a miss; callers
 *  decide (we choose to ALLOW, so missing data can't hide a signal). */
export function capTier(marketCap) {
  const n = Number(marketCap);
  if (!Number.isFinite(n) || n <= 0) return null;
  return CAP_TIERS.find((t) => n >= t.min && n < t.max)?.id ?? "mega";
}

// ── DEFAULTS ─────────────────────────────────────────────────────────────────
// Everything ON by default: this release ADDS filtering, so an untouched
// account must behave exactly as it did before (no silent loss of alerts).
export function defaultPrefs() {
  return {
    sides: [...SIDE_IDS],
    timeframes: [...TIMEFRAME_IDS],
    // Per-side cap selection. Futures is present but unused (see CAP_FILTERABLE_SIDES).
    caps: { options: [...CAP_IDS], equity: [...CAP_IDS] },
  };
}

/** Coerce anything (old localStorage, a partial server row, null) into a valid
 *  prefs object. Never throws — bad stored data must degrade to "allow all"
 *  rather than muting a user's alerts. */
export function normalizePrefs(raw) {
  const d = defaultPrefs();
  if (!raw || typeof raw !== "object") return d;
  const arr = (v, allowed, fallback) => {
    if (!Array.isArray(v)) return fallback;
    const clean = v.filter((x) => allowed.includes(x));
    // An empty selection would mute everything — almost always a bug or a
    // mis-tap rather than intent, so fall back to the full set.
    return clean.length ? clean : fallback;
  };
  return {
    sides: arr(raw.sides, SIDE_IDS, d.sides),
    timeframes: arr(raw.timeframes, TIMEFRAME_IDS, d.timeframes),
    caps: {
      options: arr(raw.caps?.options, CAP_IDS, d.caps.options),
      equity:  arr(raw.caps?.equity,  CAP_IDS, d.caps.equity),
    },
  };
}

/**
 * The single matching predicate. Used by the feed AND by push so the two can
 * never disagree about whether a signal is wanted.
 *
 * `sig` needs: asset_class (or assetClass), interval, and optionally
 * market_cap / marketCap. Unknown cap => allowed (see capTier note).
 */
export function signalMatchesPrefs(sig, prefsRaw) {
  const p = normalizePrefs(prefsRaw);
  const side = sig?.asset_class ?? sig?.assetClass ?? null;
  if (side && !p.sides.includes(side)) return false;

  const tf = INTERVAL_TO_TIMEFRAME[sig?.interval];
  // An unmapped interval is allowed rather than dropped — a new interval added
  // server-side must not become invisible to every existing user.
  if (tf && !p.timeframes.includes(tf)) return false;

  if (CAP_FILTERABLE_SIDES.includes(side)) {
    const tier = capTier(sig?.market_cap ?? sig?.marketCap);
    if (tier && !(p.caps?.[side] ?? CAP_IDS).includes(tier)) return false;
  }
  return true;
}

/** Compact human summary for the UI ("All sides · 3 of 7 timeframes"). */
export function describePrefs(prefsRaw) {
  const p = normalizePrefs(prefsRaw);
  const sideTxt = p.sides.length === SIDE_IDS.length
    ? "All sides"
    : p.sides.map((s) => SIDES.find((x) => x.id === s)?.label || s).join(" · ");
  const tfTxt = p.timeframes.length === TIMEFRAME_IDS.length
    ? "all timeframes"
    : `${p.timeframes.length} of ${TIMEFRAME_IDS.length} timeframes`;
  return `${sideTxt} · ${tfTxt}`;
}

/**
 * Why a signal would NOT reach a given device — or null if it would.
 *
 * Extracted in V14.6 because "the feed shows signals but my phone is silent" was
 * undiagnosable: every gate below was an anonymous early `return`, so a dropped
 * push left no trace anywhere. /api/push/diagnose replays real signals through
 * THIS function, so the explanation a user is shown is produced by the same code
 * that actually made the decision — it can never drift into a comforting lie.
 *
 * Returns { code, detail } so the UI can phrase it and the caller can count it.
 */
export function pushBlockReason(sig, s) {
  const conv = sig.conviction ?? 0;
  const min = s.min_conviction ?? 65;
  if (conv < min) {
    return { code: "below_conviction", detail: `${conv}% is under this device's ${min}% threshold` };
  }
  // Legacy single-class scope (pre-V14.5). Normally null.
  if (s.asset_class && s.asset_class !== sig.asset_class) {
    return { code: "asset_class_scope", detail: `device is scoped to ${s.asset_class} only` };
  }
  // V14.5 routing. Only applied when the device actually recorded a preference —
  // NULL means "no preference", which must behave exactly as it did before.
  if (s.alert_sides || s.alert_timeframes || s.alert_caps) {
    if (!signalMatchesPrefs(sig, { sides: s.alert_sides, timeframes: s.alert_timeframes, caps: s.alert_caps })) {
      return { code: "alert_routing", detail: `${sig.asset_class}/${sig.interval} is deselected in ALERTS` };
    }
  }
  const level = s.notify_level || "fire";
  if (sig.status === "HOLD" && level !== "all") {
    return {
      code: "hold_needs_all",
      detail: "signal is HOLD (forming) and this device is set to FIRE only",
    };
  }
  if (sig.status !== "FIRE" && sig.status !== "HOLD") {
    return { code: "not_actionable", detail: `status ${sig.status} never pushes` };
  }
  return null;
}
