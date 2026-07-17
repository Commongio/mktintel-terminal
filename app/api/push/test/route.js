// app/api/push/test/route.js — V11 M3: send yourself a test notification.
//
// Exists because the alternative way to verify push is "wait for the engine to
// FIRE at 65%+ during market hours", which could be days. This sends ONLY to the
// caller's own subscriptions — it is not a broadcast, by construction.
import { getAdmin, serverConfigured, getUserFromRequest } from "../../../../lib/supabaseServer";
import { pushConfigured } from "../../../../lib/push";
import webpush from "web-push";

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
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) { dead.push(s.id); pruned++; }
    }
  }));
  if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);

  return Response.json({ ok: true, sent, pruned, devices: subs.length });
}
