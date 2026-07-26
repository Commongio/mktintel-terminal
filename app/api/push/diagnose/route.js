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

  // The last 40 signals, newest first — the same rows the feed reads.
  const { data: sigs } = await admin
    .from("signals")
    .select("symbol,asset_class,interval,status,direction,conviction,market_cap,created_at")
    .order("created_at", { ascending: false })
    .limit(40);

  // Replay each signal against each device.
  const reasonCounts = {};
  const recent = (sigs || []).slice(0, 15).map((sig) => {
    const perDevice = subs.map((s) => {
      const blocked = pushBlockReason(sig, s);
      return { device: String(s.id).slice(0, 8), blocked: blocked?.code ?? null, detail: blocked?.detail ?? null };
    });
    const wouldPush = perDevice.some((d) => !d.blocked);
    for (const d of perDevice) if (d.blocked) reasonCounts[d.blocked] = (reasonCounts[d.blocked] || 0) + 1;
    return {
      symbol: sig.symbol, side: sig.asset_class, interval: sig.interval,
      status: sig.status, conviction: sig.conviction,
      at: sig.created_at,
      wouldPush,
      why: wouldPush ? null : (perDevice.find((d) => d.blocked)?.detail ?? null),
    };
  });

  // NOTE: a signal only pushes when its verdict CHANGED (see the cron's push
  // gate). This route deliberately reports whether the FILTERS would allow it —
  // it cannot know the change history — so that distinction is stated plainly
  // rather than implied, or a user would read "wouldPush: true" as "you should
  // have been buzzed for every one of these".
  const deliverable = recent.filter((r) => r.wouldPush).length;
  const topReason = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const VERDICT = {
    hold_needs_all: "Your signals are arriving as HOLD (forming), and this device is set to FIRE only. Either the chop halt or the brain-sync gate is demoting them. Switch to \"FIRE + forming\" in ALERTS to receive these.",
    below_conviction: "Recent signals are below this device's conviction threshold. Lower it in the bot's Studio tab, then toggle alerts off and on so the device re-registers.",
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
    topBlockReason: topReason,
    verdict: deliverable > 0
      ? `${deliverable} of the last 15 signals pass your filters. Note that a push only fires when a signal's verdict CHANGES, so passing the filters does not mean every one should have buzzed.`
      : (VERDICT[topReason] || "No recent signal passed this device's filters."),
    recent,
  });
}
