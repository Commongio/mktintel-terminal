"use client";
// AuthGate.jsx — V9 multi-tenant gate.
// When Supabase is configured: real sign-in / sign-up (signup burns a one-time
// registration code). When it isn't: falls back to the legacy AccessGate so the
// terminal keeps working as a single-user local app.
import { useState, useEffect } from "react";
import AccessGate from "./AccessGate";
import { getSupabase, supabaseConfigured } from "../../lib/supabase";

const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";

// V13.7b: the canvas GalaxyBackdrop was replaced by Gio's real astrophotography
// starfield photo (public/login-stars.jpg) as a full-bleed background — see the
// SupabaseGate render. The old canvas generator was removed with it.

// KRONOS in Greek — the titan the terminal is named for. Used as a faint,
// oversized watermark behind the card and as a small mark under the wordmark.
const KRONOS_GREEK = "ΚΡΟΝΟΣ";

// V13.7 login palette — steel/sky blue to match the reference (the in-app accent
// stays teal; the login is its own surface).
const LOGIN_BLUE = "#6d8fb8";
const LOGIN_BLUE_BRIGHT = "#5b9bd5";

const IconPerson = ({ c = "#8ba0b8" }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.5 3.1-5.5 7-5.5s7 2 7 5.5" />
  </svg>
);
const IconLock = ({ c = "#8ba0b8" }) => (
  <svg width="15" height="16" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
  </svg>
);

function Field({ label, type = "text", value, onChange, placeholder, autoFocus, onEnter, icon }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: FM, fontSize: 8, letterSpacing: 2.5, color: "#7d90a6", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      <div style={{
        display: "flex", alignItems: "center", gap: 11, background: "rgba(4,8,16,0.55)",
        border: `1px solid ${focused ? `${LOGIN_BLUE_BRIGHT}66` : "rgba(120,145,180,0.18)"}`,
        borderRadius: 10, padding: "12px 14px", transition: "border-color 0.15s",
      }}>
        <span style={{ flexShrink: 0, display: "flex" }}>{icon || <IconPerson />}</span>
        <input
          type={type} value={value} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{ flex: 1, background: "transparent", border: "none", color: "#dbe6f2", fontFamily: FM, fontSize: 13, fontWeight: 500, letterSpacing: 0.5, width: "100%" }}
        />
      </div>
    </div>
  );
}

