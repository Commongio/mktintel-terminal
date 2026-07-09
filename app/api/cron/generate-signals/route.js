// app/api/cron/generate-signals/route.js — V9 server-side signal feed.
// Runs the engine for every tracked symbol in both modes and writes
// STANDARDIZED signals to Supabase (same feed for every subscriber —
// deliberately non-personalized; see PLAN_V9.md compliance section).
//
// Trigger: Vercel Cron (vercel.json) or any scheduler hitting
//   GET /api/cron/generate-signals  with  Authorization: Bearer ${CRON_SECRET}
// Dedup: a new row is only written when status/direction changes or the
// last row for that symbol is older than 30 minutes.
import { runSignalEngine, MODE_SYMBOLS, MODE_DEFAULT_INTERVAL, ENGINE_VERSION } from "../../../../lib/signalEngine";
import { getAdmin, serverConfigured } from "../../../../lib/supabaseServer";

export const maxDuration = 60;

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

  for (const assetClass of ["futures", "options"]) {
    const interval = MODE_DEFAULT_INTERVAL[assetClass];
    for (const symbol of MODE_SYMBOLS[assetClass]) {
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
  }

  return Response.json({ ok: true, written, skipped, failed, at: new Date().toISOString() });
}
