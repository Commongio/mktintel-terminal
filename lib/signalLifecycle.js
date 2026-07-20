// lib/signalLifecycle.js — V12: server-side signal state machine.
//
// Runs inside the cron. Grades every ACTIVE signal against live price and moves
// it to a terminal state, so bot and terminal share ONE authoritative lifecycle
// (clients only read state; they never decide it). Deterministic — same
// principle as the risk gate. See vault: "V12 Signal lifecycle revision".
//
//   active → won         price reached the take-profit (plan.t1)
//   active → lost        price reached the stop (plan.stop)
//   active → invalidated a newer active signal supersedes it (same instrument,
//                        opposite/neutral direction) — the setup is gone
//
// Degrades safely if migration 006 hasn't run: the `state` select fails 42703 and
// the whole step no-ops, leaving the pre-lifecycle behavior intact.

import { getQuotes } from "./marketData";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export async function gradeSignalLifecycle(admin) {
  // Pull open signals. If `state` doesn't exist yet, bail cleanly.
  const { data: active, error } = await admin
    .from("signals")
    .select("id,symbol,asset_class,interval,direction,plan,created_at,state")
    .eq("state", "active")
    .limit(500);
  if (error) {
    if (error.code === "42703") return { skipped: "no-state-column", won: 0, lost: 0, invalidated: 0 };
    return { error: error.message, won: 0, lost: 0, invalidated: 0 };
  }
  if (!active?.length) return { won: 0, lost: 0, invalidated: 0, graded: 0 };

  // ── 1. Supersede-invalidation ───────────────────────────────────────────────
  // Group by instrument; the newest active row is the live one, older actives for
  // the same symbol|interval are stale setups → invalidated.
  const byKey = new Map();
  for (const s of active) {
    const k = `${s.symbol}|${s.interval}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(s);
  }
  const invalidatedIds = [];
  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    group.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // newest first
    for (const older of group.slice(1)) invalidatedIds.push(older.id);
  }

  // ── 2. Price-grade the remaining live signals (skip news rows w/o targets) ──
  const live = active.filter((s) => !invalidatedIds.includes(s.id));
  const gradable = live.filter((s) => s.plan && isNum(s.plan.stop) && isNum(s.plan.t1) && s.direction !== "NEUTRAL");
  const symbols = [...new Set(gradable.map((s) => s.symbol))];
  const priceBy = new Map();
  if (symbols.length) {
    try {
      const { data } = await getQuotes(symbols);
      for (const q of data) if (isNum(q.price)) priceBy.set(q.symbol, q.price);
    } catch { /* price feed down → leave signals active, grade next run */ }
  }

  const wonIds = [], lostIds = [];
  for (const s of gradable) {
    const px = priceBy.get(s.symbol);
    if (!isNum(px)) continue;
    const { stop, t1 } = s.plan;
    let terminal = null;
    if (s.direction === "LONG") {
      if (px >= t1) terminal = "won";
      else if (px <= stop) terminal = "lost";
    } else if (s.direction === "SHORT") {
      if (px <= t1) terminal = "won";
      else if (px >= stop) terminal = "lost";
    }
    if (terminal === "won") wonIds.push(s.id);
    else if (terminal === "lost") lostIds.push(s.id);
  }

  // ── 3. Persist state transitions ────────────────────────────────────────────
  const now = new Date().toISOString();
  const apply = async (ids, state) => {
    if (!ids.length) return;
    await admin.from("signals").update({ state, resolved_at: now }).in("id", ids);
  };
  await Promise.all([
    apply(wonIds, "won"),
    apply(lostIds, "lost"),
    apply(invalidatedIds, "invalidated"),
  ]);

  return {
    graded: gradable.length,
    won: wonIds.length,
    lost: lostIds.length,
    invalidated: invalidatedIds.length,
  };
}
