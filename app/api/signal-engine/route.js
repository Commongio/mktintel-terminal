// app/api/signal-engine/route.js
// KRONOS MAP SIGNAL ENGINE — V.8
// Translates the Kronos Map Pine Script indicator into server-side JS
// Uses Twelve Data candles (free tier, 800 req/day)
//
// SIGNAL LOGIC (from Kronos Map indicator):
// BOS  = Break of Structure (continuation)
// MSS  = Market Structure Shift (reversal — higher conviction)
// FVG  = Fair Value Gap (imbalance zone = entry zone)
// IFVG = Invalidated FVG (gap filled)
// LIQ  = Liquidity Sweep (stop hunt + rejection = smart money signal)
// KAPPA BUY  = LiqSweep + FVG/miniBOS + FVG midline retest
// KAPPA SELL = LiqSweep + FVG/miniBOS + FVG midline retest (bearish)

const TWELVE_BASE = "https://api.twelvedata.com";

async function fetchCandles(symbol, interval, outputsize = 50) {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY not set");
  const url = `${TWELVE_BASE}/time_series?symbol=${symbol}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Twelve Data error ${r.status}`);
  const data = await r.json();
  if (data.status === "error") throw new Error(data.message);
  // Returns newest first — reverse to chronological
  const candles = (data.values || []).reverse().map(c => ({
    time:   c.datetime,
    open:   Number(c.open),
    high:   Number(c.high),
    low:    Number(c.low),
    close:  Number(c.close),
    volume: Number(c.volume) || 0,
  }));
  return candles;
}

// ── SWING HIGH/LOW DETECTION ─────────────────────────────────────────────────
// Pine: ta.pivothigh(high, length, length) → returns high if it's the highest in [length] bars each side
function findSwings(candles, length = 7) {
  const swingHighs = [];
  const swingLows  = [];
  for (let i = length; i < candles.length - length; i++) {
    const c = candles[i];
    // Swing high: highest in window
    const isSwingHigh = candles.slice(i - length, i + length + 1).every((x, j) => j === length || x.high <= c.high);
    if (isSwingHigh) swingHighs.push({ index: i, price: c.high, time: c.time });
    // Swing low: lowest in window
    const isSwingLow = candles.slice(i - length, i + length + 1).every((x, j) => j === length || x.low >= c.low);
    if (isSwingLow) swingLows.push({ index: i, price: c.low, time: c.time });
  }
  return { swingHighs, swingLows };
}

// ── BOS/MSS DETECTION ────────────────────────────────────────────────────────
function detectBOSMSS(candles, swingHighs, swingLows) {
  const events = [];
  let lastBreakType = 0; // 1 = bullish last broke, -1 = bearish last broke
  const lastSwingHigh = swingHighs[swingHighs.length - 1]?.price;
  const lastSwingLow  = swingLows[swingLows.length - 1]?.price;

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    // Bullish: close breaks above last swing high
    if (lastSwingHigh && c.close > lastSwingHigh) {
      const type = lastBreakType === -1 ? "MSS_BULL" : "BOS_BULL";
      events.push({ type, price: lastSwingHigh, time: c.time, index: i });
      lastBreakType = 1;
    }
    // Bearish: close breaks below last swing low
    if (lastSwingLow && c.close < lastSwingLow) {
      const type = lastBreakType === 1 ? "MSS_BEAR" : "BOS_BEAR";
      events.push({ type, price: lastSwingLow, time: c.time, index: i });
      lastBreakType = -1;
    }
  }
  return events;
}

// ── FVG DETECTION ─────────────────────────────────────────────────────────────
// Bullish FVG: candle[i].low > candle[i-2].high (gap between candle 1 and 3)
// Bearish FVG: candle[i].high < candle[i-2].low
function detectFVGs(candles) {
  const fvgs = [];
  for (let i = 2; i < candles.length; i++) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = candles[i];
    if (c2.low > c0.high) {
      // Bullish FVG
      const top = c2.low;
      const bot = c0.high;
      fvgs.push({ type: "BULL_FVG", top, bot, mid: (top + bot) / 2, time: c1.time, index: i - 1, filled: false });
    }
    if (c2.high < c0.low) {
      // Bearish FVG
      const top = c0.low;
      const bot = c2.high;
      fvgs.push({ type: "BEAR_FVG", top, bot, mid: (top + bot) / 2, time: c1.time, index: i - 1, filled: false });
    }
  }
  // Mark filled FVGs
  fvgs.forEach(fvg => {
    const laterCandles = candles.slice(fvg.index + 1);
    for (const c of laterCandles) {
      if (fvg.type === "BULL_FVG" && c.low <= fvg.bot) { fvg.filled = true; break; }
      if (fvg.type === "BEAR_FVG" && c.high >= fvg.top) { fvg.filled = true; break; }
    }
  });
  return fvgs;
}

