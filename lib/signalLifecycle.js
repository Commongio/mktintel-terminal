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
import { sendDrawdownPush } from "./push";
import { emitOutcome } from "./labEmitter";

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export async function gradeSignalLifecycle(admin) {
  // Pull open signals. If `state` doesn't exist yet, bail cleanly.
  const BASE_COLS = "id,symbol,asset_class,interval,direction,plan,created_at,state,setup_id";
  let { data: active, error } = await admin
    .from("signals")
    .select(`${BASE_COLS},went_red_at`)
    .eq("state", "active")
    .limit(500);
  // 42703 here is ambiguous: either `state` (migration 006) or `went_red_at`
  // (migration 010) is missing. Retry without the V14 column — if THAT works,
  // only 010 is missing and everything except drawdown alerting still runs.
  if (error?.code === "42703") {
    ({ data: active, error } = await admin
      .from("signals").select(BASE_COLS).eq("state", "active").limit(500));
    if (error) {
      if (error.code === "42703") return { skipped: "no-state-column", won: 0, lost: 0, invalidated: 0 };
      return { error: error.message, won: 0, lost: 0, invalidated: 0 };
    }
  } else if (error) {
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
  // Which signal replaced which. Supersession is the majority outcome here --
  // roughly 25 invalidations per resolution -- and it has been leaving no trace
  // of what displaced what, so the largest category of outcome was also the
  // least studiable.
  const supersededBy = new Map();
  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    group.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // newest first
    const winner = group[0];
    for (const older of group.slice(1)) {
      invalidatedIds.push(older.id);
      supersededBy.set(older.id, String(winner.id));
    }
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

  // ── 2b. Excursions, before grading ──────────────────────────────────────────
  // Read the running extremes recorded on previous passes. A separate query,
  // allowed to fail: these columns arrive with migration 015, and grading must
  // keep working on a database that has not run it. A failure here costs one
  // column of analysis; a failure that reached the grader costs the product.
  const prior = new Map();
  let excursionsAvailable = true;
  try {
    const { data, error } = await admin
      .from("signals").select("id,mae_r,mfe_r,bars_seen")
      .in("id", gradable.map((s) => s.id));
    if (error) excursionsAvailable = false;
    else for (const r of data ?? []) prior.set(r.id, r);
  } catch { excursionsAvailable = false; }

  const round4 = (v) => Math.round(v * 10000) / 10000;
  const excursion = new Map();   // id -> { mae_r, mfe_r, bars_seen }

  if (excursionsAvailable) {
    for (const s of gradable) {
      const px = priceBy.get(s.symbol);
      if (!isNum(px)) continue;
      const { entry, stop } = s.plan;
      if (!isNum(entry) || !isNum(stop)) continue;
      const R = Math.abs(entry - stop);
      if (!(R > 0)) continue;

      // In R, so a 0.4R drawdown means the same thing on NG as on XOM.
      const forR = s.direction === "LONG" ? (px - entry) / R : (entry - px) / R;
      const was = prior.get(s.id) ?? {};
      excursion.set(s.id, {
        mae_r: round4(Math.max(Number(was.mae_r) || 0, -forR, 0)),
        mfe_r: round4(Math.max(Number(was.mfe_r) || 0, forR, 0)),
        bars_seen: (Number(was.bars_seen) || 0) + 1,
      });
    }
  }

  const wonIds = [], lostIds = [];
  const ambiguousIds = [];
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

    // This grader sees one spot price every five minutes and tests t1 BEFORE
    // the stop, so a trade that stopped out and then rallied records as a win.
    // It cannot see that from the price in front of it -- but the excursions
    // recorded on earlier passes can: a signal grading `won` whose MAE already
    // reached 1R was at its stop first. Two observations in sequence, not an
    // inference.
    //
    // Flagged, never re-graded. Changing the verdict would rewrite history from
    // a reading taken at an unknown moment between scans; recording that the
    // verdict is unreliable is a claim the data actually supports.
    const e = excursion.get(s.id);
    if (terminal && e) {
      if (terminal === "won" && e.mae_r >= 1.0) ambiguousIds.push(s.id);
      else if (terminal === "lost" && e.mfe_r >= 1.5) ambiguousIds.push(s.id);
    }
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

  // ── 3b. Persist the learning columns ────────────────────────────────────────
  // Entirely after the state transitions and entirely non-fatal. Grading is the
  // product; this is bookkeeping for the Lab, and it must never be able to take
  // the former down.
  //
  // Only rows whose extremes actually moved are written. Most passes leave most
  // signals untouched, and writing all of them every five minutes would be
  // hundreds of pointless updates against a table the UI reads live.
  if (excursionsAvailable && excursion.size) {
    const changed = [...excursion.entries()].filter(([id, e]) => {
      const was = prior.get(id) ?? {};
      return e.mae_r !== Number(was.mae_r ?? -1)
          || e.mfe_r !== Number(was.mfe_r ?? -1)
          || e.bars_seen !== Number(was.bars_seen ?? -1);
    });
    const ambiguous = new Set(ambiguousIds);
    await Promise.allSettled(changed.map(([id, e]) =>
      admin.from("signals").update({
        ...e,
        ...(ambiguous.has(id) ? { path_ambiguous: true } : {}),
      }).eq("id", id)
    ));
  }

  if (supersededBy.size) {
    await Promise.allSettled([...supersededBy].map(([id, by]) =>
      admin.from("signals").update({ superseded_by: by }).eq("id", id)
    ));
  }

  // ── Mirror every terminal transition to the Lab ────────────────────────────
  // Fire-and-forget, exactly like the signal emitter: emitOutcome is total and
  // cannot throw into the grading path. Graded here means graded by the ENGINE,
  // so mode is 'engine' -- the admin override route reports its own as
  // 'manual', and the two must stay distinguishable because manual grading is
  // discretionary and correlates with judgement about which signals looked bad.
  const byId = new Map(gradable.map((s) => [s.id, s]));
  const mirror = (ids, state) => ids.map((id) => emitOutcome({
    signalId: id,
    setupId: byId.get(id)?.setup_id ?? null,
    state,
    plan: byId.get(id)?.plan ?? null,
    resolvedAt: now,
    mode: "engine",
    reason: state === "won" ? "t1_hit" : state === "lost" ? "stop_hit" : "superseded",
    // What the trade actually did, not just how it ended. Without these the
    // Lab receives one bit per outcome, which cannot support calibration at
    // any realistic sample size.
    excursion: excursion.get(id) ?? null,
    pathAmbiguous: ambiguousIds.includes(id) ? true : null,
    supersededBy: supersededBy.get(id) ?? null,
    priceAtResolution: priceBy.get(byId.get(id)?.symbol) ?? null,
  }));
  await Promise.allSettled([
    ...mirror(wonIds, "won"),
    ...mirror(lostIds, "lost"),
    ...mirror(invalidatedIds, "invalidated"),
  ]);

  // ── 4. V14: LONG-TERM DRAWDOWN ALERT ───────────────────────────────────────
  // An INVEST position is held for months, so "it's underwater" is news the user
  // needs immediately — it won't show up as a stop-out for a long time, if ever.
  // Fires ONCE per signal: went_red_at is the marker, so the every-few-minutes
  // grader can't turn a bad week into a stream of identical notifications.
  const wentRed = await alertLongTermDrawdown(admin, {
    live, priceBy, resolvedIds: new Set([...wonIds, ...lostIds, ...invalidatedIds]), now,
  });

  return {
    graded: gradable.length,
    won: wonIds.length,
    lost: lostIds.length,
    invalidated: invalidatedIds.length,
    wentRed,
  };
}

// How far a long-term position must be underwater before it's worth a push.
// Small wobble is normal on a monthly/yearly hold; 2% is a real move against you
// without being so tight that every position alerts on day one.
const RED_THRESHOLD_PCT = 2;

async function alertLongTermDrawdown(admin, { live, priceBy, resolvedIds, now }) {
  const candidates = live.filter((s) =>
    s.asset_class === "equity" &&          // long-horizon class only
    !resolvedIds.has(s.id) &&              // still open
    !s.went_red_at &&                      // not already alerted
    s.direction !== "NEUTRAL" &&
    isNum(s.plan?.entry)
  );
  if (!candidates.length) return 0;

  const nowRed = [];
  for (const s of candidates) {
    const px = priceBy.get(s.symbol);
    if (!isNum(px)) continue;
    const entry = s.plan.entry;
    // Percent move AGAINST the position, whichever way it was taken.
    const againstPct = s.direction === "LONG"
      ? ((entry - px) / entry) * 100
      : ((px - entry) / entry) * 100;
    if (againstPct >= RED_THRESHOLD_PCT) nowRed.push({ sig: s, px, againstPct });
  }
  if (!nowRed.length) return 0;

  // Mark first so a push failure can't cause a repeat alert on the next run.
  const { error } = await admin.from("signals")
    .update({ went_red_at: now })
    .in("id", nowRed.map((x) => x.sig.id));
  // 42703 = migration 010 hasn't run; skip alerting rather than failing the grade.
  if (error) return 0;

  for (const { sig, px, againstPct } of nowRed) {
    try {
      await sendDrawdownPush({
        asset_class: sig.asset_class, symbol: sig.symbol, interval: sig.interval,
        direction: sig.direction, entry: sig.plan.entry, price: px,
        downPct: Number(againstPct.toFixed(1)),
      });
    } catch { /* the state is already marked; a failed push must not retry-storm */ }
  }
  return nowRed.length;
}
