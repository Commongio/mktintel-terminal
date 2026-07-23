"use client";
// AuthGate.jsx — V9 multi-tenant gate.
// When Supabase is configured: real sign-in / sign-up (signup burns a one-time
// registration code). When it isn't: falls back to the legacy AccessGate so the
// terminal keeps working as a single-user local app.
import { useState, useEffect, useRef } from "react";
import AccessGate from "./AccessGate";
import { getSupabase, supabaseConfigured } from "../../lib/supabase";

const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";

// V13.5: starry-galaxy login backdrop. Canvas (not the stars.mp4 video) so it's
// fully self-contained, DPR-crisp, and degrades to a static starfield under
// reduced-motion instead of a frozen video frame. A faint teal nebula bloom +
// twinkling stars + a slow drift — premium, not "vibe-coded".
function GalaxyBackdrop() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let raf, w, h, dpr, stars;
    const seed = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.min(220, Math.round((w * h) / 6000));
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.3 + 0.2,
        base: Math.random() * 0.5 + 0.25,
        tw: Math.random() * Math.PI * 2,
        tws: Math.random() * 0.03 + 0.008,
        warm: Math.random() < 0.15,
      }));
    };
    const paint = (t) => {
      ctx.clearRect(0, 0, w, h);
      // Two soft nebula blooms for depth.
      const bloom = (cx, cy, rad, col) => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      };
      bloom(w * 0.72, h * 0.30, Math.max(w, h) * 0.5, "rgba(0,150,130,0.10)");
      bloom(w * 0.22, h * 0.78, Math.max(w, h) * 0.45, "rgba(80,60,160,0.09)");
      for (const s of stars) {
        s.tw += s.tws;
        const a = s.base + Math.sin(s.tw) * 0.25;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = s.warm ? `rgba(255,225,190,${a})` : `rgba(200,225,255,${a})`;
        ctx.fill();
        if (!reduce) { s.y += 0.015 + s.r * 0.01; if (s.y > h + 2) s.y = -2; }
      }
      if (!reduce) raf = requestAnimationFrame(paint);
    };
    seed(); paint(0);
    const onResize = () => { seed(); if (reduce) paint(0); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}

// KRONOS in Greek — the titan the terminal is named for. Used as a faint,
// oversized watermark behind the card and as a small mark under the wordmark.
const KRONOS_GREEK = "ΚΡΟΝΟΣ";

