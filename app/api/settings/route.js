// app/api/settings/route.js — V9 per-user settings sync (auth required).
// GET  -> { settings } for the current user
// PUT  -> merge body.settings into the user's settings JSON
import { getAdmin, getUserFromRequest, serverConfigured, isOwner } from "../../../lib/supabaseServer";

export async function GET(request) {
  if (!serverConfigured()) return Response.json({ error: "Auth not configured" }, { status: 503 });
  const { user, error } = await getUserFromRequest(request);
  if (!user) return Response.json({ error: error || "Unauthorized" }, { status: 401 });

  const admin = getAdmin();
  const { data } = await admin.from("user_settings").select("settings,updated_at").eq("user_id", user.id).maybeSingle();
  // V13 beta popup copy is dev-editable (see /api/admin/brain) but plain read
  // access here — it's display content, not sensitive, and every user needs it.
  // Degrades to null on a missing migration/table (no popup shown — safe default).
  let v13Popup = null;
  try {
    const { data: brain } = await admin.from("brain_config").select("value").eq("key", "v13_popup_content").maybeSingle();
    if (brain?.value) v13Popup = brain.value;
  } catch { /* brain_config may not exist yet */ }
  // isDev is never stored — it's derived fresh from OWNER_EMAILS on every request so it
  // can't go stale in a client-cached settings blob.
  return Response.json({ settings: data?.settings || {}, updatedAt: data?.updated_at || null, isDev: isOwner(user), v13Popup });
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
  // Guard against oversized payloads (background photo + chat history + layouts can
  // add up; cap at 6MB — comfortably inside Postgres jsonb limits on the free tier).
  if (JSON.stringify(incoming).length > 6_000_000) {
    return Response.json({ error: "Settings payload too large" }, { status: 413 });
  }

  // isDev is server-derived (OWNER_EMAILS), never client-writable — strip it even if a
  // client sends it, so it can never be spoofed into the stored blob.
  if ("isDev" in incoming) delete incoming.isDev;

  const admin = getAdmin();
  const { data: existing } = await admin.from("user_settings").select("settings").eq("user_id", user.id).maybeSingle();
  const merged = { ...(existing?.settings || {}), ...incoming };
  const { error: upErr } = await admin.from("user_settings")
    .upsert({ user_id: user.id, settings: merged, updated_at: new Date().toISOString() });
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
  return Response.json({ ok: true });
}
