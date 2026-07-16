// app/api/multi-agent-signal/route.js
// Thin HTTP wrapper around the shared engine core (lib/signalEngine).
// ?assetClass=futures|options runs genuinely different agent stacks.
//
// V10.6: on-demand scans PERSIST to the signals table when strong enough.
// Before this, a user could search a ticker (e.g. MU), get a great signal in the
// scanner panel, and it would never appear in the signal feed — it lived and died
// in that one panel. Now any searched signal that clears the user's conviction
// threshold is written like a cron signal (same dedup), so the feed catches it
// and it survives a reload.
import { runSignalEngine, ENGINE_VERSION } from "../../../lib/signalEngine";
import { getAdmin, serverConfigured, insertSignal } from "../../../lib/supabaseServer";

async function persistIfStrong(sig, { assetClass, symbol, interval, threshold }) {
  if (!serverConfigured()) return { saved: false, why: "no-db" };
  if ((sig.conviction ?? 0) < threshold) return { saved: false, why: "below-threshold" };
  if (sig.status !== "FIRE" && sig.status !== "HOLD") return { saved: false, why: "no-setup" };
  try {
    const admin = getAdmin();
    // Same dedup rule as the cron: only write when the verdict changed or the
    // last row is stale — otherwise repeated REFRESH clicks would spam the feed.
    const { data: last } = await admin.from("signals")
      .select("status,direction,created_at")
      .eq("asset_class", assetClass).eq("symbol", symbol).eq("interval", interval)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const changed = !last || last.status !== sig.status || last.direction !== sig.direction;
    const stale = last && Date.now() - new Date(last.created_at).getTime() > 30 * 60_000;
    if (!changed && !stale) return { saved: false, why: "duplicate" };

    const { error, degraded } = await insertSignal(admin, {
      asset_class: assetClass, symbol, interval,
      status: sig.status, direction: sig.direction, conviction: sig.conviction,
      plan: sig.plan, agents: sig.agents, engine_version: ENGINE_VERSION,
      source: "manual",
    });
    if (error) return { saved: false, why: error.message };
    // `degraded` = migration 003 hasn't run, so the row saved but WITHOUT its
    // manual tag — meaning the feed's tier filter can still hide it. Surfaced so
    // this shows up as a diagnosable state instead of a mystery missing signal.
    return degraded ? { saved: true, why: "saved-untagged-run-migration-003" } : { saved: true };
  } catch (e) {
    return { saved: false, why: String(e.message) };
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const assetClass = searchParams.get("assetClass") === "options" ? "options" : "futures";
  const symbol = (searchParams.get("symbol") || (assetClass === "options" ? "SPY" : "NQ")).toUpperCase();
  const interval = searchParams.get("interval") || undefined;
  const minConviction = searchParams.get("minConviction");
  const dailyLossUsed = searchParams.get("dailyLossUsed");
  const dailyLossLimit = searchParams.get("dailyLossLimit");

  try {
    const result = await runSignalEngine({
      assetClass, symbol, interval,
      propRules: {
        minConviction,
        dailyLossUsed: dailyLossUsed ? Number(dailyLossUsed) : null,
        dailyLossLimit: dailyLossLimit ? Number(dailyLossLimit) : null,
      },
    });
    // Persist gate: the user's own threshold, floored at the feed's 60% minimum
    // (below that the feed would filter it out anyway).
    const threshold = Math.max(60, Number(minConviction) || 65);
    const persisted = await persistIfStrong(result, { assetClass, symbol, interval: result.interval || interval || "15min", threshold });
    return Response.json({ ...result, persisted });
  } catch (err) {
    return Response.json({ error: String(err.message), symbol, assetClass }, { status: 502 });
  }
}
