// app/api/news/aggregate/route.js — the merged timeline.
//
// Sits alongside /api/news rather than replacing it. That route is Finnhub-
// only and is wired into live surfaces; swapping its internals as part of
// adding sources would mean one change with two ways to fail.
//
// Usage:
//   /api/news/aggregate                     market + wire + filing + macro
//   /api/news/aggregate?symbol=NVDA         adds per-symbol company news
//   /api/news/aggregate?kinds=wire,filing   primary sources only
//   /api/news/aggregate?kinds=social        Reddit; OFF by default, see below
//   /api/news/aggregate?sort=time           chronological instead of ranked
//   /api/news/aggregate?health=1            source health only, no items
//
// Items ship with the same `impact` block /api/news attaches, from the same
// scorer, so a consumer cannot tell which route produced an item.

import { aggregate } from "../../../../lib/newsAggregator";
import { scoreNewsImpact } from "../../../../lib/newsImpact";
import { REJECTED } from "../../../../lib/newsSources";

export const revalidate = 0;

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim().toUpperCase() || null;
  const kinds = searchParams.get("kinds")?.split(",").map((k) => k.trim()).filter(Boolean) || null;
  const limit = Math.min(parseInt(searchParams.get("limit") || "60", 10) || 60, 200);
  const healthOnly = searchParams.get("health") === "1";
  const sort = searchParams.get("sort") === "time" ? "time" : "impact";

  try {
    // The scorer is injected rather than imported by the aggregator: ranking
    // and fetching stay separable, and the aggregator's tests do not have to
    // stand up the whole impact model to check ordering.
    const result = await aggregate({ symbol, kinds, limit, sort, score: (it) => scoreNewsImpact(it).score });

    if (healthOnly) {
      return Response.json({
        sources: result.sources, healthy: result.healthy, attempted: result.attempted,
        degraded: result.degraded, rejected: REJECTED, fetchedAt: result.fetchedAt,
      });
    }

    const items = result.items.map((it) => {
      const impact = scoreNewsImpact(it);
      return {
        ...it,
        // Source weight tilts the existing score without replacing it. A press
        // release from the issuer and a blog post about it are not the same
        // evidence, and the base scorer has no way to know which it is holding.
        impact: { ...impact, score: Math.max(2, Math.min(98, Math.round(impact.score * (it.weight ?? 1)))) },
      };
    });

    return Response.json({
      data: items,
      sources: result.sources,
      healthy: result.healthy,
      attempted: result.attempted,
      degraded: result.degraded,
      droppedNonEnglish: result.droppedNonEnglish,
      sort,
      // Said out loud so a thin feed is never mistaken for a quiet tape. Those
      // are opposite facts and they look identical from the item count alone.
      note: result.degraded
        ? `Degraded: ${result.healthy}/${result.attempted} sources responding. Coverage is incomplete.`
        : null,
      fetchedAt: result.fetchedAt,
    });
  } catch (err) {
    return Response.json({ error: "Aggregation failed", detail: String(err) }, { status: 502 });
  }
}
