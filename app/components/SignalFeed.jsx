"use client";
// SignalFeed.jsx — V9 server-generated standardized signal feed.
// Reads the `signals` table (written by /api/cron/generate-signals) and
// live-updates via Supabase Realtime. Renders a friendly note when the
// multi-tenant backend isn't configured (local single-user mode).
import { useState, useEffect } from "react";
import { getSupabase, supabaseConfigured } from "../../lib/supabase";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

const stColor = (s) => (s === "FIRE" ? "#00e676" : s === "HOLD" ? "#f7c948" : "#7eb8f7");
const dirColor = (d) => (d === "LONG" ? "#00e676" : d === "SHORT" ? "#ff3d57" : "#7A9AB5");

export default function SignalFeed({ accent = "#00d4aa", T, assetClass = "futures" }) {
  const surface = T?.surface ?? "#0A1018";
  const border = T?.border ?? "#1A2535";
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#7A9AB5";

  const [rows, setRows] = useState([]);
  const [state, setState] = useState(supabaseConfigured() ? "loading" : "unconfigured");

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    let channel;
    let cancelled = false;

    (async () => {
      const { data, error } = await sb.from("signals")
        .select("id,asset_class,symbol,interval,status,direction,conviction,plan,created_at")
        .eq("asset_class", assetClass)
        .order("created_at", { ascending: false })
        .limit(20);
      if (cancelled) return;
      if (error) { setState("error"); return; }
      setRows(data || []);
      setState((data || []).length ? "live" : "empty");

      channel = sb.channel("signals-feed")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "signals" }, (payload) => {
          if (payload.new?.asset_class === assetClass) {
            setRows((prev) => [payload.new, ...prev].slice(0, 20));
            setState("live");
          }
        })
        .subscribe();
    })();

    return () => { cancelled = true; if (channel) getSupabase()?.removeChannel(channel); };
  }, [assetClass]);

  return (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, overflow: "hidden", marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 13px", borderBottom: `1px solid ${border}` }}>
        <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: text, letterSpacing: 2 }}>SERVER SIGNAL FEED</span>
        <span style={{ fontFamily: FM, fontSize: 7, color: state === "live" ? "#00e676" : dim, letterSpacing: 1 }}>
          {state === "live" ? "● LIVE" : state === "loading" ? "…" : state === "empty" ? "WAITING" : state === "unconfigured" ? "LOCAL MODE" : "OFFLINE"}
        </span>
      </div>

      {state === "unconfigured" && (
        <div style={{ padding: "12px 13px", fontFamily: FC, fontSize: 10, color: dim, lineHeight: 1.6 }}>
          Multi-user backend not configured — the panel above scans live for you instead.
          Once Supabase is connected (see SETUP_V9.md), server-generated signals for every symbol appear here in real time.
        </div>
      )}
      {state === "empty" && (
        <div style={{ padding: "12px 13px", fontFamily: FC, fontSize: 10, color: dim, lineHeight: 1.6 }}>
          No server signals yet — the cron job writes them every 5 minutes during market hours.
        </div>
      )}
      {state === "error" && (
        <div style={{ padding: "12px 13px", fontFamily: FM, fontSize: 9, color: "#ff3d57" }}>⚠ Could not load signal feed.</div>
      )}

      {rows.length > 0 && (
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 13px", borderBottom: `1px solid ${border}55` }}>
              <div>
                <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                  <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 800, color: stColor(r.status), letterSpacing: 1 }}>
                    {r.status === "FIRE" ? "⚡ SETUP DETECTED" : r.status === "HOLD" ? "FORMING" : "NO SETUP"}
                  </span>
                  <span style={{ fontFamily: FM, fontSize: 10, fontWeight: 700, color: dirColor(r.direction) }}>
                    {r.direction !== "NEUTRAL" ? `${r.direction} ` : ""}{r.symbol}
                  </span>
                  <span style={{ fontFamily: FM, fontSize: 8, color: dim }}>{r.conviction}%</span>
                </div>
                {r.plan?.entry != null && (
                  <div style={{ fontFamily: FM, fontSize: 7.5, color: dim, marginTop: 2 }}>
                    E {Number(r.plan.entry).toFixed(2)} · S {Number(r.plan.stop).toFixed(2)} · T1 {Number(r.plan.t1).toFixed(2)}
                    {r.plan.contractGuidance ? ` · ${r.plan.contractGuidance}` : ""}
                  </div>
                )}
              </div>
              <span style={{ fontFamily: FM, fontSize: 7.5, color: dim }}>{new Date(r.created_at).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
