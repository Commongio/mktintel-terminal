"use client";
// PushAlerts.jsx — V11 M3: the "notify me when Kronos FIREs" control.
//
// This is the payoff of the whole mobile phase: for a signals product the killer
// feature isn't the layout, it's the alert reaching you when you're away from the
// desk. Everything here is honest about platform reality rather than failing
// silently — iOS in particular hides push behind a home-screen install, and a
// toggle that just does nothing would be worse than no toggle.
import Icon from "./Icons";

import { useEffect, useState, useCallback, useRef } from "react";
import { getSupabase, supabaseConfigured, getAccessToken } from "../../lib/supabase";

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

export default function PushAlerts({ T, accent, user, alertPrefs = null }) {
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#9DB4CC";
  const border = T?.border ?? "#24313F";
  const surface = T?.surface ?? "#0A1018";

  const [supported, setSupported] = useState(null); // null = still checking
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [needsInstall, setNeedsInstall] = useState(false);
  // V13.6: which signals push. 'fire' (default) = only fired/actionable setups;
  // 'all' also pushes HOLD (forming). Persisted per-device on the subscription.
  const [notifyLevel, setNotifyLevel] = useState(() => {
    try { return localStorage.getItem("kronos_notify_level") || "fire"; } catch { return "fire"; }
  });

  // V14.5: `enable` is a stable callback (empty deps), so reading alertPrefs
  // directly would capture the value from first render and register stale
  // routing. A ref keeps the latest without re-creating the subscribe handler.
  const prefsRef = useRef(alertPrefs);
  useEffect(() => { prefsRef.current = alertPrefs; }, [alertPrefs]);

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

        // V14.7 SELF-HEAL. The toggle's state came purely from the BROWSER's
        // subscription, but sends depend on a row in push_subscriptions — and the
        // two can drift apart:
        //   • the subscribe POST failed auth (expired token) and rolled back
        //     server-side, yet a browser subscription survived;
        //   • the row was pruned as dead after a 404/410;
        //   • the row predates a schema change.
        // In every case the UI cheerfully said "alerts on" while the server had
        // nobody to send to — which is exactly what "the feed fills but my phone
        // is silent" looks like. Re-upserting the existing subscription is
        // idempotent (unique on endpoint), so this costs one request and
        // guarantees the server agrees with the browser.
        if (existing) {
          const token = await getAccessToken();
          if (token) {
            let minConviction = 65;
            try { minConviction = Number(localStorage.getItem("kronos_min_conviction")) || 65; } catch {}
            let level = "fire";
            try { level = localStorage.getItem("kronos_notify_level") || "fire"; } catch {}
            await fetch("/api/push/subscribe", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                subscription: existing.toJSON(), minConviction, notifyLevel: level,
                alertSides: prefsRef.current?.sides,
                alertTimeframes: prefsRef.current?.timeframes,
                alertCaps: prefsRef.current?.caps,
              }),
            }).catch(() => {}); // best-effort: never block the UI on a re-sync
          }
        }
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

      const token = await getAccessToken(); // V14.7: refreshes an expired token instead of sending a dead one
      const r = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        // V14.5: the side/timeframe/cap routing travels WITH the subscription so
        // the server filter is the same one the feed applies. Omitted keys mean
        // "no preference" server-side, which reads as allow-all.
        body: JSON.stringify({
          subscription: sub.toJSON(), minConviction, notifyLevel,
          alertSides: prefsRef.current?.sides,
          alertTimeframes: prefsRef.current?.timeframes,
          alertCaps: prefsRef.current?.caps,
        }),
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

  // Changing routing while subscribed must reach the server, or the phone keeps
  // getting the old set. Debounced so dragging through several chips is one write.
  const prefsSig = JSON.stringify(alertPrefs ?? {});
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; } // skip initial
    if (!subscribed || !alertPrefs) return;
    const id = setTimeout(() => { enable(); }, 600);
    return () => clearTimeout(id);
  }, [prefsSig, subscribed, alertPrefs, enable]);

  const disable = useCallback(async () => {
    setBusy(true); setMsg("");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const token = await getAccessToken(); // V14.7: refreshes an expired token instead of sending a dead one
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

  const [diag, setDiag] = useState(null);
  const runDiagnose = useCallback(async () => {
    setBusy(true); setMsg(""); setDiag(null);
    try {
      const token = await getAccessToken(); // V14.7: refreshes an expired token instead of sending a dead one
      const r = await fetch("/api/push/diagnose", { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || "Diagnostic failed."); setBusy(false); return; }
      setDiag(d);
    } catch (e) { setMsg(`Diagnostic failed: ${e.message}`); }
    setBusy(false);
  }, []);

  const sendTest = useCallback(async () => {
    setBusy(true); setMsg("");
    try {
      const token = await getAccessToken(); // V14.7: refreshes an expired token instead of sending a dead one
      const r = await fetch("/api/push/test", {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      const d = await r.json();
      if (!r.ok) { setMsg(d.error || "Test failed."); setBusy(false); return; }
      // V13.5: surface the real reason a send failed (VAPID mismatch, expired
      // sub) instead of a bare "sent to 0 devices" — that's the whole point of
      // the mobile-push diagnosis.
      if (d.sent > 0) setMsg(`Test sent to ${d.sent} device${d.sent === 1 ? "" : "s"}.${d.pruned ? ` (${d.pruned} stale removed.)` : ""}`);
      else if (d.hint) setMsg(d.hint);
      else if (d.failures?.length) setMsg(`Send failed (HTTP ${d.failures[0].statusCode || "?"}). ${d.failures[0].body || ""}`);
      else setMsg(`No devices received it (${d.devices} subscribed).`);
    } catch (e) { setMsg(`Test failed: ${e.message}`); }
    setBusy(false);
  }, []);

  const box = { marginBottom: 18, padding: "12px 13px", borderRadius: 9, background: surface, border: `1px solid ${border}` };
  const label = { fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, fontWeight: 700, marginBottom: 9 };
  const note = { fontFamily: FC, fontSize: 10, color: dim, lineHeight: 1.55 };

  if (supported === null) return null; // still checking — don't flash a wrong state

  return (
    <div style={box}>
      <div style={label}> SIGNAL ALERTS</div>

      {needsInstall ? (
        // The single most confusing mobile failure mode, handled explicitly.
        <div style={note}>
          <b style={{ color: "#C9A15B" }}>Install KRONOS to your home screen first.</b><br />
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

          {/* V13.6: notification tier — makes the FIRE-only default EXPLICIT and
              lets the user opt into forming setups too, instead of silently
              swallowing everything but FIRE. Changing it while subscribed
              re-registers the device with the new level. */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1.5, marginBottom: 6 }}>NOTIFY ME ON</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[["fire", "FIRE only", "Actionable setups"], ["all", "FIRE + forming", "Also HOLD setups"]].map(([lvl, label, hint]) => (
                <button key={lvl}
                  onClick={async () => { setNotifyLevel(lvl); try { localStorage.setItem("kronos_notify_level", lvl); } catch {} if (subscribed) { setTimeout(enable, 0); } }}
                  title={hint}
                  style={{
                    flex: 1, padding: "8px 6px", borderRadius: 7, cursor: "pointer",
                    fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                    color: notifyLevel === lvl ? accent : dim,
                    background: notifyLevel === lvl ? `${accent}12` : "transparent",
                    border: `1px solid ${notifyLevel === lvl ? `${accent}35` : border}`,
                  }}>{label}</button>
              ))}
            </div>
            <div style={{ ...note, fontSize: 9, marginTop: 6 }}>
              By design, push fires on <b style={{ color: text }}>FIRE</b> signals only — HOLD/SCAN are context, not calls to action. Switch to <b style={{ color: text }}>FIRE + forming</b> if you want the earlier heads-up too.
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={subscribed ? disable : enable} disabled={busy}
              style={{
                flex: 1, minWidth: 130, minHeight: 44, borderRadius: 8, cursor: busy ? "default" : "pointer",
                fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 1,
                color: subscribed ? "#C9576B" : accent,
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

          {/* V14.6: "test works but real signals never arrive" is the single most
              confusing failure this feature has, because every filter that can
              drop a push is invisible. This replays real signals through the
              actual send-path gate and reports what it found. */}
          {subscribed && (
            <button onClick={runDiagnose} disabled={busy}
              style={{
                width: "100%", marginTop: 8, minHeight: 40, borderRadius: 8,
                cursor: busy ? "default" : "pointer", fontFamily: FM, fontSize: 9.5,
                fontWeight: 700, letterSpacing: 1, color: dim,
                background: "transparent", border: `1px dashed ${border}`, opacity: busy ? 0.6 : 1,
              }}>
              WHY AM I NOT GETTING ALERTS?
            </button>
          )}

          {diag && (
            <div style={{ marginTop: 9, padding: "10px 11px", borderRadius: 8, background: surface, border: `1px solid ${border}` }}>
              <div style={{ ...note, color: text, marginBottom: 7 }}>{diag.verdict}</div>
              <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1, marginBottom: 5 }}>
                {diag.devices} DEVICE{diag.devices === 1 ? "" : "S"} · {diag.deliverableOfLast15}/15 RECENT SIGNALS PASS FILTERS
              </div>
              {(diag.recent || []).slice(0, 6).map((r, i) => (
                <div key={i} style={{ fontFamily: FM, fontSize: 8, color: dim, lineHeight: 1.5 }}>
                  <span style={{ color: r.wouldPush ? "#4FA97B" : "#C9576B" }}>{r.wouldPush ? "" : ""}</span>{" "}
                  <span style={{ color: text }}>{r.symbol}</span> {r.side}/{r.interval} {r.status} {r.conviction}%
                  {r.why ? ` — ${r.why}` : ""}
                </div>
              ))}
            </div>
          )}
          {msg && <div style={{ ...note, marginTop: 9, color: text }}>{msg}</div>}
        </>
      )}
    </div>
  );
}