function SupabaseGate({ onAccess }) {
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [regCode, setRegCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  // Resume an existing session silently.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    sb.auth.getSession().then(({ data }) => {
      if (data?.session?.user) onAccess(data.session.user);
    });
  }, [onAccess]);

  const doLogin = async () => {
    if (loading) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const sb = getSupabase();
      const { data, error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (err) { setError(err.message === "Invalid login credentials" ? "Invalid email or password." : err.message); return; }
      if (data?.user) onAccess(data.user);
    } catch { setError("Connection error. Please retry."); }
    finally { setLoading(false); }
  };

  const doSignup = async () => {
    if (loading) return;
    setLoading(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, code: regCode.trim() }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error || "Signup failed."); return; }
      // Account created — sign them straight in.
      const sb = getSupabase();
      const { data, error: err } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (err) { setNotice("Account created — please sign in."); setTab("login"); return; }
      if (data?.user) onAccess(data.user);
    } catch { setError("Connection error. Please retry."); }
    finally { setLoading(false); }
  };

  const submit = tab === "login" ? doLogin : doSignup;
  const canSubmit = email.trim() && password.length >= (tab === "signup" ? 8 : 1) && (tab === "login" || regCode.trim());

  const active = (k) => tab === k;
  return (
    // V13.7: matches the reference — teal-navy (top) → purple (bottom) gradient,
    // starfield, giant faint outlined ΚΡΟΝΟΣ watermark bleeding off both edges,
    // ringed-planet-with-constellation mark, frosted card, steel-blue controls.
    <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FM, zIndex: 9999, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@700;800&family=JetBrains+Mono:wght@400;600;700;800&display=swap');
        @keyframes ag-appear { from{opacity:0;transform:translateY(12px);} to{opacity:1;transform:translateY(0);} }
        @keyframes ag-drift { 0%,100%{opacity:0.06;} 50%{opacity:0.10;} }
        @keyframes ag-spin { from{transform:rotate(0deg);} to{transform:rotate(360deg);} }
      `}</style>

      {/* V13.7b: real astrophotography starfield (Gio's photo) as the full-bleed
          background, replacing the canvas starfield. Solid black + raw stars, no
          nebula/gradient tint — per the reference. */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        backgroundImage: "url(/login-stars.jpg)", backgroundSize: "cover", backgroundPosition: "center",
      }} />
      {/* Neutral readability vignette — darkens behind the card/text so the frosted
          panel reads, without tinting the starfield's color. */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "radial-gradient(ellipse at center, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.12) 45%, rgba(0,0,0,0) 72%)",
      }} />

      {/* Giant faint OUTLINED Greek ΚΡΟΝΟΣ watermark, bleeding off both edges,
          behind the card. Transparent fill + faint stroke = the outlined look. */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none", fontFamily: FD, fontWeight: 800, letterSpacing: 18,
        fontSize: "clamp(120px, 30vw, 380px)", color: "transparent",
        WebkitTextStroke: "1.5px rgba(150,175,215,0.16)", whiteSpace: "nowrap",
        animation: "ag-drift 8s ease-in-out infinite", userSelect: "none",
      }}>{KRONOS_GREEK}</div>

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 18, width: "100%", maxWidth: 440, padding: "0 22px", animation: "ag-appear 0.5s ease" }}>
        {/* Ringed planet with a small constellation traced inside. */}
        <svg width="92" height="92" viewBox="0 0 100 100" fill="none" aria-hidden="true">
          <ellipse cx="50" cy="52" rx="42" ry="15" transform="rotate(-22 50 52)" stroke="#9db3cc" strokeWidth="1.4" opacity="0.85" />
          <circle cx="50" cy="47" r="21" stroke="#c3d3e6" strokeWidth="1.6" />
          <g stroke="#aebfd4" strokeWidth="1" opacity="0.9">
            <path d="M41 42 L51 38 L58 49 L47 54 Z" fill="none" opacity="0.5" />
          </g>
          {[[41, 42], [51, 38], [58, 49], [47, 54]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.7" fill="#e2ecf7" />
          ))}
        </svg>

        <div style={{ textAlign: "center", marginTop: -2 }}>
          <div style={{ fontFamily: FD, fontSize: 42, fontWeight: 800, color: "#eef4fb", letterSpacing: 6, lineHeight: 1 }}>KRONOS</div>
          <div style={{ fontFamily: FM, fontSize: 11, color: "#8095ab", letterSpacing: 5, fontWeight: 600, marginTop: 12 }}>TRADING INTELLIGENCE TERMINAL</div>
        </div>

        {/* Frosted-glass card. */}
        <div style={{ width: "100%", marginTop: 6, padding: "20px 22px", background: "rgba(24,38,56,0.42)", border: "1px solid rgba(140,165,200,0.18)", borderRadius: 20, backdropFilter: "blur(18px) saturate(1.1)", WebkitBackdropFilter: "blur(18px) saturate(1.1)", boxShadow: "0 26px 70px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
          {/* Segmented tabs — active fill + brighter blue underline. */}
          <div style={{ display: "flex", background: "rgba(6,12,22,0.4)", border: "1px solid rgba(140,165,200,0.14)", borderRadius: 11, overflow: "hidden", marginBottom: 18 }}>
            {[["login", "SIGN IN"], ["signup", "CREATE ACCOUNT"]].map(([k, label]) => (
              <button key={k} onClick={() => { setTab(k); setError(""); setNotice(""); }} style={{
                flex: 1, padding: "12px 0", fontFamily: FM, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.5,
                color: active(k) ? "#eef4fb" : "#6a7d93",
                background: active(k) ? "linear-gradient(180deg, rgba(91,155,213,0.28), rgba(91,155,213,0.14))" : "transparent",
                borderBottom: `2px solid ${active(k) ? LOGIN_BLUE_BRIGHT : "transparent"}`,
                border: "none", borderRadius: 0, cursor: "pointer", transition: "all 0.15s",
              }}>{label}</button>
            ))}
          </div>

          <Field label="EMAIL" value={email} onChange={setEmail} placeholder="you@example.com" autoFocus onEnter={submit} icon={<IconPerson />} />
          <Field label="PASSWORD" type="password" value={password} onChange={setPassword} placeholder={tab === "signup" ? "min. 8 characters" : "••••••••••••"} onEnter={submit} icon={<IconLock />} />
          {tab === "signup" && (
            <Field label="REGISTRATION CODE (ONE-TIME USE)" value={regCode}
              onChange={(v) => setRegCode(v.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
              placeholder="KRN-XXXXXX" onEnter={submit} icon={<span style={{ color: "#8ba0b8", fontSize: 12 }}>#</span>} />
          )}

          {error && <div style={{ fontFamily: FM, fontSize: 9.5, color: "#ff6b81", letterSpacing: 0.5, margin: "8px 0 10px", textAlign: "center", lineHeight: 1.5 }}>⚠ {error}</div>}
          {notice && <div style={{ fontFamily: FM, fontSize: 9.5, color: LOGIN_BLUE_BRIGHT, letterSpacing: 0.5, margin: "8px 0 10px", textAlign: "center" }}>{notice}</div>}

          <button onClick={submit} disabled={!canSubmit || loading} style={{
            width: "100%", padding: "14px 0", marginTop: 8,
            background: canSubmit && !loading ? "linear-gradient(180deg, #7a97b5, #5c7994)" : "rgba(90,110,135,0.25)",
            border: "none", borderRadius: 11,
            color: canSubmit && !loading ? "#ffffff" : "#7d90a6",
            fontFamily: FM, fontSize: 12, fontWeight: 700, letterSpacing: 3,
            cursor: canSubmit && !loading ? "pointer" : "default",
            boxShadow: canSubmit && !loading ? "0 8px 24px rgba(91,155,213,0.25)" : "none",
            transition: "all 0.15s",
          }}>
            {loading ? "WORKING..." : tab === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
          </button>
          {tab === "signup" && (
            <div style={{ fontFamily: FM, fontSize: 8, color: "#5f7288", letterSpacing: 0.5, marginTop: 11, textAlign: "center", lineHeight: 1.6 }}>
              Each registration code works exactly once and is tied to your account.
            </div>
          )}
        </div>
        <div style={{ fontFamily: FM, fontSize: 8.5, color: "#5f7492", letterSpacing: 2, textAlign: "center", opacity: 0.75 }}>
          # UNAUTHORIZED ACCESS IS MONITORED AND PROHIBITED
        </div>
      </div>
    </div>
  );
}

// ── DEV-ONLY AUTH BYPASS ──────────────────────────────────────────────────────
// Skips the login gate on localhost so development/verification doesn't require
// typing credentials. DOUBLE-GUARDED and cannot reach production:
//
//   1. process.env.NODE_ENV !== "production"  — Vercel builds are always
//      "production", so this alone already kills it on the deployed site.
//   2. NEXT_PUBLIC_DEV_BYPASS_AUTH === "true" — opt-in, and it lives only in
//      .env.local, which is gitignored and never set in Vercel.
//
// Both are inlined at BUILD time, so a production bundle contains `false && …`
// and the bypass is dead code there — it isn't a runtime flag someone can flip.
//
// It grants a NULL user (the same "local mode" the legacy code gate uses) rather
// than forging a Supabase session. That's deliberate: a fake user id would not
// satisfy RLS, so server settings-sync would silently misbehave and we'd be
// testing a state no real user is ever in. Local mode is honest — localStorage
// persistence, anon reads for the signal feed, no account features.
export const DEV_AUTH_BYPASS =
  process.env.NODE_ENV !== "production" &&
  process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === "true";

// Always-visible marker while the bypass is on, so a bypassed session can never
// be mistaken for a real signed-in one during testing.
export function DevBypassBadge() {
  if (!DEV_AUTH_BYPASS) return null;
  return (
    <div style={{
      position: "fixed", bottom: 8, left: 8, zIndex: 99999, pointerEvents: "none",
      fontFamily: FM, fontSize: 8, fontWeight: 800, letterSpacing: 1.5,
      color: "#f7c948", background: "rgba(247,201,72,0.10)",
      border: "1px solid rgba(247,201,72,0.40)", borderRadius: 5, padding: "3px 8px",
    }}>
      ⚠ DEV AUTH BYPASS · LOCAL MODE
    </div>
  );
}

export default function AuthGate({ onAccess }) {
  useEffect(() => {
    if (DEV_AUTH_BYPASS) {
      console.warn("[DEV] Auth bypass active — running in local mode, no account. Never active in production.");
      onAccess(null);
    }
  }, [onAccess]);

  if (DEV_AUTH_BYPASS) return null;

  // Supabase configured → real accounts; otherwise legacy single-user code gate.
  if (supabaseConfigured()) return <SupabaseGate onAccess={(user) => onAccess(user)} />;
  return <AccessGate onAccess={() => onAccess(null)} />;
}
