"use client";
// MultiAgentSignal.jsx — V.8.2
// Replaces KronosSignalEngine.jsx. Shows the multi-agent vote, trade plan,
// FIRE/HOLD/SCAN status, logs every FIRE signal to the Shadow Account,
// and manages paper trading positions.

import { useState, useEffect, useRef, useCallback } from "react";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

const dirColor = (d) => d === "LONG" ? "#00e676" : d === "SHORT" ? "#ff3d57" : "#7A9AB5";
const sigColor = (s) => s === "bullish" ? "#00e676" : s === "bearish" ? "#ff3d57" : "#7A9AB5";
const statusColor = (s) => s === "FIRE" ? "#00e676" : s === "HOLD" ? "#f7c948" : "#7eb8f7";

// ── Shadow account helpers (localStorage) ─────────────────────────────────────
export function logShadowSignal(sig) {
  try {
    const arr = JSON.parse(localStorage.getItem("kronos_shadow") || "[]");
    // Dedup: skip if same symbol+direction fired in last 30 min
    const recent = arr.find(s => s.symbol === sig.symbol && s.direction === sig.direction && Date.now() - s.time < 30 * 60000);
    if (recent) return;
    arr.push(sig);
    localStorage.setItem("kronos_shadow", JSON.stringify(arr.slice(-100)));
  } catch {}
}

// ── Paper trading helpers ─────────────────────────────────────────────────────
export function getPaperState() {
  try { return JSON.parse(localStorage.getItem("kronos_paper") || '{"balance":10000,"positions":[],"history":[],"startedAt":null}'); }
  catch { return { balance: 10000, positions: [], history: [], startedAt: null }; }
}
export function savePaperState(s) {
  try { localStorage.setItem("kronos_paper", JSON.stringify(s)); } catch {}
}

