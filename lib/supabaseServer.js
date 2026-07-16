// lib/supabaseServer.js — server-side Supabase helpers (env-gated).
// Uses the service-role key; NEVER import this from client components.
import { createClient } from "@supabase/supabase-js";

let _admin = null;

export function serverConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getAdmin() {
  if (!serverConfigured()) return null;
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _admin;
}

// Resolve the authenticated user from a Bearer token on the request.
export async function getUserFromRequest(request) {
  const admin = getAdmin();
  if (!admin) return { user: null, error: "Auth not configured" };
  const authz = request.headers.get("authorization") || "";
  const token = authz.startsWith("Bearer ") ? authz.slice(7) : null;
  if (!token) return { user: null, error: "Missing bearer token" };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: "Invalid session" };
  return { user: data.user, error: null };
}

// Insert a signal row, tolerating a database that hasn't had migration 003
// (`signals.source`) applied yet.
//
// Why this exists: every writer sets `source`. If the column is missing, Postgres
// rejects the insert outright (42703) and the feed silently stops receiving ANY
// new signals — a total outage triggered purely by migration ordering. Rather
// than make correct behaviour depend on someone remembering to paste SQL before
// the deploy lands, we retry once without the field. The tag is a nice-to-have;
// the signal itself is not.
export async function insertSignal(admin, row) {
  const { error } = await admin.from("signals").insert(row);
  if (error?.code === "42703" && "source" in row) {
    const { source, ...withoutSource } = row;
    const retry = await admin.from("signals").insert(withoutSource);
    return { error: retry.error, degraded: !retry.error };
  }
  return { error, degraded: false };
}

// Owner check: comma-separated allowlist in OWNER_EMAILS.
export function isOwner(user) {
  const owners = (process.env.OWNER_EMAILS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return Boolean(user?.email && owners.includes(user.email.toLowerCase()));
}
