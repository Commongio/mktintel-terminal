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
import { getAdmin, serverConfigured, insertSignal } from "../../../../lib/supabaseServer";
import { sendSignalPush } from "../../../../lib/push";
import { gradeSignalLifecycle } from "../../../../lib/signalLifecycle";
import { buildSignalStats, applyAggregateGate } from "../../../../lib/signalStats";
import { scanUniverse, fetchMostActives, FULL_UNIVERSE, BUCKET_SIZE, ROTATING_PER_RUN, rotationLength, CURATED, intervalAllowed } from "../../../../lib/universe";

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

// Roughly-every-N-minutes gate using wall-clock minutes (no state to persist).
const everyNMinutes = (n) => new Date().getMinutes() % n < 2;

async function writeIfChanged(admin, { assetClass, symbol, interval }, buckets, stats) {
  const raw = await runSignalEngine({ assetClass, symbol, interval });

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

  const { data: last } = await admin.from("signals")
    .select("status,direction,created_at")
    .eq("asset_class", assetClass).eq("symbol", symbol).eq("interval", interval)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  const changed = !last || last.status !== sig.status || last.direction !== sig.direction;
  const stale = last && Date.now() - new Date(last.created_at).getTime() > 30 * 60_000;
  if (!changed && !stale) { buckets.skipped.push(`${assetClass}:${symbol}:${interval}`); return; }

  const { error } = await insertSignal(admin, {
    asset_class: assetClass, symbol, interval,
    status: sig.status, direction: sig.direction, conviction: sig.conviction,
    plan: sig.plan, agents: sig.agents, engine_version: ENGINE_VERSION,
    source: "cron",
  });
  if (error) { buckets.failed.push({ symbol: `${assetClass}:${symbol}:${interval}`, error: error.message }); return; }
  buckets.written.push(`${assetClass}:${symbol}:${interval}:${sig.status}`);

  // ── V11 M3: push fan-out ──────────────────────────────────────────────────
  // Gated on `changed`, NOT on `stale`. A stale re-write is the same verdict the
  // user was already told about 30 minutes ago — pushing it again would buzz
  // their phone every half hour for a signal they've already seen, which is how
  // people turn notifications off and never turn them back on.
  //
  // FIRE only. HOLD/SCAN are context, not a call to action, and don't earn an
  // interruption. Per-device conviction filtering happens in sendSignalPush.
  if (sig.status === "FIRE" && changed) {
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
  const buckets = { written: [], skipped: [], failed: [], pushed: [], pushFailed: [], demoted: [] };

  // V13.5: build the aggregate self-learning snapshot ONCE per run (reading the
  // shared signals table's own won/lost lifecycle), then every writeIfChanged
  // validates its FIRE against it. Best-effort — if it fails, the gate no-ops.
  let stats = { available: false };
  try { stats = await buildSignalStats(admin, { lookbackDays: 30 }); }
  catch { /* aggregate gate simply doesn't apply this run */ }

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
      try { await writeIfChanged(admin, { assetClass, symbol, interval }, buckets, stats); }
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
        try { await writeIfChanged(admin, { assetClass, symbol, interval }, buckets, stats); portfolio[flag] = true; }
        catch (e) { buckets.failed.push({ symbol: `${assetClass}:${symbol}:${interval}`, error: String(e.message) }); }
      }
    }
  };

  // Weekly bucket ("1d"): cheap daily candles, safe to run every call.
  if (!ranOutOfTime) await sweep("1d", "weekly");
  // Monthly bucket ("1w"): swing/position setups don't need 2-min freshness.
  if (!ranOutOfTime && everyNMinutes(15)) await sweep("1w", "monthly");
  // Yearly bucket ("1mo"): long-horizon — once a day, near the open, is plenty.
  if (!ranOutOfTime && new Date().getUTCHours() === 13 && everyNMinutes(2)) await sweep("1mo", "yearly");

  // ── V12 LIFECYCLE: grade open signals → won/lost/invalidated ────────────────
  // Runs after writes so a signal generated this same tick can be superseded in
  // the same pass. No-ops safely until migration 006 adds the state column.
  let lifecycle = { skipped: "no-time" };
  if (!ranOutOfTime) {
    try { lifecycle = await gradeSignalLifecycle(admin); }
    catch (e) { lifecycle = { error: String(e.message) }; }
  }

  return Response.json({
    ok: true,
    written: buckets.written, skipped: buckets.skipped, failed: buckets.failed,
    // V13.5: FIRE→HOLD demotions from the aggregate self-learning gate + how much
    // history it had to work with, so the sync is auditable.
    demoted: buckets.demoted,
    aggregateStats: { available: stats.available, sampleSize: stats.sampleSize ?? 0, overallWinRate: stats.overall?.winRate ?? null },
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
    elapsedMs: Date.now() - startedAt,
    at: new Date().toISOString(),
  });
}
