// app/api/auth/signup/route.js — V9
// Creates a Supabase user gated by a one-time registration code.
// Code redemption is atomic (redeem_registration_code SQL function), so a
// code can never be burned twice even under concurrent signups.
import { getAdmin, serverConfigured } from "../../../../lib/supabaseServer";

export async function POST(request) {
  if (!serverConfigured()) {
    return Response.json(
      { error: "Multi-user auth is not configured on this server (missing Supabase env vars)." },
      { status: 503 }
    );
  }

  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const code = String(body.code || "").trim().toUpperCase();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "Enter a valid email." }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  if (!code) return Response.json({ error: "A registration code is required." }, { status: 400 });

  const admin = getAdmin();

  // Fast pre-check so we don't create users for obviously bad codes.
  const { data: codeRow } = await admin
    .from("registration_codes").select("code,status").eq("code", code).maybeSingle();
  if (!codeRow) return Response.json({ error: "Registration code not found." }, { status: 400 });
  if (codeRow.status !== "unused") return Response.json({ error: "This registration code has already been used." }, { status: 400 });

  // Create the account.
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr) {
    const msg = /already/i.test(createErr.message) ? "An account with this email already exists." : createErr.message;
    return Response.json({ error: msg }, { status: 400 });
  }
  const userId = created.user.id;

  // Atomically burn the code. If we lost a race, roll the user back.
  const { data: won, error: redeemErr } = await admin.rpc("redeem_registration_code", {
    p_code: code, p_user: userId,
  });
  if (redeemErr || won !== true) {
    await admin.auth.admin.deleteUser(userId).catch(() => {});
    return Response.json({ error: "This registration code has already been used." }, { status: 409 });
  }

  // Seed an empty settings row so first PUT is an update. Best-effort:
  // NOTE supabase-js query builders are thenables WITHOUT .catch — destructure
  // the error instead of chaining (a .catch() here throws TypeError → 500).
  const { error: settingsErr } = await admin.from("user_settings").upsert({ user_id: userId, settings: {} });
  if (settingsErr) console.warn("signup: user_settings seed failed (non-fatal):", settingsErr.message);

  return Response.json({ ok: true });
}
