// app/api/admin/signal-outcome/route.js — V13.6 owner-only signal grading.
//
// When Gio (dev) deletes a signal it's a JUDGMENT, not housekeeping: the trade
// got stopped out, or the risk/reward turned solidly negative. Instead of that
// knowledge vanishing into a local per-user hide, this records it as a terminal
// state on the shared row so the V13.5 self-learning loop (signalStats) learns
// from it — stopped-out → 'lost', bad-R:R → 'invalidated'.
//
// Owner-gated by the same isOwner()/OWNER_EMAILS allowlist as the rest of /admin.
import { getAdmin, getUserFromRequest, isOwner, serverConfigured } from "../../../../lib/supabaseServer";
import { emitOutcome } from "../../../../lib/labEmitter";

const REASON_TO_STATE = {
  stopped_out: "lost",        // hit the stop / trade failed → counts against win-rate
  bad_rr: "invalidated",      // R:R turned negative before triggering → not a graded loss, but gone
  // Finer reasons, because "why" is the part worth keeping. A signal killed
  // four minutes in because it collapsed is a different judgement from one
  // closed in profit, and collapsing both to "lost" throws away the only
  // input here a model cannot reconstruct.
  went_red_fast: "lost",
  stale: "invalidated",

  // ── the engine called a major move and the move happened ─────────────────
  // The most valuable label available, and the one the record had no way to
  // carry. A signal that ran 40% is teaching data of a completely different
  // kind from one that crawled to t1, and both were previously just "won".
  //
  // Direction-RELATIVE, deliberately. "broke out" and "broke down" describe
  // where PRICE went, which is ambiguous the moment the signal is a SHORT: a
  // short that breaks down is a win, and the old map called it a loss. These
  // describe the move relative to the CALL, so they are unambiguous for either
  // direction.
  called_it_big: "won",       // major move, in the direction the signal called
  reversed_hard: "lost",      // major move, straight against the call

  // Kept so anything already sent still resolves, but they mean what a LONG
  // reader assumed they meant and should not be offered in the UI.
  broke_out: "won",
  broke_down: "lost",
  // V14: wins are teaching data too. Grading a deletion as a WIN lets the
  // self-learning loop reinforce the setup signature instead of only ever
  // learning from failures (which biases the aggregate gate pessimistic).
  closed_profit: "won",       // closed with a good return → counts toward win-rate
};

export async function POST(request) {
  if (!serverConfigured()) return Response.json({ error: "Auth not configured" }, { status: 503 });
  const { user, error } = await getUserFromRequest(request);
  if (!user) return Response.json({ error: error || "Unauthorized" }, { status: 401 });
  if (!isOwner(user)) return Response.json({ error: "Owner access required" }, { status: 403 });

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const id = body?.id;
  const reason = body?.reason;
  const state = REASON_TO_STATE[reason];
  if (!id || !state) {
    return Response.json({ error: "Expected { id, reason: 'stopped_out' | 'bad_rr' | 'closed_profit' }" }, { status: 400 });
  }

  const admin = getAdmin();
  // Read first: the emit needs the geometry and the decision time, and after
  // the update resolved_at is overwritten so the interval is unrecoverable.
  const { data: before } = await admin.from("signals")
    .select("id,symbol,plan,setup_id,created_at,direction").eq("id", id).maybeSingle();

  const resolvedAt = new Date().toISOString();
  const { data, error: upErr } = await admin.from("signals")
    .update({ state, resolved_at: resolvedAt })
    .eq("id", id)
    .select("id,symbol,state");
  // 42703 = no `state` column (migration 006 not run) — report clearly.
  if (upErr) {
    if (upErr.code === "42703") return Response.json({ error: "signals.state column missing — run migration 006" }, { status: 409 });
    return Response.json({ error: upErr.message }, { status: 500 });
  }
  if (!data?.length) return Response.json({ error: "Signal not found" }, { status: 404 });

  // Mirror to the Lab. Fire-and-forget and awaited only so the response can
  // say whether it landed -- emitOutcome is total and cannot throw in here.
  //
  // This is the gap that mattered: a dev deleting a signal was the single
  // richest input in the system and it reached nothing outside this table.
  // Worse, the removals are not random -- the bad-looking ones get killed --
  // so leaving them out measured the engine on a population already curated
  // in its favour.
  const minutes = before?.created_at
    ? Math.max(0, Math.round((Date.parse(resolvedAt) - Date.parse(before.created_at)) / 60000))
    : null;
  const sent = await emitOutcome({
    signalId: id,
    setupId: before?.setup_id ?? null,
    state,
    plan: before?.plan ?? null,
    resolvedAt,
    mode: "manual",
    actor: user?.email ?? "owner",
    reason,
    disposition: reason,
    dispositionNote: typeof body?.note === "string" ? body.note.slice(0, 500) : null,
    minutesToDisposition: minutes,
  });

  return Response.json({ ok: true, id, state, reason, mirrored_to_lab: sent });
}
