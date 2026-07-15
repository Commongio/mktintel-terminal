// app/api/cron/generate-signals/route.js — V9 server-side signal feed.
// Runs the engine for every tracked symbol in both modes and writes
// STANDARDIZED signals to Supabase (same feed for every subscriber —
// deliberately non-personalized; see PLAN_V9.md compliance section).
//
// Trigger: Vercel Cron (vercel.json) or any scheduler hitting
//   GET /api/cron/generate-signals  with  Authorization: Bearer ${CRON_SECRET}
// Dedup: a new row is only written when status/direction changes or the
// last row for that symbol is older than 30 minutes.
import { runSignalEngine, MODE_DEFAULT_INTERVAL, ENGINE_VERSION } from "../../../../lib/signalEngine";
import { getAdmin, serverConfigured } from "../../../../lib/supabaseServer";
import { scanUniverse, fetchMostActives, FULL_UNIVERSE, BUCKET_SIZE, ROTATING_PER_RUN, rotationLength } from "../../../../lib/universe";

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
  const written = [], skipped = [], failed = [];

  // V10.3: the day's most-actives are PINNED into every run (movers are never
  // missed); the rest of the run is a rotating slice of the full universe.
  const mostActives = await fetchMostActives(16);
  const cursor = clockCursor();

  // Guard the 60s function budget: if we're running out of time, stop cleanly and
  // let the next run pick up the next slice, rather than getting killed mid-write.
  const startedAt = Date.now();
  const TIME_BUDGET_MS = 50_000;
  let ranOutOfTime = false;

  for (const assetClass of ["futures", "options"]) {
    const interval = MODE_DEFAULT_INTERVAL[assetClass];
    const universe = scanUniverse(assetClass, assetClass === "options" ? mostActives : [], cursor);
    for (const symbol of universe) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { ranOutOfTime = true; break; }
      try {
        const sig = await runSignalEngine({ assetClass, symbol, interval });

        const { data: last } = await admin.from("signals")
          .select("status,direction,created_at")
          .eq("asset_class", assetClass).eq("symbol", symbol).eq("interval", interval)
          .order("created_at", { ascending: false }).limit(1).maybeSingle();

        const changed = !last || last.status !== sig.status || last.direction !== sig.direction;
        const stale = last && Date.now() - new Date(last.created_at).getTime() > 30 * 60_000;
        if (!changed && !stale) { skipped.push(`${assetClass}:${symbol}`); continue; }

        const { error } = await admin.from("signals").insert({
          asset_class: assetClass, symbol, interval,
          status: sig.status, direction: sig.direction, conviction: sig.conviction,
          plan: sig.plan, agents: sig.agents, engine_version: ENGINE_VERSION,
        });
        if (error) failed.push({ symbol, error: error.message });
        else written.push(`${assetClass}:${symbol}:${sig.status}`);
      } catch (e) {
        failed.push({ symbol: `${assetClass}:${symbol}`, error: String(e.message) });
      }
    }
    if (ranOutOfTime) break;
  }

  return Response.json({
    ok: true,
    written, skipped, failed,
    mostActives: mostActives.length,
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
