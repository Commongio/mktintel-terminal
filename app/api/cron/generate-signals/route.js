// app/api/cron/generate-signals/route.js — V9 server-side signal feed.
// Runs the engine for every tracked symbol in both modes and writes
// STANDARDIZED signals to Supabase (same feed for every subscriber —
// deliberately non-personalized; see PLAN_V9.md compliance section).
//
// Trigger: Vercel Cron (vercel.json) or any scheduler hitting
//   GET /api/cron/generate-signals  with  Authorization: Bearer ${CRON_SECRET}
// Dedup: a new row is only written when status/direction changes or the
// last row for that symbol is older than 30 minutes.
//
// V10.5: added portfolio-horizon sweeps (weekly/monthly/yearly), not just the
// intraday one. Before this, the cadence picker (BotFlowPopups) and the feed's
// INTERVAL_BUCKET map both implied weekly/monthly/yearly setups existed, but
// nothing ever wrote a signal at those intervals — those buckets were always
// empty in production. Kept intentionally small (curated large-cap names only)
// and rate-gated by time-of-day — position/long-horizon setups don't need
// thousands of names or 2-minute freshness the way intraday scanning does.
import { runSignalEngine, MODE_DEFAULT_INTERVAL, ENGINE_VERSION, MIN_SURFACE_CONVICTION } from "../../../../lib/signalEngine";
import { emitSignal, deriveSetup, buildProvenance, labEnabled } from "../../../../lib/labEmitter";
import { getAdmin, serverConfigured, insertSignal } from "../../../../lib/supabaseServer";
import { sendSignalPush } from "../../../../lib/push";
import { gradeSignalLifecycle } from "../../../../lib/signalLifecycle";
import { buildSignalStats, applyAggregateGate } from "../../../../lib/signalStats";
import { marketRegime } from "../../../../lib/chop";
import { scanUniverse, fetchMostActives, FULL_UNIVERSE, BUCKET_SIZE, ROTATING_PER_RUN, rotationLength, CURATED, intervalAllowed } from "../../../../lib/universe";
import { getQuotes } from "../../../../lib/marketData";

export const maxDuration = 60;

// Rotation cursor, derived from the CLOCK rather than stored in the DB.
// Each ~2-min run lands on the next slice of FULL_UNIVERSE, so the whole universe
// is swept over `rotationLength()` runs with zero persistence — and a missed or
// failed run just skips a slice instead of stalling the rotation.
// It MUST advance by ROTATING_PER_RUN (not BUCKET_SIZE) to stay in lockstep with
// the window scanUniverse() actually takes; otherwise we'd leave coverage holes.
const RUN_MS = 2 * 60 * 1000;
function clockCursor() {
  const runIndex = Math.floor(Date.now() / RUN_MS);
  return (runIndex * ROTATING_PER_RUN) % FULL_UNIVERSE.length;
}

// The portfolio-horizon universe: a handful of the most liquid large caps, plus
// the core index futures. These timeframes are about "is this still a good name
// to hold", not "what's moving right now" — a small, stable list is exactly
// right, not a limitation.
//
// V10.5b: futures are included now. Previously all three portfolio sweeps were
// hardcoded to assetClass "options", so futures mode could never show a
// weekly/monthly/yearly signal no matter what cadence the user picked.
// V13.5: equity is the LONG-horizon portfolio-growth class, so it lives here
// (in the daily/weekly/monthly sweeps) rather than the intraday loop.
const PORTFOLIO_UNIVERSE = {
  options: CURATED.large.slice(0, 12),
  futures: ["NQ", "ES", "CL", "GC"],
  equity:  CURATED.large.slice(0, 12),
};


// V14.5 market-cap cache. Caps drive the per-tier alert filter, but a per-symbol
// lookup inside the scan loop would eat the 50s budget. So caps are fetched in
// batches, memoized for the lifetime of the run, and are strictly best-effort:
// a failure yields null, and lib/alertPrefs treats an unknown cap as ALLOWED so
// missing data can never silently hide a signal from someone.
// V14.8: how long an instrument must stay quiet before a STALE re-write is
// allowed to notify again. A genuine verdict change ignores this entirely.
// 4h is the balance point: it surfaces a setup that has been valid all session
// (the reported miss) without turning a 30-minute re-write cycle into a buzz
// per instrument per half hour across the whole universe.
const PUSH_COOLDOWN_MS = 4 * 60 * 60 * 1000;

