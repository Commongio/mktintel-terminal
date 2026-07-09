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
export async function getAccessToken() {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data?.session?.access_token || null;
}