function Field({ label, type = "text", value, onChange, placeholder, autoFocus, onEnter }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: FM, fontSize: 7, letterSpacing: 3, color: "#2a3a4a", fontWeight: 700, marginBottom: 5 }}>{label}</div>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, background: "#060910",
        border: `1px solid ${focused ? "rgba(0,212,170,0.3)" : "#16253a"}`,
        borderRadius: 9, padding: "11px 14px", transition: "border-color 0.15s",
      }}>
        <span style={{ color: "#00d4aa", fontSize: 12, flexShrink: 0 }}>▸</span>
        <input
          type={type} value={value} autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{ flex: 1, background: "transparent", border: "none", color: "#c8d8e8", fontFamily: FM, fontSize: 13, fontWeight: 600, letterSpacing: 1, width: "100%" }}
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

  return (
    <div style={{ position: "fixed", inset: 0, background: "radial-gradient(ellipse at 70% 20%, #0a1420 0%, #05080f 60%, #03050a 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FM, zIndex: 9999, overflow: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@700;800&family=JetBrains+Mono:wght@400;600;700;800&display=swap');
        @keyframes ag-pulse { 0%,100%{opacity:0.55;} 50%{opacity:1;} }
        @keyframes ag-appear { from{opacity:0;transform:translateY(12px);} to{opacity:1;transform:translateY(0);} }
        @keyframes ag-drift { 0%,100%{opacity:0.05;} 50%{opacity:0.11;} }
      `}</style>

      <GalaxyBackdrop />

      {/* Oversized Greek KRONOS watermark — a quiet nod to the titan, well behind
          the card so it never competes with the form. */}
      <div aria-hidden="true" style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none", fontFamily: FD, fontWeight: 800, letterSpacing: 8,
        fontSize: "clamp(60px, 16vw, 190px)", color: "#00d4aa", whiteSpace: "nowrap",
        animation: "ag-drift 7s ease-in-out infinite", userSelect: "none",
      }}>{KRONOS_GREEK}</div>

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 22, width: "100%", maxWidth: 430, padding: "0 24px", animation: "ag-appear 0.5s ease" }}>
        <div style={{ position: "relative", width: 74, height: 74, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", width: 74, height: 74, borderRadius: "50%", border: "1px solid #00d4aa1c", animation: "ag-pulse 2.4s ease-in-out infinite" }} />
          <div style={{ position: "absolute", width: 52, height: 52, borderRadius: "50%", background: "radial-gradient(circle at 36% 32%,#00d4aa55,#00d4aa1a 55%,transparent 78%)", animation: "ag-pulse 2.8s ease-in-out infinite" }} />
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "radial-gradient(circle at 34% 30%,#ffffff,#00d4aaee 42%,#00d4aa88 68%,transparent)", boxShadow: "0 0 16px #00d4aa70" }} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: FD, fontSize: 32, fontWeight: 800, color: "#e6f0f8", letterSpacing: 3, marginBottom: 5 }}>KRONOS</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span style={{ height: 1, width: 22, background: "linear-gradient(90deg,transparent,#00d4aa66)" }} />
            <span style={{ fontFamily: FM, fontSize: 8, color: "#5b7085", letterSpacing: 4, fontWeight: 700 }}>{KRONOS_GREEK}</span>
            <span style={{ height: 1, width: 22, background: "linear-gradient(90deg,#00d4aa66,transparent)" }} />
          </div>
          <div style={{ fontFamily: FM, fontSize: 7.5, color: "#33475a", letterSpacing: 4, fontWeight: 700, marginTop: 6 }}>TRADING INTELLIGENCE TERMINAL</div>
        </div>

        {/* Glassmorphic card — soft edge, blur, subtle top highlight. */}
        <div style={{ width: "100%", padding: "24px 28px", background: "rgba(9,15,24,0.72)", border: "1px solid rgba(0,212,170,0.14)", borderRadius: 18, backdropFilter: "blur(16px) saturate(1.1)", WebkitBackdropFilter: "blur(16px) saturate(1.1)", boxShadow: "0 24px 70px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)" }}>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
            {[["login", "SIGN IN"], ["signup", "CREATE ACCOUNT"]].map(([k, label]) => (
              <button key={k} onClick={() => { setTab(k); setError(""); setNotice(""); }} style={{
                flex: 1, padding: "9px 0", fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 2,
                color: tab === k ? "#00d4aa" : "#2a3a4a",
                background: tab === k ? "rgba(0,212,170,0.08)" : "transparent",
                border: `1px solid ${tab === k ? "rgba(0,212,170,0.3)" : "#16253a"}`,
                borderRadius: 7, cursor: "pointer",
              }}>{label}</button>
            ))}
          </div>

          <Field label="EMAIL" value={email} onChange={setEmail} placeholder="you@example.com" autoFocus onEnter={submit} />
          <Field label="PASSWORD" type="password" value={password} onChange={setPassword} placeholder={tab === "signup" ? "min. 8 characters" : "••••••••"} onEnter={submit} />
          {tab === "signup" && (
            <Field label="REGISTRATION CODE (ONE-TIME USE)" value={regCode}
              onChange={(v) => setRegCode(v.toUpperCase().replace(/[^A-Z0-9-]/g, ""))}
              placeholder="KRN-XXXXXX" onEnter={submit} />
          )}

          {error && <div style={{ fontFamily: FM, fontSize: 9, color: "#ff4d6d", letterSpacing: 1, margin: "6px 0 10px", textAlign: "center", lineHeight: 1.5 }}>⚠ {error}</div>}
          {notice && <div style={{ fontFamily: FM, fontSize: 9, color: "#00d4aa", letterSpacing: 1, margin: "6px 0 10px", textAlign: "center" }}>{notice}</div>}

          <button onClick={submit} disabled={!canSubmit || loading} style={{
            width: "100%", padding: "13px 0", marginTop: 4,
            background: canSubmit && !loading ? "linear-gradient(135deg,rgba(0,212,170,0.16),rgba(0,212,170,0.07))" : "transparent",
            border: `1px solid ${canSubmit && !loading ? "rgba(0,212,170,0.38)" : "#16253a"}`,
            borderRadius: 8, color: canSubmit && !loading ? "#00d4aa" : "#2a3a4a",
            fontFamily: FM, fontSize: 11, fontWeight: 700, letterSpacing: 3,
            cursor: canSubmit && !loading ? "pointer" : "default",
          }}>
            {loading ? "WORKING..." : tab === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
          </button>
          {tab === "signup" && (
            <div style={{ fontFamily: FM, fontSize: 7.5, color: "#2a3a4a", letterSpacing: 1, marginTop: 10, textAlign: "center", lineHeight: 1.6 }}>
              Each registration code works exactly once and is tied to your account.
            </div>
          )}
        </div>
        <div style={{ fontFamily: FM, fontSize: 7, color: "#141e2a", letterSpacing: 3, textAlign: "center" }}>
          UNAUTHORIZED ACCESS IS MONITORED AND PROHIBITED
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
