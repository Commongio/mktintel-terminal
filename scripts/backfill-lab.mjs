/**
 * Replay resolved KRONOS history into the Lab.
 *
 * WHY THIS EXISTS. The bridge only started emitting recently, so the Lab's
 * corpus begins there — while KRONOS's own tables hold months of signals that
 * already reached a terminal state. The Critic refuses to speak until at least
 * 10 signals have resolved and at least 3 of them lost, and KRONOS resolves
 * roughly 33 per week against ~830 superseded. Waiting for the Lab to
 * accumulate that on its own means days of silence over history that already
 * exists.
 *
 * WHAT IT DOES NOT DO. It does not smuggle in an out-of-sample result. Every
 * replayed event arrives more than five minutes after its decision time, so
 * the Lab's envelope check flags it `backfilled`, quarantines it with class
 * 'backfill', and marks the signal row. That is the intended path, not a
 * side effect: this data is IN-SAMPLE by construction and the Critic is shown
 * that it is. Scoring is unaffected either way — an approved policy is
 * evaluated only on signals after `eval_data_floor`, which is set to
 * max(derived_through, approved_at), i.e. now.
 *
 * WHAT IT REFUSES. A row it cannot honestly timestamp. If a signal has no
 * resolution time, inventing one would put a fabricated interval into a
 * database whose entire purpose is detecting fabricated intervals. Those rows
 * are skipped and counted.
 *
 * Usage:
 *   node scripts/backfill-lab.mjs --dry-run
 *   node scripts/backfill-lab.mjs --limit 200
 *
 * Reads .env.local automatically, so the values Vercel holds work locally too:
 * NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KRONOS_LAB_URL,
 * KRONOS_LAB_HMAC_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { buildSignalPayload, emitOutcome, setupIdFor, labEnabled } from "../lib/labEmitter.js";
// The contract is vendored at lib/labContract, not resolved from the Lab's
// workspace -- this repo deploys on its own and cannot reach across to it.
import { buildEnvelope } from "../lib/labContract/envelope.js";

// Next loads .env.local for you; a bare `node` run does not. Without this the
// script reports "missing SUPABASE_URL" on a machine where everything is
// configured, which sends you looking in the wrong place.
try { process.loadEnvFile(".env.local"); } catch { /* absent, or already in env */ }

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || 400;
// Terminal states only. `active` has not resolved and `invalidated` carries no
// predicate truth value, so replaying either adds rows the Critic cannot use
// for outcome analysis and inflates the coverage denominator for nothing.
const STATES = ["won", "lost"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Accepts any of several names, so a rename upstream is not a puzzle here. */
function must(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  console.error(`missing ${names.join(" or ")} — set it in .env.local`);
  process.exit(1);
}

async function main() {
  if (!labEnabled() && !DRY) {
    console.error("KRONOS_LAB_URL / KRONOS_LAB_HMAC_KEY are unset — the emitter is inert.");
    process.exit(1);
  }

  const db = createClient(
    // The app uses NEXT_PUBLIC_SUPABASE_URL; accept the bare name too.
    must("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"),
    must("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_SERVICE_KEY"),
    { auth: { persistSession: false } },
  );

  const { data: rows, error } = await db
    .from("signals")
    .select("*")
    .in("state", STATES)
    .order("created_at", { ascending: true })
    .limit(LIMIT);

  if (error) {
    console.error(`query failed: ${error.message}`);
    process.exit(1);
  }
  if (!rows?.length) {
    console.log("nothing to replay — no signals in a terminal state.");
    return;
  }

  console.log(`${rows.length} resolved signal(s) found. ${DRY ? "DRY RUN — nothing will be sent." : ""}`);

  const stats = { sent: 0, outcomes: 0, skipped_no_time: 0, skipped_no_geometry: 0, failed: 0 };
  const seenFamily = new Map();

  for (const row of rows) {
    const decisionTime = row.created_at;
    // graded_at is the honest resolution time (migration 013). Without it
    // there is no defensible answer, and a guessed one would put a fabricated
    // interval into the one database built to detect fabricated intervals.
    const resolvedAt = row.graded_at ?? null;

    if (!decisionTime || !resolvedAt) { stats.skipped_no_time++; continue; }
    if (Date.parse(resolvedAt) < Date.parse(decisionTime)) { stats.skipped_no_time++; continue; }
    // Won/lost is decided by comparing price to t1 and stop, so a row without
    // them cannot have been graded honestly whatever its state column says.
    if (!row.plan?.entry || !row.plan?.stop || !row.plan?.t1) { stats.skipped_no_geometry++; continue; }

    // Reconstruct the family. Historical rows predate setup_id, so anchor the
    // streak at the row's own creation and mark it reconstructed rather than
    // pretending to know a revision history that was never recorded.
    const key = `${row.asset_class}|${row.symbol}|${row.interval}|${row.direction}|${row.status}`;
    const anchor = seenFamily.get(key) ?? decisionTime;
    const revision = seenFamily.has(key) ? (seenFamily.get(`${key}:rev`) ?? 0) + 1 : 0;
    seenFamily.set(key, anchor);
    seenFamily.set(`${key}:rev`, revision);

    const setup = {
      setup_id: row.setup_id ?? setupIdFor({
        asset_class: row.asset_class, symbol: row.symbol, interval: row.interval,
        direction: row.direction, status: row.status, streak_started_at: anchor,
      }),
      streak_started_at: anchor,
      revision,
    };

    // The engine internals behind these calls were never persisted for rows
    // predating migration 013, so provenance is mostly null. Marked
    // reconstructed so a null here reads as "not recorded" rather than
    // "recorded as absent" — the Critic must be able to tell those apart.
    const provenance = {
      reconstructed: true,
      reconstructed_note: "replayed from the signals table; engine internals were not persisted at emit time",
      uncapped_conviction: null,
      gate: { applied: null, raw_conviction: row.conviction_raw ?? null, raw_status: null, reason: null },
      pre_gate_status: null,
      pre_gate_conviction: null,
      chop_applied: null,
      data_source: row.provenance?.data_source ?? null,
      emitter_version: "backfill-1",
    };

    try {
      const payload = buildSignalPayload({ raw: null, sig: null, row, setup, provenance });
      const envelope = buildEnvelope({
        eventType: "signal.emitted",
        payload,
        idempotencyKey: `${setup.setup_id}:rev${setup.revision}`,
        producer: { system: "kronos", instance: "backfill", emitter_sdk_version: "backfill-1" },
        // A dry run signs with a placeholder. Nothing is transmitted, so the
        // signature is never checked -- and requiring the real key just to
        // count rows would mean copying a production secret onto a laptop for
        // an operation that touches nothing.
        secret: process.env.KRONOS_LAB_HMAC_KEY || (DRY ? "dry-run-placeholder-not-transmitted" : ""),
        keyId: process.env.KRONOS_LAB_HMAC_KEY_ID ?? "k1",
        // The real decision time, not now. This is what makes the Lab flag it
        // as a backfill — collapsing the two would hide exactly the thing the
        // Lab needs to know.
        occurredAt: decisionTime,
      });

      if (DRY) {
        stats.sent++;
      } else {
        const res = await fetch(`${process.env.KRONOS_LAB_URL}/api/ingest`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(envelope),
        });
        if (res.ok) stats.sent++;
        else {
          stats.failed++;
          console.warn(`  signal ${row.id}: HTTP ${res.status} ${(await res.text()).slice(0, 140)}`);
          continue;
        }
      }

      // The outcome, second and always. Sending it first would make it an
      // orphan and quarantine it for a reason that is not true.
      if (!DRY) {
        const ok = await emitOutcome({
          signalId: row.id,
          setupId: setup.setup_id,
          state: row.state,
          plan: row.plan,
          resolvedAt,
          mode: "engine",
          reason: row.state === "won" ? "t1_hit" : "stop_hit",
        });
        if (ok) stats.outcomes++; else stats.failed++;
      } else {
        stats.outcomes++;
      }

      // Gentle on the ingest route: each event verifies an HMAC, runs the
      // tripwire, and writes several rows.
      if (!DRY) await sleep(120);
    } catch (e) {
      stats.failed++;
      console.warn(`  signal ${row.id}: ${e?.message ?? e}`);
    }
  }

  console.log("\n" + JSON.stringify(stats, null, 2));
  if (stats.skipped_no_time) {
    console.log(`\n${stats.skipped_no_time} row(s) skipped for having no defensible resolution time.`);
    console.log("Not a failure. graded_at arrived with migration 013; anything graded before that");
    console.log("has no honest timestamp, and inventing one would be worse than omitting the row.");
  }
  if (!DRY && stats.sent) {
    console.log(`\n${stats.sent} signal(s) replayed. They will appear in the Lab flagged \`backfilled\``);
    console.log("and quarantined with class 'backfill' — that is the tripwire working as designed,");
    console.log("marking this data in-sample. Run the Lab's cron tick to let the Critic look at it.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
