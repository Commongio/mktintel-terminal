// app/api/push/test/route.js — V11 M3: send yourself a test notification.
//
// Exists because the alternative way to verify push is "wait for the engine to
// FIRE at 65%+ during market hours", which could be days. This sends ONLY to the
// caller's own subscriptions — it is not a broadcast, by construction.
import { getAdmin, serverConfigured, getUserFromRequest } from "../../../../lib/supabaseServer";
import { pushConfigured } from "../../../../lib/push";
import webpush from "web-push";

// V13.5: GET = push diagnostics for the calling user's own account. Lets a
// device that isn't receiving pushes confirm, from the phone itself, whether the
// DEPLOYED server has VAPID configured and whether its public key still matches
// what this device subscribed with (the #1 "installed but silent" cause).
export async function GET(request) {
  if (!serverConfigured()) return Response.json({ error: "Supabase not configured" }, { status: 503 });
  const { user } = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const pubKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const admin = getAdmin();
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint,created_at").eq("user_id", user.id);
  return Response.json({
    pushConfigured: pushConfigured(),
    vapidSubjectSet: Boolean(process.env.VAPID_SUBJECT),
    // Just the tail — enough to eyeball a mismatch against the client key, not
    // enough to be a secret (the public key ships to every browser anyway).
    vapidPublicKeyTail: pubKey ? pubKey.slice(-10) : null,
    deviceCount: subs?.length || 0,
    devices: (subs || []).map((s) => ({ host: (() => { try { return new URL(s.endpoint).host; } catch { return "?"; } })(), subscribed: s.created_at })),
  });
}

export async function POST(request) {
  if (!serverConfigured()) return Response.json({ error: "Supabase not configured" }, { status: 503 });
  if (!pushConfigured()) return Response.json({ error: "Push not configured — VAPID keys missing" }, { status: 503 });

  const { user } = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@example.com",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const admin = getAdmin();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", user.id);          // own devices only

  if (!subs?.length) return Response.json({ error: "No devices subscribed on this account" }, { status: 404 });

  const payload = JSON.stringify({
    title: "⚡ KRONOS · TEST",
    body: "Push is working. Real FIRE signals will look like this.",
    tag: "kronos-test",
    url: "/",
  });

  let sent = 0, pruned = 0;
  const dead = [];
  // V13.5: capture WHY a send failed instead of swallowing it. A device that's
  // "installed but not firing" is almost always a 403/400 VAPID mismatch (keys
  // rotated since the device subscribed) — invisible before because non-404/410
  // errors were silently dropped. Now the reason comes back to the UI.
  const failures = [];
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { dead.push(s.id); pruned++; }
      else {
        failures.push({
          statusCode: e.statusCode ?? null,
          host: (() => { try { return new URL(s.endpoint).host; } catch { return "?"; } })(),
          body: String(e.body || e.message || "").slice(0, 160),
        });
      }
    }
  }));
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);

  // A 403/401 across the board = VAPID key mismatch; tell the user how to fix it.
  const vapidMismatch = failures.length > 0 && failures.every((f) => f.statusCode === 403 || f.statusCode === 401);
  const hint = vapidMismatch
    ? "Push keys changed since this device subscribed. Turn alerts OFF then ON again to re-subscribe with the current key."
    : (sent === 0 && pruned > 0 ? "This device's subscription had expired and was removed — turn alerts OFF then ON to re-subscribe."
    : null);

  return Response.json({ ok: true, sent, pruned, devices: subs.length, failures, hint });
}
