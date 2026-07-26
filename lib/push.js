// lib/push.js — V11 M3 server-side Web Push. NEVER import from a client component.
import webpush from "web-push";
import { signalMatchesPrefs } from "./alertPrefs";
import { getAdmin } from "./supabaseServer";
import { directionLabel } from "./signalLabels";

let _configured = null;

export function pushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  );
}

function configure() {
  if (_configured) return true;
  if (!pushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  _configured = true;
  return true;
}

// Build the notification copy for a signal. Kept here so the cron and any manual
// test send produce identical text.
export function signalNotification(sig) {
  // V13.5: asset-class-aware label — CALLS/PUTS for options, LONG/SHORT for
  // futures, BUY/SELL for equity — instead of a single LONG/SHORT vocabulary.
  const label = directionLabel(sig.direction, sig.asset_class);
  const arrow = sig.direction === "LONG" ? "▲ " : sig.direction === "SHORT" ? "▼ " : "";
  const dir = `${arrow}${label}`;
  const entry = sig.plan?.entry;
  return {
    title: `⚡ KRONOS · ${sig.status} ${sig.symbol}`,
    body: `${dir} ${sig.symbol}${entry ? ` @ ${entry}` : ""} — ${sig.conviction}% conviction · ${sig.interval}`,
    // Collapse repeats per instrument so a chatty engine can't stack a dozen
    // notifications for one ticker.
    tag: `kronos-${sig.asset_class}-${sig.symbol}`,
    url: "/",
  };
}

/**
 * Fan a signal out to every subscription that wants it.
 *
 * Returns {sent, pruned, failed}. Dead endpoints (404/410) are DELETED, not
 * retried: a browser returns 410 Gone permanently once a subscription is
 * revoked, so keeping the row would mean failing forever on every future send.
 */
export async function sendSignalPush(sig) {
  if (!configure()) return { sent: 0, pruned: 0, failed: 0, skipped: "push-not-configured" };
  const admin = getAdmin();
  if (!admin) return { sent: 0, pruned: 0, failed: 0, skipped: "no-admin" };

  // V13.6: notify_level is selected too. If the column doesn't exist yet
  // (migration 009 not run), Supabase errors — retry without it and treat every
  // device as 'fire' so push keeps working during the migration window.
  let subs, error;
  // V14.5 adds the routing columns. Each fallback drops one migration's worth of
  // columns so push keeps working during any migration window rather than
  // failing closed and silently notifying nobody.
  ({ data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,min_conviction,asset_class,notify_level,alert_sides,alert_timeframes,alert_caps"));
  if (error && (error.code === "42703" || /alert_(sides|timeframes|caps)/.test(error.message || ""))) {
    ({ data: subs, error } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth,min_conviction,asset_class,notify_level"));
  }
  if (error && (error.code === "42703" || /notify_level/.test(error.message || ""))) {
    ({ data: subs, error } = await admin
      .from("push_subscriptions")
      .select("id,endpoint,p256dh,auth,min_conviction,asset_class"));
  }
  if (error) return { sent: 0, pruned: 0, failed: 0, skipped: error.message };

  const payload = JSON.stringify(signalNotification(sig));
  let sent = 0, pruned = 0, failed = 0;
  const dead = [];
  // V13.5: keep the last few real failure reasons (VAPID 403, payload-too-large
  // 413, etc.) so the cron's JSON response makes a broken pipeline diagnosable
  // instead of just reporting "failed: N" with no cause.
  const failures = [];

  await Promise.all((subs || []).map(async (s) => {
    // Respect each device's own bar rather than a global one.
    if ((sig.conviction ?? 0) < (s.min_conviction ?? 65)) return;
    if (s.asset_class && s.asset_class !== sig.asset_class) return;
    // V14.5: side / timeframe / market-cap routing. Only applied when the device
    // actually recorded a preference — a NULL column means "no preference", which
    // must keep behaving exactly as it did before this release (allow all).
    if (s.alert_sides || s.alert_timeframes || s.alert_caps) {
      const matched = signalMatchesPrefs(sig, {
        sides: s.alert_sides, timeframes: s.alert_timeframes, caps: s.alert_caps,
      });
      if (!matched) return;
    }
    // V13.6: FIRE always notifies. HOLD (forming) only for devices that opted
    // into 'all'. Anything else (SCAN) never pushes.
    const level = s.notify_level || "fire";
    if (sig.status === "HOLD" && level !== "all") return;
    if (sig.status !== "FIRE" && sig.status !== "HOLD") return;
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { dead.push(s.id); pruned++; }
      else {
        failed++;
        if (failures.length < 5) failures.push({ statusCode: e.statusCode ?? null, body: String(e.body || e.message || "").slice(0, 120) });
      }
    }
  }));

  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  return { sent, pruned, failed, failures };
}

/**
 * V14: long-term (INVEST) drawdown alert.
 *
 * A monthly/yearly position going red is materially different from a signal
 * firing: there's no conviction score to gate on, and the user WANTS this even
 * on a device set to fire-only — it concerns a position they may already hold.
 * So this bypasses the notify_level/min_conviction filters that sendSignalPush
 * applies, and is instead rate-limited at the source: signalLifecycle marks
 * went_red_at so each signal can only ever alert once.
 */
export async function sendDrawdownPush(info) {
  if (!configure()) return { sent: 0, pruned: 0, failed: 0, skipped: "push-not-configured" };
  const admin = getAdmin();
  if (!admin) return { sent: 0, pruned: 0, failed: 0, skipped: "no-admin" };

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,asset_class");
  if (error) return { sent: 0, pruned: 0, failed: 0, skipped: error.message };

  const label = directionLabel(info.direction, info.asset_class);
  const payload = JSON.stringify({
    title: `⚠ KRONOS · ${info.symbol} is red`,
    body: `Your long-term ${label} on ${info.symbol} is down ${info.downPct}% from entry (${info.entry} → ${info.price}). Review the thesis.`,
    tag: `kronos-red-${info.symbol}`,
    url: "/",
  });

  let sent = 0, pruned = 0, failed = 0;
  const dead = [];
  await Promise.all((subs || []).map(async (s) => {
    // A device scoped to another asset class still shouldn't get this.
    if (s.asset_class && s.asset_class !== info.asset_class) return;
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { dead.push(s.id); pruned++; }
      else failed++;
    }
  }));
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);
  return { sent, pruned, failed };
}
