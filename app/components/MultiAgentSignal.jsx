"use client";
// MultiAgentSignal.jsx — V.8.2
// Replaces KronosSignalEngine.jsx. Shows the multi-agent vote, trade plan,
// FIRE/HOLD/SCAN status, logs every FIRE signal to the Shadow Account,
// and manages paper trading positions.

import { useState, useEffect, useRef, useCallback } from "react";
import TickerLogo from "./TickerLogo";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

const dirColor = (d) => d === "LONG" ? "#00e676" : d === "SHORT" ? "#ff3d57" : "#9DB4CC";
const sigColor = (s) => s === "bullish" ? "#00e676" : s === "bearish" ? "#ff3d57" : "#9DB4CC";
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

// ── Paper trading helpers (V10: separate account per asset class) ─────────────
const EMPTY_PAPER = '{"balance":10000,"positions":[],"history":[],"startedAt":null}';
export function getPaperState(assetClass = "futures") {
  try {
    const key = `kronos_paper_${assetClass}`;
    let raw = localStorage.getItem(key);
    // One-time migration: legacy single account becomes the futures account.
    if (!raw && assetClass === "futures") {
      const legacy = localStorage.getItem("kronos_paper");
      if (legacy) { localStorage.setItem(key, legacy); localStorage.removeItem("kronos_paper"); raw = legacy; }
    }
    return JSON.parse(raw || EMPTY_PAPER);
  } catch { return JSON.parse(EMPTY_PAPER); }
}
export function savePaperState(s, assetClass = "futures") {
  try { localStorage.setItem(`kronos_paper_${assetClass}`, JSON.stringify(s)); } catch {}
}

// What each agent actually measures, and how much it counts. Keyed by the agent
// name the engine emits (lib/signalEngine). Weights mirror the engine's own
// weighting — if you change them there, change them here.
export const AGENT_INFO = {
  TECHNICAL: {
    weight: "35% of the vote",
    what: "Classic momentum and trend indicators on the price series.",
    reads: ["RSI — overbought / oversold pressure", "MACD histogram — momentum shifting", "EMA20 vs EMA50 — trend direction"],
    note: "Fast to react, but it can fire early in a choppy tape. That's why it never decides alone.",
  },
  STRUCTURE: {
    weight: "40% of the vote — the heaviest",
    what: "Smart-money market structure: where price actually broke, swept, or left an imbalance.",
    reads: ["BOS — break of structure (trend continuation)", "Liquidity sweeps — stop hunts above/below swing points", "FVG — fair value gaps price tends to return to"],
    note: "Weighted highest because structure tends to lead indicators rather than lag them.",
  },
  "OPTIONS FLOW": {
    weight: "25% of the vote",
    what: "What the options market is positioned for — the money, not the chart.",
    reads: ["Put/call volume — directional skew", "Unusual strikes — big volume vs open interest", "ATM implied volatility — the move being priced in"],
    note: "Options mode only. In futures mode this slot is a sentiment agent instead.",
  },
  SENTIMENT: {
    weight: "25% of the vote",
    what: "Directional bias from news, session behaviour, and volatility context.",
    reads: ["News/catalyst tone", "Session and volatility regime"],
    note: "Futures mode's counterpart to Options Flow.",
  },
  RISK: {
    weight: "Hard gate — can veto anything",
    what: "The final gate. It does not vote; it blocks.",
    reads: ["Conviction vs your minimum threshold", "Prop-firm rules, if an eval is active"],
    note: "Deliberately plain code, not an AI call — the thing that decides whether real money moves must be auditable and reproducible.",
  },
};

// Small (i) with a rich hover card. Pure CSS hover (no JS state) so it can't get
// stuck open when the panel re-renders under the cursor.
export function InfoDot({ info, accent = "#00d4aa", T }) {
  if (!info) return null;
  const panel = T?.panel ?? "#0A1018";
  const border = T?.border ?? "#1A2535";
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#9DB4CC";
  return (
    <span className="kronos-info" style={{ position: "relative", display: "inline-flex", marginLeft: 5 }}>
      <span tabIndex={0} aria-label="What is this?" style={{
        width: 12, height: 12, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: FM, fontSize: 7.5, fontWeight: 800, color: accent,
        border: `1px solid ${accent}55`, background: `${accent}12`, cursor: "help", flexShrink: 0,
      }}>i</span>
      <span className="kronos-info-card" style={{
        position: "absolute", bottom: "calc(100% + 7px)", left: "50%", transform: "translateX(-50%)",
        width: 250, zIndex: 200, padding: "10px 11px", borderRadius: 9,
        background: panel, border: `1px solid ${accent}45`, boxShadow: "0 10px 34px rgba(0,0,0,0.75)",
        pointerEvents: "none", textAlign: "left",
      }}>
        <span style={{ display: "block", fontFamily: FM, fontSize: 7, fontWeight: 800, letterSpacing: 1.5, color: accent, marginBottom: 5 }}>{info.weight}</span>
        <span style={{ display: "block", fontFamily: FC, fontSize: 10.5, color: text, lineHeight: 1.5, marginBottom: 7 }}>{info.what}</span>
        {info.reads.map((r, i) => (
          <span key={i} style={{ display: "block", fontFamily: FC, fontSize: 9.5, color: dim, lineHeight: 1.5, paddingLeft: 8, textIndent: -8 }}>· {r}</span>
        ))}
        {info.note && (
          <span style={{ display: "block", marginTop: 7, paddingTop: 6, borderTop: `1px solid ${border}`, fontFamily: FC, fontSize: 9.5, color: dim, lineHeight: 1.5, fontStyle: "italic" }}>{info.note}</span>
        )}
      </span>
    </span>
  );
}

