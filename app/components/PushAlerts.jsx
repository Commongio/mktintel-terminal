"use client";
// PushAlerts.jsx — V11 M3: the "notify me when Kronos FIREs" control.
//
// This is the payoff of the whole mobile phase: for a signals product the killer
// feature isn't the layout, it's the alert reaching you when you're away from the
// desk. Everything here is honest about platform reality rather than failing
// silently — iOS in particular hides push behind a home-screen install, and a
// toggle that just does nothing would be worse than no toggle.

import { useEffect, useState, useCallback } from "react";
import { getSupabase, supabaseConfigured } from "../../lib/supabase";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

// VAPID public keys are base64url; PushManager wants a Uint8Array.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS 13+ reports as Mac; the touch check disambiguates.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;

export default function PushAlerts({ T, accent, user }) {
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#7A9AB5";
  const border = T?.border ?? "#1A2535";
  const surface = T?.surface ?? "#0A1018";

  const [supported, setSupported] = useState(null); // null = still checking
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [needsInstall, setNeedsInstall] = useState(false);

  useEffect(() => {
    const ok = typeof window !== "undefined" &&
      "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    // The iOS trap: Safari exposes no PushManager until the app is installed to
    // the home screen. Detect that specific case so we can TELL the user how to
    // fix it instead of just reporting "unsupported".
    if (!ok && isIOS() && !isStandalone()) { setSupported(false); setNeedsInstall(true); return; }
    setSupported(ok);
    if (!ok) return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const existing = await reg.pushManager.getSubscription();
        setSubscribed(!!existing);
      } catch { setSupported(false); }
    })();
  }, []);

  const enable = useCallback(async () => {
    setBusy(true); setMsg("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg(perm === "denied"
          ? "Blocked. Your browser is set to deny notifications for this site — you'll need to re-allow it in site settings."
          : "Permission dismissed.");
        setBusy(false); return;
      }
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) { setMsg("Push isn't configured on this deployment (no VAPID key)."); setBusy(false); return; }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,           // required by Chrome; we always show a notification
        applicationServerKey: urlBase64ToUint8Array(key),
      });

      // Mirror the user's own conviction bar so a push respects the same
      // threshold their feed does.
      let minConviction = 65;
      try { minConviction = Number(localStorage.getItem("kronos_min_conviction")) || 65; } catch {}

      const token = (await getSupabase()?.auth.getSession())?.data?.session?.access_token;
      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ subscription: sub.toJSON(), minConviction }),
      });
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || "Couldn't save subscription."); await sub.unsubscribe(); setBusy(false); return; }
      setSubscribed(true);
      setMsg(`On. You'll get a push when Kronos fires at ${minConviction}%+.`);
    } catch (e) {
      setMsg(`Couldn't enable: ${e.message}`);
    }
    setBusy(false);
  }, []);

  const disable = useCallback(async () => {
    setBusy(true); setMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const token = (await getSupabase()?.auth.getSession())?.data?.session?.access_token;
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setSubscribed(false); setMsg("Alerts off.");
    } catch (e) { setMsg(`Couldn't disable: ${e.message}`); }
    setBusy(false);
  }, []);

  const sendTest = useCallback(async () => {
    setBusy(true); setMsg("");
    try {
      const token = (await getSupabase()?.auth.getSession())?.data?.session?.access_token;
      const r = await fetch("/api/push/test", {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const d = await r.json();
      setMsg(r.ok ? `Test sent to ${d.sent} device${d.sent === 1 ? "" : "s"}.` : (d.error || "Test failed."));
    } catch (e) { setMsg(`Test failed: ${e.message}`); }
    setBusy(false);
  }, []);

  const box = { marginBottom: 18, padding: "12px 13px", borderRadius: 9, background: surface, border: `1px solid ${border}` };
  const label = { fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, fontWeight: 700, marginBottom: 9 };
  const note = { fontFamily: FC, fontSize: 10, color: dim, lineHeight: 1.55 };

  if (supported === null) return null; // still checking — don't flash a wrong state

  return (
    <div style={box}>
      <div style={label}>🔔 SIGNAL ALERTS</div>

      {needsInstall ? (
        // The single most confusing mobile failure mode, handled explicitly.
        <div style={note}>
          <b style={{ color: "#f7c948" }}>Install KRONOS to your home screen first.</b><br />
          On iPhone, Apple only allows notifications for apps added to the home screen.
          Tap <b style={{ color: text }}>Share</b> → <b style={{ color: text }}>Add to Home Screen</b>,
          then open KRONOS from that icon and come back here. (Requires iOS 16.4 or later.)
        </div>
      ) : !supported ? (
        <div style={note}>This browser doesn&apos;t support push notifications.</div>
      ) : !user || !supabaseConfigured() ? (
        <div style={note}>Sign in to enable signal alerts — they&apos;re tied to your account.</div>
      ) : (
        <>
          <div style={{ ...note, marginBottom: 10 }}>
            Get a notification the moment Kronos fires a setup that clears your conviction
            threshold — even when the terminal is closed. Uses your current threshold from the
            bot&apos;s Studio tab.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={subscribed ? disable : enable} disabled={busy}
              style={{
                flex: 1, minWidth: 130, minHeight: 44, borderRadius: 8, cursor: busy ? "default" : "pointer",
                fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 1,
                color: subscribed ? "#ff3d57" : accent,
                background: subscribed ? "rgba(255,61,87,0.08)" : `${accent}12`,
                border: `1px solid ${subscribed ? "rgba(255,61,87,0.35)" : `${accent}35`}`,
                opacity: busy ? 0.6 : 1,
              }}>
              {busy ? "…" : subscribed ? "TURN OFF ALERTS" : "TURN ON ALERTS"}
            </button>
            {subscribed && (
              <button onClick={sendTest} disabled={busy}
                style={{
                  minWidth: 90, minHeight: 44, borderRadius: 8, cursor: busy ? "default" : "pointer",
                  fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 1,
                  color: dim, background: "transparent", border: `1px solid ${border}`, opacity: busy ? 0.6 : 1,
                }}>
                TEST
              </button>
            )}
          </div>
          {msg && <div style={{ ...note, marginTop: 9, color: text }}>{msg}</div>}
        </>
      )}
    </div>
  );
}
