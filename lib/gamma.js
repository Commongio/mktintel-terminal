// lib/gamma.js — dealer gamma exposure, derived from the chain.
//
// WHY DERIVED. Yahoo's chain returns strike, open interest, implied volatility
// and last price. It does NOT return greeks, so gamma is computed from
// Black-Scholes rather than read. That part is exact arithmetic, not a guess.
//
// WHAT IS A GUESS, STATED PLAINLY. Gamma EXPOSURE requires knowing who is on
// which side of each contract, and no public feed says. The standard
// convention -- used here -- assumes dealers are long calls and short puts
// against retail flow. It is an assumption about positioning, widely used and
// frequently wrong on individual names, and every value below inherits it.
// `assumptions` travels with the result so nothing downstream can forget.
//
// The other limits worth knowing before anyone trades on this:
//   * ONE expiry. fetchChainSummary reads options[0], the nearest expiration,
//     so this is front-month exposure and not the whole surface.
//   * Yahoo data is delayed, so the flip level is where it WAS.
//   * Open interest is yesterday's close. Intraday positioning is invisible.
//
// None of this makes the number useless. It makes it a hypothesis, which is
// why nothing here touches conviction -- it is recorded, shipped to the Lab,
// and tested against outcomes before it is allowed to influence anything.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Standard normal PDF. */
const phi = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

/**
 * Black-Scholes gamma: the rate of change of delta per $1 of spot.
 *
 * Identical for calls and puts, which is the property that makes exposure
 * summable across the chain.
 *
 * Returns null rather than a number for degenerate inputs. Gamma explodes as
 * T or sigma approach zero, and an expiring or zero-vol contract would
 * otherwise dominate the whole surface with a value that means nothing.
 */
export function bsGamma(S, K, T, sigma, r = 0.045) {
  if (![S, K, T, sigma].every(isNum)) return null;
  if (S <= 0 || K <= 0 || T <= 0 || sigma <= 0) return null;
  // Under about two hours to expiry the formula is numerically useless.
  if (T < 0.00025) return null;

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * sqrtT);
  const g = phi(d1) / (S * sigma * sqrtT);
  return Number.isFinite(g) ? g : null;
}

/** Years to expiry, floored at zero. */
function yearsTo(expiryMs, now = Date.now()) {
  if (!isNum(expiryMs)) return null;
  const years = (expiryMs - now) / (365.25 * 24 * 3600 * 1000);
  return years > 0 ? years : null;
}

/**
 * Net dealer gamma exposure at a hypothetical spot.
 *
 * Expressed as dollars of dealer delta per 1% move, the conventional unit:
 *   gamma x OI x 100 (contract multiplier) x S^2 x 0.01
 *
 * Calls positive, puts negative, per the positioning assumption above.
 */
function netGexAt(spot, contracts, now) {
  let call = 0, put = 0;
  for (const c of contracts) {
    const T = yearsTo(c.expiryMs, now);
    const g = bsGamma(spot, c.strike, T, c.iv);
    if (g === null) continue;
    const notional = g * (c.oi || 0) * 100 * spot * spot * 0.01;
    if (c.type === "call") call += notional; else put += notional;
  }
  return { net: call - put, call, put };
}

/**
 * Gamma exposure for a chain.
 *
 * @param {object} chain  { calls, puts, expirationDate (unix seconds) }
 * @param {number} spot
 */
export function gammaExposure(chain, spot, now = Date.now()) {
  const empty = {
    total_gex: null, call_gex: null, put_gex: null,
    gamma_regime: null, flip_level: null, distance_to_flip_pct: null,
    largest_gamma_strike: null, contracts_used: 0,
    assumptions: "dealers long calls / short puts; front expiry only; OI as of prior close",
  };

  try {
    if (!isNum(spot) || spot <= 0) return empty;
    const expiryMs = isNum(chain?.expirationDate) ? chain.expirationDate * 1000 : null;

    const contracts = [];
    for (const [arr, type] of [[chain?.calls ?? [], "call"], [chain?.puts ?? [], "put"]]) {
      for (const c of arr) {
        if (!isNum(c?.strike) || !isNum(c?.impliedVolatility) || c.impliedVolatility <= 0) continue;
        // Strikes more than 30% from spot contribute almost no gamma and are
        // where Yahoo's IV is least reliable -- deep wings routinely carry
        // placeholder vols that would distort the surface.
        if (Math.abs(c.strike - spot) / spot > 0.30) continue;
        contracts.push({
          strike: c.strike, iv: c.impliedVolatility, oi: c.openInterest ?? 0,
          type, expiryMs: isNum(c.expiration) ? c.expiration * 1000 : expiryMs,
        });
      }
    }
    if (contracts.length < 8) return { ...empty, contracts_used: contracts.length };

    const at = netGexAt(spot, contracts, now);

    // Which single strike carries the most gamma. Often where price stalls,
    // and the most immediately useful number here.
    let largest = null, largestVal = 0;
    const byStrike = new Map();
    for (const c of contracts) {
      const T = yearsTo(c.expiryMs, now);
      const g = bsGamma(spot, c.strike, T, c.iv);
      if (g === null) continue;
      const v = Math.abs(g * (c.oi || 0));
      byStrike.set(c.strike, (byStrike.get(c.strike) || 0) + v);
    }
    for (const [k, v] of byStrike) if (v > largestVal) { largestVal = v; largest = k; }

    // ── the flip level ──────────────────────────────────────────────────────
    // The spot at which net exposure crosses zero: above it dealers dampen
    // moves, below it they amplify them. Found by scanning rather than solved,
    // because net GEX is not monotonic and a root-finder can land on the wrong
    // crossing.
    let flip = null;
    const lo = spot * 0.85, hi = spot * 1.15, steps = 60;
    let prev = null;
    for (let i = 0; i <= steps; i++) {
      const s = lo + ((hi - lo) * i) / steps;
      const v = netGexAt(s, contracts, now).net;
      if (prev && ((prev.v < 0 && v >= 0) || (prev.v > 0 && v <= 0))) {
        // Linear interpolation between the bracketing samples.
        const t = Math.abs(prev.v) / (Math.abs(prev.v) + Math.abs(v) || 1);
        flip = prev.s + (s - prev.s) * t;
        break;
      }
      prev = { s, v };
    }

    const round = (v, d = 2) => (isNum(v) ? Number(v.toFixed(d)) : null);
    return {
      total_gex: round(at.net, 0),
      call_gex: round(at.call, 0),
      put_gex: round(at.put, 0),
      // The reading that matters, and the only one worth acting on without
      // reading the raw number: positive suppresses volatility, negative
      // amplifies it.
      gamma_regime: at.net > 0 ? "positive" : at.net < 0 ? "negative" : "flat",
      flip_level: round(flip, 2),
      distance_to_flip_pct: flip ? round(((spot - flip) / spot) * 100, 2) : null,
      largest_gamma_strike: round(largest, 2),
      contracts_used: contracts.length,
      assumptions: empty.assumptions,
    };
  } catch {
    // Same contract as the rest of the data layer: never throw into signal
    // generation. A missing regime costs a column; a crash costs the scan.
    return empty;
  }
}
