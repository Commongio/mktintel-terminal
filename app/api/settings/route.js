// app/api/settings/route.js — V9 per-user settings sync (auth required).
// GET  -> { settings } for the current user
// PUT  -> merge body.settings into the user's settings JSON
import { getAdmin, getUserFromRequest, serverConfigured } from "../../../lib/supabaseServer";

export async function GET(request) {
  if (!serverConfigured()) return Response.json({ error: "Auth not configured" }, { status: 503 });
  const { user, error } = await getUserFromRequest(request);
  if (!user) return Response.json({ error: error || "Unauthorized" }, { status: 401 });

  const admin = getAdmin();
  const { data } = await admin.from("user_settings").select("settings,updated_at").eq("user_id", user.id).maybeSingle();
  return Response.json({ settings: data?.settings || {}, updatedAt: data?.updated_at || null });
}

export async function PUT(request) {
  if (!serverConfigured()) return Response.json({ error: "Auth not configured" }, { status: 503 });
  const { user, error } = await getUserFromRequest(request);
  if (!user) return Response.json({ error: error || "Unauthorized" }, { status: 401 });

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const incoming = body?.settings;
  if (!incoming || typeof incoming !== "object") {
    return Response.json({ error: "Expected { settings: object }" }, { status: 400 });
  }
  // Guard against oversized payloads (layouts + a data-URL background can get big; cap at 2MB).
  if (JSON.stringify(incoming).length > 2_000_000) {
    return Response.json({ error: "Settings payload too large" }, { status: 413 });
  }

  const admin = getAdmin();
  const { data: existing } = await admin.from("user_settings").select("settings").eq("user_id", user.id).maybeSingle();
  const merged = { ...(existing?.settings || {}), ...incoming };
  const { error: upErr } = await admin.from("user_settings")
    .upsert({ user_id: user.id, settings: merged, updated_at: new Date().toISOString() });
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
  return Response.json({ ok: true });
}
