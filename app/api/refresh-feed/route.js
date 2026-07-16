// app/api/refresh-feed/route.js — V10.5b: user-triggered feed refresh.
//
// Why this exists: the feed's ↻ button used to only re-SELECT the signals table.
// If the cron hadn't run since you last looked, you got the identical stale rows
// back and the button felt broken. This endpoint actually re-runs the engine for
// the active mode's core instruments and writes fresh verdicts, so ↻ means
// "check the market again now", which is what a refresh button should mean.
//
// Scope is deliberately SMALL (the mode's core symbols, not the full universe):
// this is user-triggered and unauthenticated-ish, so it must not become a way to
// hammer the free data tiers. The full-universe sweep stays with the cron.
//
// Conviction: the caller's own minConviction gates BOTH the engine's FIRE
// decision and whether we bother writing the row — so a refresh respects the
// user's slider rather than a hardcoded default.
import { runSignalEngine, MODE_SYMBOLS, MODE_DEFAULT_INTERVAL, ENGINE_VERSION } from "../../../lib/signalEngine";
import { getAdmin, serverConfigured, insertSignal } from "../../../lib/supabaseServer";

export const maxDuration = 60;

// Cheap in-process throttle. Serverless gives no shared state, so this is a
// best-effort guard against a user leaning on the button, not a security control.
const lastRun = new Map(); // assetClass -> ts
const COOLDOWN_MS = 20_000;

export async function POST(request) {
  if (!serverConfigured()) {
    return Response.json({ error: "Supabase not configured — signal feed disabled" }, { status: 503 });
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const assetClass = body.assetClass === "options" ? "options" : "futures";
  // Floor at the feed's own 60% minimum — below that the feed hides it anyway.
  const minConviction = Math.max(60, Math.min(95, Number(body.minConviction) || 65));

  const since = Date.now() - (lastRun.get(assetClass) || 0);
  if (since < COOLDOWN_MS) {
    return Response.json({ ok: true, throttled: true, retryInMs: COOLDOWN_MS - since, written: [], scanned: 0 });
  }
  lastRun.set(assetClass, Date.now());

  const admin = getAdmin();
  const interval = MODE_DEFAULT_INTERVAL[assetClass];
  const symbols = MODE_SYMBOLS[assetClass] || [];
  const written = [], skipped = [], failed = [];

  const startedAt = Date.now();
  const TIME_BUDGET_MS = 45_000;

  for (const symbol of symbols) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    try {
      const sig = await runSignalEngine({ assetClass, symbol, interval, propRules: { minConviction } });

      // Only strong, actionable verdicts earn a row — same bar the feed applies.
      if ((sig.conviction ?? 0) < minConviction || (sig.status !== "FIRE" && sig.status !== "HOLD")) {
        skipped.push(`${symbol}:${sig.status}:${sig.conviction}%`);
        continue;
      }

      // Same dedup rule as the cron: only write when the verdict actually changed
      // or the last row is stale, so repeat presses don't spam the feed.
      const { data: last } = await admin.from("signals")
        .select("status,direction,created_at")
        .eq("asset_class", assetClass).eq("symbol", symbol).eq("interval", interval)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const changed = !last || last.status !== sig.status || last.direction !== sig.direction;
      const stale = last && Date.now() - new Date(last.created_at).getTime() > 30 * 60_000;
      if (!changed && !stale) { skipped.push(`${symbol}:duplicate`); continue; }

      const { error } = await insertSignal(admin, {
        asset_class: assetClass, symbol, interval,
        status: sig.status, direction: sig.direction, conviction: sig.conviction,
        plan: sig.plan, agents: sig.agents, engine_version: ENGINE_VERSION,
        source: "refresh",
      });
      if (error) failed.push({ symbol, error: error.message });
      else written.push(`${symbol}:${sig.status}:${sig.conviction}%`);
    } catch (e) {
      failed.push({ symbol, error: String(e.message) });
    }
  }

  return Response.json({
    ok: true, assetClass, interval, minConviction,
    scanned: symbols.length, written, skipped, failed,
    elapsedMs: Date.now() - startedAt,
  });
}