function AgentCard({ a, T, accent }) {
  const c = sigColor(a.signal);
  const info = AGENT_INFO[String(a.agent || "").toUpperCase()];
  return (
    <div style={{
      padding: "9px 11px", borderRadius: 8, marginBottom: 6,
      background: `${c}08`, border: `1px solid ${c}22`, borderLeft: `3px solid ${c}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <span style={{ display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: T?.text ?? "#E2EDF8" }}>{a.agent}</span>
          <InfoDot info={info} accent={accent} T={T} />
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: c }}>{a.signal.toUpperCase()}</span>
          <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, color: c }}>{a.confidence}%</span>
        </div>
      </div>
      {(a.reasons || []).slice(0, 3).map((r, i) => (
        <div key={i} style={{ fontFamily: FC, fontSize: 9.5, color: T?.dim ?? "#9DB4CC", lineHeight: 1.45 }}>• {r}</div>
      ))}
    </div>
  );
}

export default function MultiAgentSignal({ accent = "#00d4aa", T, symbol = "NQ", interval = "15min", assetClass = "futures", propRules = null, paperMode = false, onPaperTrade = null, onFire = null }) {
  const surface = T?.surface ?? "#0A1018";
  const border  = T?.border  ?? "#1A2535";
  const text    = T?.text    ?? "#E2EDF8";
  const dim     = T?.dim     ?? "#9DB4CC";

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
          if (onFire) onFire({ ...sig, conviction: d.conviction, status: "FIRE" });
        }
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [symbol, interval, assetClass, propRules, paperMode, onPaperTrade, onFire]);

  useEffect(() => {
    fetchSignal();
    const t = setInterval(fetchSignal, 90000); // refresh every 90s
    return () => clearInterval(t);
  }, [fetchSignal]);

  const st = data?.status;

  return (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, overflow: "visible" }}>
      {/* Info hover-cards. Pure CSS so they can never get stuck open on re-render.
          The panel must NOT clip them — hence overflow:visible above. */}
      <style>{`
        .kronos-info .kronos-info-card { opacity: 0; visibility: hidden; transform: translateX(-50%) translateY(4px); transition: opacity .16s ease, transform .16s ease, visibility .16s; }
        .kronos-info:hover .kronos-info-card,
        .kronos-info:focus-within .kronos-info-card { opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0); }
      `}</style>
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
          {/* Status banner — leads with the SYMBOL so it's never ambiguous which
              instrument this verdict belongs to. */}
          <div style={{
            padding: "11px 14px", borderRadius: 9, marginBottom: 12,
            background: `${statusColor(st)}0d`, border: `1px solid ${statusColor(st)}35`,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${statusColor(st)}22` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <TickerLogo symbol={data.symbol || symbol} size={20} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FM, fontSize: 15, fontWeight: 900, color: text, letterSpacing: 1, lineHeight: 1.1 }}>{data.symbol || symbol}</div>
                  <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1 }}>{interval} · {assetClass.toUpperCase()}</div>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: FM, fontSize: 22, fontWeight: 900, color: dirColor(data.direction), lineHeight: 1 }}>{data.conviction}%</div>
                <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1, marginTop: 2 }}>CONVICTION</div>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: FM, fontSize: 7.5, color: dim, letterSpacing: 2 }}>SIGNAL STATUS</span>
              <span style={{ fontFamily: FM, fontSize: 14, fontWeight: 900, color: statusColor(st), letterSpacing: 0.5, textAlign: "right" }}>
                {st === "FIRE" ? `⚡ FIRE — ${data.direction}` : st === "HOLD" ? `HOLD — ${data.direction} forming` : "SCANNING"}
              </span>
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
          <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 2, marginBottom: 7, display: "flex", alignItems: "center" }}>
            AGENT VOTES
            <span style={{ fontFamily: FC, fontSize: 8.5, color: dim, opacity: 0.7, marginLeft: 6, fontStyle: "italic", letterSpacing: 0 }}>hover ⓘ to learn each one</span>
          </div>
          {(data.agents || []).map((a, i) => <AgentCard key={i} a={a} T={T} accent={accent} />)}

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