const _capCache = new Map();
async function capFor(symbol) {
  const key = String(symbol || "").toUpperCase();
  if (!key) return null;
  if (_capCache.has(key)) return _capCache.get(key);
  try {
    const quotes = await getQuotes([key]);
    const cap = quotes?.[0]?.marketCap ?? null;
    _capCache.set(key, cap);
    return cap;
  } catch { _capCache.set(key, null); return null; }
}

async function writeIfChanged(admin, { assetClass, symbol, interval }, buckets, stats, choppy) {
  const raw = await runSignalEngine({ assetClass, symbol, interval });

  // Captured BEFORE the chop halt below mutates raw.status in place. Without
  // this, a FIRE demoted to HOLD by chop is indistinguishable from one that
  // was never a FIRE, and the chop gate's effect becomes unauditable.
  const preGate = { status: raw.status, conviction: raw.conviction };

  // ── V13.6 CHOP HALT ─────────────────────────────────────────────────────────
  // When the broad market is in whipsaw, halt NEW actionable signals: any FIRE is
  // demoted to HOLD so nothing new is presented as tradeable. The setup is still
  // recorded (as forming) — we're not blind during chop, we just don't tell the
  // user to act. The UI shows the stand-down banner from /api/market-state.
  if (choppy && raw.status === "FIRE") {
    raw.status = "HOLD";
    buckets.halted.push(`${assetClass}:${symbol}:${interval}`);
  }

  // ── V13.5 BOT ↔ TERMINAL BRAIN SYNC ────────────────────────────────────────
  // Before a signal is handed to users, the terminal's aggregate self-learning
  // memory validates it: a setup signature that's been LOSING recently gets its
  // conviction cut and can be demoted FIRE → HOLD. Downgrade-only + evidence-
  // gated (see lib/signalStats). This is the "both systems validate each other"
  // check — the engine (bot) proposes, the aggregate memory (terminal brain)
  // confirms or vetoes. The reason rides along on the row for auditability.
  const { sig, demoted } = applyAggregateGate(raw, stats);
  if (demoted) buckets.demoted.push(`${assetClass}:${symbol}:${interval}:${raw.conviction}->${sig.conviction}`);

  // V12: only surface setups at or above the hard floor. Previously the cron
  // wrote any changed/stale verdict regardless of conviction, so sub-45% SCAN
  // rows polluted the feed. The user's slider still filters further on top.
  if ((sig.conviction ?? 0) < MIN_SURFACE_CONVICTION) {
    buckets.skipped.push(`${assetClass}:${symbol}:${interval}:lowconv${sig.conviction ?? 0}`);
    return;
  }

  // Selects asset_class/symbol/interval too so the row can be compared as a
  // whole by continuesFamily, and the setup columns so a re-write inherits its
  // family's anchor instead of starting a new one. Migration 013; the columns
  // are nullable, so this still works before that migration is run.
  const { data: last } = await admin.from("signals")
    .select("asset_class,symbol,interval,status,direction,created_at,setup_id,streak_started_at,revision")
    .eq("asset_class", assetClass).eq("symbol", symbol).eq("interval", interval)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const changed = !last || last.status !== sig.status || last.direction !== sig.direction;
  const stale = last && Date.now() - new Date(last.created_at).getTime() > 30 * 60_000;
  if (!changed && !stale) { buckets.skipped.push(`${assetClass}:${symbol}:${interval}`); return; }

  // A stale re-write is a NEW ROW for the SAME setup, at a recomputed entry.
  // Without a stable family id those rows read as independent observations,
  // which understates variance in every rate computed downstream.
  const setup = deriveSetup(last, { asset_class: assetClass, symbol, interval, status: sig.status, direction: sig.direction });
  // `raw` is pre-gate, `sig` post-gate. The delta is applyAggregateGate's
  // action and cannot be replayed later, because signalStats moves.
  const provenance = buildProvenance(raw, sig, {
    chopApplied: choppy, minConviction: MIN_SURFACE_CONVICTION, preGate,
  });

  // ── V14.8 PUSH COOLDOWN ────────────────────────────────────────────────────
  // Push used to require `changed`, while the WRITE above also accepts `stale`.
  // A signal holding the same verdict therefore got a fresh feed row every 30
  // minutes and never notified — measured at 14 of 15 signals blocked purely by
  // this. Now a stale re-write may notify too, but only if this instrument
  // hasn't notified within COOLDOWN, so we don't buzz per-instrument every 30
  // minutes. A genuine verdict change still notifies immediately, as before.
  let cooldownElapsed = true;
  if (!changed) {
    const { data: lastPush, error: pushErr } = await admin.from("signals")
      .select("pushed_at")
      .eq("asset_class", assetClass).eq("symbol", symbol).eq("interval", interval)
      .not("pushed_at", "is", null)
      .order("pushed_at", { ascending: false }).limit(1).maybeSingle();
    // 42703 = migration 012 not run. Fall back to the old behaviour (changed
    // only) rather than pushing on every stale re-write, which would be the
    // spam case the cooldown exists to prevent.
    if (pushErr) cooldownElapsed = false;
    else if (lastPush?.pushed_at) {
      cooldownElapsed = Date.now() - new Date(lastPush.pushed_at).getTime() > PUSH_COOLDOWN_MS;
    }
  }
  const willPush = (sig.status === "FIRE" || sig.status === "HOLD") && (changed || cooldownElapsed);

  const { error } = await insertSignal(admin, {
    asset_class: assetClass, symbol, interval,
    status: sig.status, direction: sig.direction, conviction: sig.conviction,
    plan: sig.plan, agents: sig.agents, engine_version: ENGINE_VERSION,
    source: "cron",
    // V14.5: cap recorded AT FIRE TIME so cap-tier alert filtering is
    // reproducible — a company crossing a tier boundary later must not
    // retroactively change which alerts were correct. Futures have none.
    market_cap: assetClass === "futures" ? null : await capFor(symbol),
    // V14.8: stamped at decision time so the cooldown is anchored even if the
    // fan-out below throws. Marking a push we then failed to deliver only delays
    // this instrument by one cooldown; NOT marking one we did deliver would
    // reopen the every-30-minutes spam this exists to prevent.
    pushed_at: willPush ? new Date().toISOString() : null,
    // ── migration 013: what the engine computes and used to discard ─────────
    setup_id: setup.setup_id,
    streak_started_at: setup.streak_started_at,
    revision: setup.revision,
    conviction_raw: raw.conviction ?? null,
    degraded: raw.degraded ?? null,
    provenance,
  });
  if (error) { buckets.failed.push({ symbol: `${assetClass}:${symbol}:${interval}`, error: error.message }); return; }
  buckets.written.push(`${assetClass}:${symbol}:${interval}:${sig.status}`);

  // Fire-and-forget: emitSignal never throws and never blocks. If the Lab is
  // down, this run behaves exactly as it did before the emitter existed.
  //
  // The promise is collected only so the response can report how many emits
  // succeeded -- a silent bridge and a working one look identical otherwise,
  // and "no rows in the Lab" gives no clue which end is at fault. Awaited once
  // at the very end of the run, never per-signal.
  buckets.labEmits.push(emitSignal({
    raw, sig, last,
    row: {
      asset_class: assetClass, symbol, interval,
      status: sig.status, direction: sig.direction, conviction: sig.conviction,
      plan: sig.plan, agents: sig.agents, engine_version: ENGINE_VERSION, source: "cron",
      decision_time: new Date().toISOString(),
    },
    opts: { chopApplied: choppy, minConviction: MIN_SURFACE_CONVICTION },
  }));

  // ── V11 M3: push fan-out ──────────────────────────────────────────────────
  // Gated on `changed`, NOT on `stale`. A stale re-write is the same verdict the
  // user was already told about 30 minutes ago — pushing it again would buzz
  // their phone every half hour for a signal they've already seen, which is how
  // people turn notifications off and never turn them back on.
  //
  // V13.6: fan out both FIRE and HOLD when changed — sendSignalPush filters PER
  // DEVICE by notify_level (FIRE always; HOLD only for devices set to 'all') and
  // by conviction. This replaces the old hardcoded FIRE-only gate, which silently
  // dropped everything else with no way for a user to opt into more.
  if (willPush) {
    try {
      const res = await sendSignalPush({
        asset_class: assetClass, symbol, interval,
        status: sig.status, direction: sig.direction, conviction: sig.conviction, plan: sig.plan,
      });
      buckets.pushed.push(`${symbol}:${res.sent}sent${res.pruned ? `/${res.pruned}pruned` : ""}`);
    } catch (e) {
      // A push failure must never fail the scan — the signal is already written,
      // and the feed is the source of truth. Notifications are the bonus.
      buckets.pushFailed.push(`${symbol}:${String(e.message).slice(0, 60)}`);
    }
  }
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const authz = request.headers.get("authorization") || "";
  if (!secret || authz !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!serverConfigured()) {
    return Response.json({ error: "Supabase not configured — signal feed disabled" }, { status: 503 });
  }
  const admin = getAdmin();
  const buckets = { written: [], skipped: [], failed: [], pushed: [], pushFailed: [], demoted: [], halted: [], labEmits: [] };

  // V13.5: build the aggregate self-learning snapshot ONCE per run (reading the
  // shared signals table's own won/lost lifecycle), then every writeIfChanged
  // validates its FIRE against it. Best-effort — if it fails, the gate no-ops.
  let stats = { available: false };
  try { stats = await buildSignalStats(admin, { lookbackDays: 30 }); }
  catch { /* aggregate gate simply doesn't apply this run */ }

  // V13.6: read the broad-market chop verdict ONCE. If the market is in whipsaw,
  // every FIRE this run is demoted to HOLD (see writeIfChanged) — the bot halts
  // new actionable signals rather than feeding the user into a chop-shredder.
  let regime = { choppy: false };
  try { regime = await marketRegime(); }
  catch { /* if regime is unknowable, don't halt */ }
  const choppy = Boolean(regime.choppy);

  // V10.3: the day's most-actives are PINNED into every run (movers are never
  // missed); the rest of the run is a rotating slice of the full universe.
  const mostActives = await fetchMostActives(16);
  const cursor = clockCursor();

  // Guard the 60s function budget: if we're running out of time, stop cleanly and
  // let the next run pick up the next slice, rather than getting killed mid-write.
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 50_000;
  let ranOutOfTime = false;
  const timeLeft = () => Date.now() - startedAt <= TIME_BUDGET_MS;

  // ── INTRADAY (existing V10.3 rotation) — "daily" feed bucket ────────────────
  for (const assetClass of ["futures", "options"]) {
    const interval = MODE_DEFAULT_INTERVAL[assetClass];
    const universe = scanUniverse(assetClass, assetClass === "options" ? mostActives : [], cursor);
    for (const symbol of universe) {
      if (!timeLeft()) { ranOutOfTime = true; break; }
      try { await writeIfChanged(admin, { assetClass, symbol, interval }, buckets, stats, choppy); }
      catch (e) { buckets.failed.push({ symbol: `${assetClass}:${symbol}`, error: String(e.message) }); }
    }
    if (ranOutOfTime) break;
  }

  // ── PORTFOLIO-HORIZON SWEEPS (V10.5) — weekly / monthly / yearly buckets ────
  // Each runs across BOTH asset classes so every cadence the picker offers can
  // actually be populated. Cadence gating by wall clock keeps the cost sane:
  // a long-horizon setup does not change on a 2-minute timescale.
  const portfolio = { weekly: false, monthly: false, yearly: false };
  const sweep = async (interval, flag) => {
    for (const assetClass of ["futures", "options", "equity"]) {
      // V13.5 interval caps: a sweep only runs for asset classes whose max
      // timeframe permits it — futures (max 1 day) get NO multi-day sweeps,
      // options (max 2 weeks) get the weekly "1d" sweep but not month/year,
      // equity gets all of them. Single source of truth: intervalAllowed().
      if (!intervalAllowed(assetClass, interval)) continue;
      for (const symbol of PORTFOLIO_UNIVERSE[assetClass]) {
        if (!timeLeft()) { ranOutOfTime = true; return; }
        try { await writeIfChanged(admin, { assetClass, symbol, interval }, buckets, stats, choppy); portfolio[flag] = true; }
        catch (e) { buckets.failed.push({ symbol: `${assetClass}:${symbol}:${interval}`, error: String(e.message) }); }
      }
    }
  };

  // Weekly bucket ("1d"): cheap daily candles, safe to run every call. Options is
  // the only class still allowed at 1d (equity dropped it with the V14 weekly-
  // horizon removal; futures never permitted it).
  if (!ranOutOfTime) await sweep("1d", "weekly");
  // ── V14: INVEST RUNS CONTINUOUSLY, 24/7 ────────────────────────────────────
  // These were gated to every-15-min / once-a-day-at-13:00-UTC, which (combined
  // with the once-daily Vercel cron) meant the long-term feed could go a full day
  // with nothing written and sit empty. INVEST is now swept on every run, the
  // same as the futures side. It's cheap: PORTFOLIO_UNIVERSE is ~12 large caps on
  // weekly/monthly candles, and writeIfChanged still dedups so an unchanged
  // verdict never writes a row.
  if (!ranOutOfTime) await sweep("1w", "monthly");
  if (!ranOutOfTime) await sweep("1mo", "yearly");

  // ── V12 LIFECYCLE: grade open signals → won/lost/invalidated ────────────────
  // Runs after writes so a signal generated this same tick can be superseded in
  // the same pass. No-ops safely until migration 006 adds the state column.
  let lifecycle = { skipped: "no-time" };
  if (!ranOutOfTime) {
    try { lifecycle = await gradeSignalLifecycle(admin); }
    catch (e) { lifecycle = { error: String(e.message) }; }
  }

  // Awaited once, after every write is done -- never per-signal. Each emit is
  // already bounded by its own 2.5s abort, so this cannot hang the run.
  const labSettled = await Promise.allSettled(buckets.labEmits);
  const labSent = labSettled.filter((r) => r.status === "fulfilled" && r.value === true).length;

  return Response.json({
    ok: true,
    written: buckets.written, skipped: buckets.skipped, failed: buckets.failed,
    // V13.5: FIRE→HOLD demotions from the aggregate self-learning gate + how much
    // history it had to work with, so the sync is auditable.
    demoted: buckets.demoted,
    aggregateStats: { available: stats.available, sampleSize: stats.sampleSize ?? 0, overallWinRate: stats.overall?.winRate ?? null },
    // V13.6: chop halt — the market-regime verdict + which FIREs were suppressed.
    marketRegime: { choppy: regime.choppy, ci: regime.ci ?? null, label: regime.label ?? null },
    halted: buckets.halted,
    lifecycle,
    mostActives: mostActives.length,
    portfolioSweeps: portfolio,
    // Rotation telemetry — makes coverage auditable instead of a black box.
    rotation: {
      cursor,
      bucketSize: BUCKET_SIZE,
      universeSize: FULL_UNIVERSE.length,
      runsPerFullSweep: rotationLength(),
      sweepMinutes: rotationLength() * (RUN_MS / 60000),
      ranOutOfTime,
    },
    // Bridge telemetry. Without this a silent bridge and a working one are
    // indistinguishable from the outside, and "no rows in the Lab" says
    // nothing about which end is at fault.
    lab: {
      enabled: labEnabled(),
      attempted: buckets.labEmits.length,
      sent: labSent,
      failed: buckets.labEmits.length - labSent,
    },
    elapsedMs: Date.now() - startedAt,
    at: new Date().toISOString(),
  });
}
