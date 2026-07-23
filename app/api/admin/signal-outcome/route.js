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

const REASON_TO_STATE = {
  stopped_out: "lost",        // hit the stop / trade failed → counts against win-rate
  bad_rr: "invalidated",      // R:R turned negative before triggering → not a graded loss, but gone
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
    return Response.json({ error: "Expected { id, reason: 'stopped_out' | 'bad_rr' }" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data, error: upErr } = await admin.from("signals")
    .update({ state, resolved_at: new Date().toISOString() })
    .eq("id", id)
    .select("id,symbol,state");
  // 42703 = no `state` column (migration 006 not run) — report clearly.
  if (upErr) {
    if (upErr.code === "42703") return Response.json({ error: "signals.state column missing — run migration 006" }, { status: 409 });
    return Response.json({ error: upErr.message }, { status: 500 });
  }
  if (!data?.length) return Response.json({ error: "Signal not found" }, { status: 404 });
  return Response.json({ ok: true, id, state, reason });
}