// ── LIQUIDITY SWEEP DETECTION ─────────────────────────────────────────────────
// Sweep: wick below last swing low + bullish close (wick grab + rejection)
// or wick above last swing high + bearish close
function detectSweeps(candles, swingHighs, swingLows) {
  const sweeps = [];
  for (let i = 1; i < candles.length; i++) {
    const c    = candles[i];
    const prev = candles[i - 1];
    const lastHigh = swingHighs.filter(s => s.index < i).slice(-1)[0]?.price;
    const lastLow  = swingLows.filter(s => s.index < i).slice(-1)[0]?.price;
    // Bull sweep: wick below swing low + closed bullish
    if (lastLow && prev.low < lastLow && prev.close > prev.open) {
      sweeps.push({ type: "SWEEP_BULL", price: lastLow, time: c.time, index: i });
    }
    // Bear sweep: wick above swing high + closed bearish
    if (lastHigh && prev.high > lastHigh && prev.close < prev.open) {
      sweeps.push({ type: "SWEEP_BEAR", price: lastHigh, time: c.time, index: i });
    }
  }
  return sweeps;
}

// ── KAPPA SIGNAL (from indicator) ─────────────────────────────────────────────
// Buy:  liqSweepBuy AND (bullFVG OR miniBOSUp) AND retestBullFVGMid
// Sell: liqSweepSell AND (bearFVG OR miniBOSDown) AND retestBearFVGMid
function detectKappaSignals(candles, sweeps, fvgs) {
  const signals = [];
  const lastN   = candles.slice(-20); // only check recent candles
  const lastIdx = candles.length - 1;

  // Last bull/bear sweep
  const lastBullSweep = sweeps.filter(s => s.type === "SWEEP_BULL").slice(-1)[0];
  const lastBearSweep = sweeps.filter(s => s.type === "SWEEP_BEAR").slice(-1)[0];

  // Active (unfilled) FVGs
  const activeBullFVGs = fvgs.filter(f => f.type === "BULL_FVG" && !f.filled);
  const activeBearFVGs = fvgs.filter(f => f.type === "BEAR_FVG" && !f.filled);

  const current = candles[lastIdx];
  const prev    = candles[lastIdx - 1];
  if (!current || !prev) return signals;

  // miniBOS conditions
  const miniBOSUp   = current.close > candles[lastIdx - 2]?.high;
  const miniBOSDown = current.close < candles[lastIdx - 2]?.low;

  // FVG midline retests
  const lastBullFVGMid = activeBullFVGs.slice(-1)[0]?.mid;
  const lastBearFVGMid = activeBearFVGs.slice(-1)[0]?.mid;

  const retestBuy  = lastBullFVGMid && prev.close < lastBullFVGMid && current.close >= lastBullFVGMid;
  const retestSell = lastBearFVGMid && prev.close > lastBearFVGMid && current.close <= lastBearFVGMid;

  const hasBullFVG = activeBullFVGs.length > 0;
  const hasBearFVG = activeBearFVGs.length > 0;

  const buyCore  = lastBullSweep && (hasBullFVG || miniBOSUp);
  const sellCore = lastBearSweep && (hasBearFVG || miniBOSDown);

  if (buyCore && retestBuy) {
    signals.push({ type: "KAPPA_BUY",  direction: "LONG",  confidence: "HIGH",  time: current.time });
  } else if (buyCore) {
    signals.push({ type: "KAPPA_BUY",  direction: "LONG",  confidence: "WATCH", time: current.time });
  }

  if (sellCore && retestSell) {
    signals.push({ type: "KAPPA_SELL", direction: "SHORT", confidence: "HIGH",  time: current.time });
  } else if (sellCore) {
    signals.push({ type: "KAPPA_SELL", direction: "SHORT", confidence: "WATCH", time: current.time });
  }

  return signals;
}

