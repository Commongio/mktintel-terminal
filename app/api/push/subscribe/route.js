// app/api/push/subscribe/route.js — V11 M3.
//
// AUTH IS MANDATORY HERE. A push endpoint is a capability: whoever holds it can
// send that device notifications. Accepting anonymous writes would let anyone
// register endpoints against another account, or harvest them. So every route
// resolves the caller from their bearer token and scopes strictly to that user.
import { getAdmin, serverConfigured, getUserFromRequest } from "../../../../lib/supabaseServer";
import { pushConfigured } from "../../../../lib/push";
import { normalizePrefs } from "../../../../lib/alertPrefs";

export async function POST(request) {
  if (!serverConfigured()) return Response.json({ error: "Supabase not configured" }, { status: 503 });
  if (!pushConfigured()) return Response.json({ error: "Push not configured — VAPID keys missing" }, { status: 503 });

  const { user, error: authErr } = await getUserFromRequest(request);
  if (!user) return Response.json({ error: authErr || "Sign in to enable alerts" }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch {}
  const sub = body.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: "Malformed subscription" }, { status: 400 });
  }

  const minConviction = Math.max(50, Math.min(95, Number(body.minConviction) || 65));
  const assetClass = ["futures", "options", "equity"].includes(body.assetClass) ? body.assetClass : null;
  const notifyLevel = body.notifyLevel === "all" ? "all" : "fire"; // V13.6

  // Upsert on `endpoint`: re-subscribing the same device must update, not
  // duplicate — duplicates would double-notify.
  // V14.5 routing prefs. Validated against the shared vocabulary so a malformed
  // client can't write junk that later silences a user's alerts. Undefined (not
  // null) when absent, so the column keeps whatever it had.
  const prefs = normalizePrefs({
    sides: body.alertSides, timeframes: body.alertTimeframes, caps: body.alertCaps,
  });
  const sentAny = body.alertSides || body.alertTimeframes || body.alertCaps;

  const row = {
    user_id: user.id,
    endpoint, p256dh, auth,
    min_conviction: minConviction,
    asset_class: assetClass,
    notify_level: notifyLevel,
    user_agent: (request.headers.get("user-agent") || "").slice(0, 200),
    ...(sentAny ? {
      alert_sides: prefs.sides,
      alert_timeframes: prefs.timeframes,
      alert_caps: prefs.caps,
    } : null),
  };
  let { error } = await getAdmin().from("push_subscriptions").upsert(row, { onConflict: "endpoint" });
  // Degrade gracefully if migration 011 (alert routing) hasn't run yet — the
  // device still subscribes, just without per-side/timeframe filtering.
  if (error && (error.code === "42703" || /alert_(sides|timeframes|caps)/.test(error.message || ""))) {
    delete row.alert_sides; delete row.alert_timeframes; delete row.alert_caps;
    ({ error } = await getAdmin().from("push_subscriptions").upsert(row, { onConflict: "endpoint" }));
  }
  // Degrade gracefully if migration 009 (notify_level) hasn't run yet.
  if (error && (error.code === "42703" || /notify_level/.test(error.message || ""))) {
    delete row.notify_level;
    ({ error } = await getAdmin().from("push_subscriptions").upsert(row, { onConflict: "endpoint" }));
  }

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, minConviction, assetClass, notifyLevel });
}

export async function DELETE(request) {
  if (!serverConfigured()) return Response.json({ error: "Supabase not configured" }, { status: 503 });
  const { user } = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  let body = {};
  try { body = await request.json(); } catch {}
  const endpoint = body.endpoint;
  if (!endpoint) return Response.json({ error: "Missing endpoint" }, { status: 400 });

  // Scoped to user_id as well as endpoint so one account can never delete
  // another's subscription by guessing an endpoint.
  const { error } = await getAdmin().from("push_subscriptions")
    .delete().eq("endpoint", endpoint).eq("user_id", user.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
