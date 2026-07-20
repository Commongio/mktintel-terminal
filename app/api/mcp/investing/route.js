// app/api/mcp/investing/route.js — V12 Phase 2: Investing.com macro & econ-events adapter.
//
// GET  = preview: fetch the economic calendar (via Finnhub), interrogate each
//        event for macro sentiment/impact, return scored items. No DB writes.
// POST = ingest: accept pushed events in the documented Investing shape
//        { source, event, impact, details, timestamp }, interrogate, and (with
//        persist) route any that resolve to a tradeable directional signal.
//
// NOTE ON SCOPE: most economic-calendar entries are non-directional (a scheduled
// CPI print has no ticker/direction until the surprise lands), so they surface as
// high macro-impact / pulse candidates but are NOT written to the feed as trade
// signals. That's deliberate — we don't fabricate a ticker+direction from a
// calendar row. See lib/newsIntelligence conviction calibration.
import { fetchInvesting, runAdapter } from "../../../../lib/mcpFeed";
import { normalizeInvesting } from "../../../../lib/newsIntelligence";

export const maxDuration = 30;

export async function GET(request) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return Response.json({ error: "FINNHUB_API_KEY not set" }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const threshold = clampThreshold(searchParams.get("threshold"));
  const vix = numOrNull(searchParams.get("vix"));
  try {
    const items = await fetchInvesting(apiKey);
    const out = await runAdapter({ items, threshold, vix, persist: false });
    return Response.json({ source: "Investing.com", threshold, ...out, fetchedAt: Date.now() });
  } catch (e) {
    // Premium-tier calendar → honest 503, not a crash.
    const status = e.degraded ? 503 : 502;
    return Response.json({
      error: e.degraded
        ? "Economic calendar isn't available on the current Finnhub plan. Push events to this endpoint (POST) instead, or upgrade the data plan."
        : `Investing feed unavailable: ${e.message}`,
      source: "Investing.com", degraded: !!e.degraded,
    }, { status });
  }
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const rawItems = Array.isArray(body.items) ? body.items : (body.event || body.headline ? [body] : []);
  if (!rawItems.length) return Response.json({ error: "No items provided" }, { status: 400 });

  const threshold = clampThreshold(body.threshold);
  const items = rawItems.map(normalizeInvesting);
  const out = await runAdapter({
    items, threshold, vix: numOrNull(body.vix),
    tradeHistory: body.tradeHistory, persist: body.persist !== false,
  });
  return Response.json({ source: "Investing.com", threshold, ...out, receivedAt: Date.now() });
}

function clampThreshold(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(45, Math.min(95, n)) : 65; }
function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
