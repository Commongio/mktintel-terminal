// app/api/push/diagnose/route.js — V14.6.
//
// Answers ONE question with evidence: "the feed shows signals, so why is my
// phone silent?"
//
// Before this, every gate in sendSignalPush was an anonymous early return, so a
// dropped push left no trace — the only way to reason about it was to read the
// source. This route replays the user's own recent signals through the SAME
// pushBlockReason() the sender uses, so the answer is derived from the real
// decision path rather than a re-implementation that could drift.
//
// Read-only and scoped strictly to the caller's own devices.
import { getAdmin, serverConfigured, getUserFromRequest } from "../../../../lib/supabaseServer";
import { pushConfigured } from "../../../../lib/push";
import { pushBlockReason } from "../../../../lib/alertPrefs";

export async function GET(request) {
  if (!serverConfigured()) return Response.json({ error: "Supabase not configured" }, { status: 503 });
  const { user } = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });

  const admin = getAdmin();

  // This user's devices only — never anyone else's endpoints.
  let subs, subErr;
  ({ data: subs, error: subErr } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,min_conviction,asset_class,notify_level,alert_sides,alert_timeframes,alert_caps,created_at")
    .eq("user_id", user.id));
  if (subErr && (subErr.code === "42703" || /alert_/.test(subErr.message || ""))) {
    ({ data: subs, error: subErr } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,min_conviction,asset_class,notify_level,created_at")
      .eq("user_id", user.id));
  }
  if (subErr) return Response.json({ error: subErr.message }, { status: 500 });

  if (!subs?.length) {
    return Response.json({
      ok: true, devices: 0,
      verdict: "No device is subscribed. Open ALERTS and turn alerts on.",
      recent: [],
    });
  }

  // Pull a deeper window than we report, because determining whether a signal
  // CHANGED requires seeing the row before it for the same instrument.
  const { data: sigs } = await admin
    .from("signals")
    .select("symbol,asset_class,interval,status,direction,conviction,market_cap,created_at")
    .order("created_at", { ascending: false })
    .limit(400);

  // ── THE VERDICT-CHANGE GATE ────────────────────────────────────────────────
  // The cron writes a row when the verdict changed OR the last one is >30 min
  // stale, but only PUSHES when it changed:
  //     write:  if (!changed && !stale) skip
  //     push:   if ((FIRE || HOLD) && changed)
  // So a signal holding the same verdict gets a fresh feed row every 30 minutes
  // — it looks brand new, with a new timestamp — and never notifies. That gap is
  // invisible from the filters alone, which is why it has to be reconstructed
  // here: group by instrument, then compare each row to the next-older one.
  const byInstrument = new Map();
  for (const s of sigs || []) {
    const k = `${s.asset_class}|${s.symbol}|${s.interval}`;
    if (!byInstrument.has(k)) byInstrument.set(k, []);
    byInstrument.get(k).push(s); // already newest-first
  }
  const changedFor = new Map();
  for (const [, rows] of byInstrument) {
    for (let i = 0; i < rows.length; i++) {
      const prev = rows[i + 1]; // next-older row for this instrument
      const changed = !prev || prev.status !== rows[i].status || prev.direction !== rows[i].direction;
      changedFor.set(rows[i], changed);
    }
  }

  // Replay each signal against each device, then against the change gate. Both
  // must pass for a phone to buzz, so both are reported.
  const reasonCounts = {};
  const recent = (sigs || []).slice(0, 15).map((sig) => {
    const perDevice = subs.map((s) => {
      const blocked = pushBlockReason(sig, s);
      return { device: String(s.id).slice(0, 8), blocked: blocked?.code ?? null, detail: blocked?.detail ?? null };
    });
    const passesFilters = perDevice.some((d) => !d.blocked);
    const changed = changedFor.get(sig) !== false;
    // The change gate runs BEFORE any per-device filtering in the cron, so when
    // it blocks, that is the real reason — report it ahead of filter reasons.
    const reason = !changed
      ? "verdict unchanged since the previous row — the feed re-writes a stale signal every 30 min, but push only fires on a CHANGE"
      : (perDevice.find((d) => d.blocked)?.detail ?? null);
    const code = !changed ? "verdict_unchanged" : perDevice.find((d) => d.blocked)?.blocked;
    if (code) reasonCounts[code] = (reasonCounts[code] || 0) + 1;
    return {
      symbol: sig.symbol, side: sig.asset_class, interval: sig.interval,
      status: sig.status, conviction: sig.conviction,
      at: sig.created_at,
      passesFilters, changed,
      wouldPush: passesFilters && changed,
      why: passesFilters && changed ? null : reason,
    };
  });

  const deliverable = recent.filter((r) => r.wouldPush).length;
  const passedFiltersOnly = recent.filter((r) => r.passesFilters && !r.changed).length;
  const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const VERDICT = {
    verdict_unchanged: "Your filters are fine — these signals were re-written to the feed because they went stale (every 30 min), not because their verdict changed. The cron writes on 'changed OR stale' but pushes only on 'changed', so a signal holding the same call gets a fresh-looking feed row and never notifies. This is the mismatch, not your settings.",
    hold_needs_all: "Your signals are arriving as HOLD (forming), and this device is set to FIRE only. Either the chop halt or the brain-sync gate is demoting them. Switch to \"FIRE + forming\" in ALERTS to receive these.",
    below_conviction: "Recent signals are below this device's conviction threshold. NOTE: the threshold is a SNAPSHOT taken when the device subscribed — changing the Studio slider later does not update it. Toggle alerts off and on to re-register at your current value.",
    alert_routing: "Recent signals are on sides or timeframes you deselected in ALERTS.",
    asset_class_scope: "This device is scoped to a single asset class from an older version. Toggle alerts off and on to clear it.",
    not_actionable: "Recent signals are SCAN-only, which never push by design.",
  };

  return Response.json({
    ok: true,
    pushConfigured: pushConfigured(),
    devices: subs.length,
    deviceSettings: subs.map((s) => ({
      device: String(s.id).slice(0, 8),
      minConviction: s.min_conviction ?? 65,
      notifyLevel: s.notify_level || "fire",
      sides: s.alert_sides ?? "all",
      timeframes: s.alert_timeframes ?? "all",
      legacyAssetScope: s.asset_class ?? null,
      subscribedAt: s.created_at,
    })),
    signalsExamined: (sigs || []).length,
    deliverableOfLast15: deliverable,
    // Signals your settings ALLOW but that were blocked purely by the change
    // gate. A high number here means the settings are innocent.
    blockedOnlyByChangeGate: passedFiltersOnly,
    topBlockReason: topReason,
    verdict: deliverable > 0
      ? `${deliverable} of the last 15 signals should have pushed (filters + change gate both passed). If your phone stayed silent for those, the problem is delivery, not configuration.`
      : (VERDICT[topReason] || "No recent signal passed this device's filters."),
    recent,
  });
}