// ── CONVICTION SCORE ──────────────────────────────────────────────────────────
// Exactly mimics the Kronos Map signal logic — each condition adds weight
function calcConviction(candles, bosEvents, fvgs, sweeps, kappaSignals) {
  let score = 0;
  const lastCandle  = candles[candles.length - 1];
  const activeFVGs  = fvgs.filter(f => !f.filled);
  const recentBOS   = bosEvents.slice(-3);

  const hasBullMSS  = recentBOS.some(e => e.type === "MSS_BULL");
  const hasBearMSS  = recentBOS.some(e => e.type === "MSS_BEAR");
  const hasBullBOS  = recentBOS.some(e => e.type === "BOS_BULL");
  const hasBearBOS  = recentBOS.some(e => e.type === "BOS_BEAR");
  const hasBullFVG  = activeFVGs.some(f => f.type === "BULL_FVG");
  const hasBearFVG  = activeFVGs.some(f => f.type === "BEAR_FVG");
  const hasBullSweep= sweeps.slice(-5).some(s => s.type === "SWEEP_BULL");
  const hasBearSweep= sweeps.slice(-5).some(s => s.type === "SWEEP_BEAR");
  const kappaHigh   = kappaSignals.some(k => k.confidence === "HIGH");
  const kappaWatch  = kappaSignals.some(k => k.confidence === "WATCH");

  // MSS is highest conviction signal (structure has flipped)
  if (hasBullMSS || hasBearMSS) score += 30;
  // Liquidity sweep confirms smart money entry
  if (hasBullSweep || hasBearSweep) score += 25;
  // BOS adds continuation confirmation
  if (hasBullBOS || hasBearBOS) score += 15;
  // Active FVG = institutional imbalance zone in play
  if (hasBullFVG || hasBearFVG) score += 20;
  // Kappa signal fires = all conditions aligned
  if (kappaHigh)  score += 10;
  if (kappaWatch) score += 5;

  // Determine bias
  let bias = "NEUTRAL";
  const bullScore = (hasBullMSS?30:0) + (hasBullSweep?25:0) + (hasBullBOS?15:0) + (hasBullFVG?20:0);
  const bearScore = (hasBearMSS?30:0) + (hasBearSweep?25:0) + (hasBearBOS?15:0) + (hasBearFVG?20:0);
  if (bullScore > bearScore + 15) bias = "BULLISH";
  else if (bearScore > bullScore + 15) bias = "BEARISH";

  return { score: Math.min(score, 100), bias };
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol   = (searchParams.get("symbol") || "NQ").toUpperCase();
  const interval = searchParams.get("interval") || "15min";

  try {
    // Fetch two timeframes: HTF for structure, LTF for entry
    const htfInterval = interval === "1min" ? "15min" : interval === "15min" ? "1h" : "4h";
    const [ltfCandles, htfCandles] = await Promise.all([
      fetchCandles(symbol, interval, 60),
      fetchCandles(symbol, htfInterval, 50),
    ]);

    if (ltfCandles.length < 20) {
      return Response.json({ error: "Insufficient candle data" }, { status: 422 });
    }

    // Run signal detection on LTF
    const { swingHighs, swingLows } = findSwings(ltfCandles, 5);
    const bosEvents   = detectBOSMSS(ltfCandles, swingHighs, swingLows);
    const fvgs        = detectFVGs(ltfCandles);
    const sweeps      = detectSweeps(ltfCandles, swingHighs, swingLows);
    const kappaSignals= detectKappaSignals(ltfCandles, sweeps, fvgs);

    // Run on HTF for structure bias
    const { swingHighs: htfSH, swingLows: htfSL } = findSwings(htfCandles, 7);
    const htfBOS = detectBOSMSS(htfCandles, htfSH, htfSL);
    const htfBias = htfBOS.slice(-1)[0]?.type?.includes("BULL") ? "BULLISH"
                  : htfBOS.slice(-1)[0]?.type?.includes("BEAR") ? "BEARISH" : "NEUTRAL";

    // Conviction score
    const { score, bias } = calcConviction(ltfCandles, bosEvents, fvgs, sweeps, kappaSignals);

    // Active zones
    const activeFVGs   = fvgs.filter(f => !f.filled).slice(-4);
    const recentSweeps = sweeps.slice(-3);
    const lastSwingH   = swingHighs.slice(-1)[0]?.price;
    const lastSwingL   = swingLows.slice(-1)[0]?.price;
    const currentPrice = ltfCandles[ltfCandles.length - 1]?.close;

    return Response.json({
      symbol,
      interval,
      htfInterval,
      currentPrice,
      conviction:    score,
      bias,
      htfBias,
      signal:        kappaSignals.length > 0 ? kappaSignals[kappaSignals.length - 1] : null,
      allSignals:    kappaSignals,
      recentBOS:     bosEvents.slice(-5),
      activeFVGs,
      recentSweeps,
      keyLevels: {
        lastSwingHigh: lastSwingH,
        lastSwingLow:  lastSwingL,
        htfSwingHigh:  htfSH.slice(-1)[0]?.price,
        htfSwingLow:   htfSL.slice(-1)[0]?.price,
      },
      fetchedAt: Date.now(),
      source: "kronos-map-engine",
      note: "Based on Kronos Map indicator: BOS/MSS + FVG + Liquidity Sweep + Kappa signal logic",
    });

  } catch (err) {
    return Response.json({
      error: String(err.message),
      symbol,
      note: "Check TWELVE_DATA_API_KEY is set in .env.local",
    }, { status: 502 });
  }
}