function AgentCard({ a, T }) {
  const c = sigColor(a.signal);
  return (
    <div style={{
      padding: "9px 11px", borderRadius: 8, marginBottom: 6,
      background: `${c}08`, border: `1px solid ${c}22`, borderLeft: `3px solid ${c}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: T?.text ?? "#E2EDF8" }}>{a.agent}</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: c }}>{a.signal.toUpperCase()}</span>
          <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, color: c }}>{a.confidence}%</span>
        </div>
      </div>
      {(a.reasons || []).slice(0, 3).map((r, i) => (
        <div key={i} style={{ fontFamily: FC, fontSize: 9.5, color: T?.dim ?? "#7A9AB5", lineHeight: 1.45 }}>• {r}</div>
      ))}
    </div>
  );
}

export default function MultiAgentSignal({ accent = "#00d4aa", T, symbol = "NQ", interval = "15min", assetClass = "futures", propRules = null, paperMode = false, onPaperTrade = null }) {
  const surface = T?.surface ?? "#0A1018";
  const border  = T?.border  ?? "#1A2535";
  const text    = T?.text    ?? "#E2EDF8";
  const dim     = T?.dim     ?? "#7A9AB5";

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [lastFetch, setLast]  = useState(null);
  const firedRef = useRef(new Set());

  const fetchSignal = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ symbol, interval, assetClass });
      if (propRules?.minConviction)  params.set("minConviction", propRules.minConviction);
      if (propRules?.dailyLossUsed != null)  params.set("dailyLossUsed", propRules.dailyLossUsed);
      if (propRules?.dailyLossLimit != null) params.set("dailyLossLimit", propRules.dailyLossLimit);
      const r = await fetch(`/api/multi-agent-signal?${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Signal engine error");
      setData(d);
      setLast(new Date());

      // On FIRE: log to shadow account + optionally open paper position
      if (d.status === "FIRE" && d.plan) {
        const key = `${d.symbol}-${d.direction}-${Math.round(d.plan.entry)}`;
        if (!firedRef.current.has(key)) {
          firedRef.current.add(key);
          const sig = {
            id: Date.now(), time: Date.now(), symbol: d.symbol, direction: d.direction,
            entry: d.plan.entry, stop: d.plan.stop, t1: d.plan.t1, t2: d.plan.t2,
            conviction: d.conviction, interval, assetClass,
          };
          logShadowSignal(sig);
          if (paperMode && onPaperTrade) onPaperTrade(sig);
        }
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [symbol, interval, assetClass, propRules, paperMode, onPaperTrade]);

  useEffect(() => {
    fetchSignal();
    const t = setInterval(fetchSignal, 90000); // refresh every 90s
    return () => clearInterval(t);
  }, [fetchSignal]);

  const st = data?.status;

  return (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${border}` }}>
        <div>
          <div style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: text, letterSpacing: 2 }}>KRONOS MULTI-AGENT</div>
          <div style={{ fontFamily: FM, fontSize: 7, color: dim, marginTop: 2, letterSpacing: 1 }}>
            {symbol} · {interval} · {lastFetch ? lastFetch.toLocaleTimeString() : "…"}
          </div>
        </div>
        <button onClick={fetchSignal} disabled={loading} style={{
          fontFamily: FM, fontSize: 8, color: loading ? dim : accent, background: "transparent",
          border: `1px solid ${loading ? border : accent + "30"}`, borderRadius: 5, padding: "4px 9px",
          cursor: loading ? "default" : "pointer", letterSpacing: 1,
        }}>{loading ? "VOTING..." : "REFRESH"}</button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", fontFamily: FM, fontSize: 9, color: "#ff3d57" }}>⚠ {error}</div>
      )}

      {data && (
        <div style={{ padding: 14 }}>
          {/* Status banner */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "10px 14px", borderRadius: 9, marginBottom: 12,
            background: `${statusColor(st)}0d`, border: `1px solid ${statusColor(st)}35`,
          }}>
            <div>
              <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginBottom: 2 }}>SIGNAL STATUS</div>
              <div style={{ fontFamily: FM, fontSize: 17, fontWeight: 900, color: statusColor(st), letterSpacing: 1 }}>
                {st === "FIRE" ? `⚡ FIRE — ${data.direction}` : st === "HOLD" ? `HOLD — ${data.direction} forming` : "SCANNING"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: FM, fontSize: 22, fontWeight: 900, color: dirColor(data.direction), lineHeight: 1 }}>{data.conviction}%</div>
              <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1, marginTop: 2 }}>CONVICTION</div>
            </div>
          </div>

          {/* Bull vs Bear weight bar */}
          <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 12, background: "#1A2535" }}>
            <div style={{ width: `${data.bullWeight}%`, background: "#00e676", transition: "width 0.6s" }} />
            <div style={{ flex: 1 }} />
            <div style={{ width: `${data.bearWeight}%`, background: "#ff3d57", transition: "width 0.6s" }} />
          </div>

          {/* Trade plan */}
          {data.plan && (
            <div style={{
              padding: "10px 12px", borderRadius: 8, marginBottom: 12,
              background: "#05080F", border: `1px solid ${dirColor(data.direction)}30`,
            }}>
              <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 2, marginBottom: 7 }}>TRADE PLAN</div>
              {[["ENTRY", data.plan.entry, text], ["STOP", data.plan.stop, "#ff3d57"], ["T1 (1.5R)", data.plan.t1, "#00e676"], ["T2 (3R)", data.plan.t2, "#00e676"]].map(([l, v, c]) => (
                <div key={l} style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1 }}>{l}</span>
                  <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, color: c }}>${Number(v).toFixed(2)}</span>
                </div>
              ))}
              {data.plan.contractGuidance && (
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px solid ${border}` }}>
                  <span style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 2 }}>CONTRACT GUIDANCE</span>
                  <div style={{ fontFamily: FM, fontSize: 9.5, fontWeight: 700, color: "#a78bfa", marginTop: 3, lineHeight: 1.5 }}>
                    {data.plan.contractGuidance}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Agent votes */}
          <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 2, marginBottom: 7 }}>AGENT VOTES</div>
          {(data.agents || []).map((a, i) => <AgentCard key={i} a={a} T={T} />)}

          {/* Risk gate */}
          {data.risk && (
            <div style={{
              padding: "8px 11px", borderRadius: 8, marginTop: 6,
              background: data.risk.approved ? "rgba(0,230,118,0.05)" : "rgba(255,61,87,0.05)",
              border: `1px solid ${data.risk.approved ? "rgba(0,230,118,0.2)" : "rgba(255,61,87,0.2)"}`,
            }}>
              <div style={{ fontFamily: FM, fontSize: 8, fontWeight: 800, letterSpacing: 1.5, marginBottom: 4, color: data.risk.approved ? "#00e676" : "#ff3d57" }}>
                RISK GATE — {data.risk.approved ? "APPROVED" : "BLOCKED"}
              </div>
              {(data.risk.reasons || []).map((r, i) => (
                <div key={i} style={{ fontFamily: FC, fontSize: 9.5, color: dim, lineHeight: 1.45 }}>• {r}</div>
              ))}
            </div>
          )}

          <div style={{ fontFamily: FM, fontSize: 7, color: dim, marginTop: 10, opacity: 0.5 }}>
            {data.candleCount} candles · Yahoo Finance data · agents: Technical / Structure / Sentiment / Risk
          </div>
        </div>
      )}
    </div>
  );
}
