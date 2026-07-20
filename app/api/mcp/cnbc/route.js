// app/api/mcp/cnbc/route.js — V12 Phase 2: CNBC sentiment & breaking-headlines adapter.
//
// GET  = preview: fetch CNBC-sourced market news (via Finnhub), interrogate, and
//        return scored items + feed/pulse flags. No DB writes on a read.
// POST = ingest: accept pushed items in the documented CNBC shape
//        { source, headline, body, sector, timestamp }, interrogate, and (with
//        persist) route feed-worthy tagged signals into the Signal Feed. This is
//        the path a scheduler/worker calls.
//
// Lightweight by design — a handful of items per call — so it does NOT violate
// PLAN_MCP_AGENTS.md's "don't run the heavy continuous scanner inside a Vercel
// function". The always-on never-miss worker remains the eventual home.
import { fetchCnbc, runAdapter } from "../../../../lib/mcpFeed";
import { normalizeCnbc } from "../../../../lib/newsIntelligence";

export const maxDuration = 30;

export async function GET(request) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return Response.json({ error: "FINNHUB_API_KEY not set" }, { status: 500 });
  const { searchParams } = new URL(request.url);
  const threshold = clampThreshold(searchParams.get("threshold"));
  const vix = numOrNull(searchParams.get("vix"));
  try {
    const items = await fetchCnbc(apiKey);
    const out = await runAdapter({ items, threshold, vix, persist: false });
    return Response.json({ source: "CNBC", threshold, ...out, fetchedAt: Date.now() });
  } catch (e) {
    return Response.json({ error: `CNBC feed unavailable: ${e.message}`, source: "CNBC" }, { status: 502 });
  }
}

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  const rawItems = Array.isArray(body.items) ? body.items : (body.headline ? [body] : []);
  if (!rawItems.length) return Response.json({ error: "No items provided" }, { status: 400 });

  const threshold = clampThreshold(body.threshold);
  const items = rawItems.map(normalizeCnbc);
  const out = await runAdapter({
    items, threshold, vix: numOrNull(body.vix),
    tradeHistory: body.tradeHistory, persist: body.persist !== false, // ingest defaults to persisting
  });
  return Response.json({ source: "CNBC", threshold, ...out, receivedAt: Date.now() });
}

function clampThreshold(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(45, Math.min(95, n)) : 65; }
function numOrNull(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
