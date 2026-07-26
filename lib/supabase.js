// lib/supabase.js — browser-side Supabase client (env-gated).
// Returns null when Supabase isn't configured so the app can fall back
// to the legacy access-code gate.
"use client";
import { createClient } from "@supabase/supabase-js";

let _client = null;

export function supabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabase() {
  if (!supabaseConfigured()) return null;
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { auth: { persistSession: true, autoRefreshToken: true } }
    );
  }
  return _client;
}

// Convenience: current access token for Authorization headers on API calls.
//
// V14.7: this used to return getSession()'s token as-is, which is the STORED
// session — not necessarily a VALID one. `autoRefreshToken` relies on a timer
// running in a live page, and an installed home-screen PWA gets SUSPENDED when
// backgrounded, so that timer may never fire. You reopen the app, it hands over
// a token that quietly expired while frozen, and the server rejects it with
// "Invalid session".
//
// That wasn't a cosmetic error: /api/push/subscribe rejects on it, and
// PushAlerts then calls sub.unsubscribe() to roll back — so the device ends up
// with NO push subscription at all, and every later signal has nobody to send
// to. The feed still fills (that's an unauthenticated read), which is why it
// looked like "push is broken" rather than "sign-in expired".
//
// So: refresh proactively when the token is expired or close to it.
const TOKEN_REFRESH_MARGIN_MS = 120_000; // refresh 2 min early — covers clock skew + slow networks

export async function getAccessToken() {
  const sb = getSupabase();
  if (!sb) return null;

  const { data } = await sb.auth.getSession();
  const session = data?.session;
  if (!session) return null;

  // expires_at is unix SECONDS. Missing => treat as stale rather than trusting it.
  const expiresAtMs = (session.expires_at ?? 0) * 1000;
  const needsRefresh = !expiresAtMs || expiresAtMs - Date.now() < TOKEN_REFRESH_MARGIN_MS;
  if (!needsRefresh) return session.access_token || null;

  try {
    const { data: refreshed, error } = await sb.auth.refreshSession();
    if (!error && refreshed?.session?.access_token) return refreshed.session.access_token;
  } catch {}
  // Refresh failed (genuinely signed out, revoked, or offline). Return what we
  // have and let the server be the authority — better a real 401 than a silent
  // null that reads as "not signed in" when the session may still be fine.
  return session.access_token || null;
}
