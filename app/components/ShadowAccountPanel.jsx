"use client";
// ShadowAccountPanel.jsx — V.8.2
// Shows Kronos signal accuracy over time (Shadow Account pattern from Vibe-Trading, MIT).
// Also exports PaperTradingPanel — virtual positions with live P&L and 30-day gate.

import { useState, useEffect, useCallback } from "react";
import { getPaperState, savePaperState } from "./MultiAgentSignal";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

const outcomeColor = (o) =>
  o === "WIN" || o === "WINNING" ? "#00e676" :
  o === "STOPPED" || o === "LOSING" ? "#ff3d57" : "#9DB4CC";

// ─── SHADOW ACCOUNT PANEL ─────────────────────────────────────────────────────
export default function ShadowAccountPanel({ accent = "#00d4aa", T, assetClass = "futures" }) {
  const surface = T?.surface ?? "#0A1018";
  const border  = T?.border  ?? "#1A2535";
  const text    = T?.text    ?? "#E2EDF8";
  const dim     = T?.dim     ?? "#9DB4CC";

  const [evaluated, setEvaluated] = useState([]);
  const [stats,     setStats]     = useState(null);
  const [loading,   setLoading]   = useState(false);

  const evaluate = useCallback(async () => {
    setLoading(true);
    try {
      // V10: strict mode isolation — only this asset class's signals.
      const all = JSON.parse(localStorage.getItem("kronos_shadow") || "[]");
      const signals = all.filter((s) => (s.assetClass || "futures") === assetClass);
      if (!signals.length) { setEvaluated([]); setStats(null); return; }
      const r = await fetch("/api/shadow-account", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signals }),
      });
      const d = await r.json();
      if (r.ok) { setEvaluated((d.evaluated || []).reverse()); setStats(d.stats); }
    } catch {}
    finally { setLoading(false); }
  }, [assetClass]);

  useEffect(() => { evaluate(); }, [evaluate]);

  const clear = () => {
    if (!confirm(`Clear ${assetClass} shadow history?`)) return;
    try {
      const all = JSON.parse(localStorage.getItem("kronos_shadow") || "[]");
      localStorage.setItem("kronos_shadow", JSON.stringify(all.filter((s) => (s.assetClass || "futures") !== assetClass)));
    } catch { localStorage.removeItem("kronos_shadow"); }
    setEvaluated([]); setStats(null);
  };

  const exportCSV = () => {
    const rows = [["time","symbol","direction","entry","stop","t1","conviction","currentPrice","movePct","outcome"]];
    evaluated.forEach(e => rows.push([new Date(e.time).toISOString(), e.symbol, e.direction, e.entry, e.stop, e.t1, e.conviction, e.currentPrice, e.movePct, e.outcome]));
    const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "kronos-signal-journal.csv";
    a.click();
  };

  return (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${border}` }}>
        <div style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: text, letterSpacing: 2 }}>
          SHADOW ACCOUNT — {assetClass.toUpperCase()} ACCURACY
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={exportCSV} style={{ fontFamily: FM, fontSize: 8, color: dim, background: "none", border: `1px solid ${border}`, borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>CSV</button>
          <button onClick={evaluate} disabled={loading} style={{ fontFamily: FM, fontSize: 8, color: accent, background: "none", border: `1px solid ${accent}30`, borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>
            {loading ? "..." : "RE-GRADE"}
          </button>
          <button onClick={clear} style={{ fontFamily: FM, fontSize: 8, color: "#ff3d57", background: "none", border: "1px solid rgba(255,61,87,0.25)", borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>CLEAR</button>
        </div>
      </div>

      {/* Stats row */}
      {stats ? (
        <div style={{ display: "flex", gap: 22, padding: "12px 14px", borderBottom: `1px solid ${border}`, flexWrap: "wrap" }}>
          {[
            ["SIGNALS", stats.total, text],
            ["WIN RATE", `${stats.winRate}%`, stats.winRate >= 55 ? "#00e676" : stats.winRate >= 45 ? "#f7c948" : "#ff3d57"],
            ["AVG MOVE", `${stats.avgMove > 0 ? "+" : ""}${stats.avgMove}%`, stats.avgMove >= 0 ? "#00e676" : "#ff3d57"],
            ...(stats.highConvWinRate != null ? [["70%+ CONV WR", `${stats.highConvWinRate}%`, stats.highConvWinRate >= 55 ? "#00e676" : "#f7c948"]] : []),
          ].map(([l, v, c]) => (
            <div key={l}>
              <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1.5, marginBottom: 3 }}>{l}</div>
              <div style={{ fontFamily: FM, fontSize: 15, fontWeight: 800, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "14px", fontFamily: FM, fontSize: 9, color: dim, textAlign: "center" }}>
          No signals logged yet. When the multi-agent engine FIRES, signals are tracked here automatically.
        </div>
      )}

      {/* Signal history */}
      <div style={{ maxHeight: 280, overflowY: "auto" }}>
        {evaluated.slice(0, 25).map((e, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${border}55` }}>
            <div>
              <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
                <span style={{ fontFamily: FM, fontSize: 10, fontWeight: 700, color: e.direction === "LONG" ? "#00e676" : "#ff3d57" }}>
                  {e.direction} {e.symbol}
                </span>
                <span style={{ fontFamily: FM, fontSize: 8, color: dim }}>@ ${Number(e.entry).toFixed(2)}</span>
                <span style={{ fontFamily: FM, fontSize: 8, color: dim }}>{e.conviction}%</span>
              </div>
              <div style={{ fontFamily: FM, fontSize: 7, color: dim, marginTop: 2 }}>{new Date(e.time).toLocaleString()}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: FM, fontSize: 10, fontWeight: 800, color: outcomeColor(e.outcome) }}>{e.outcome}</div>
              {e.movePct != null && (
                <div style={{ fontFamily: FM, fontSize: 9, color: e.movePct >= 0 ? "#00e676" : "#ff3d57" }}>
                  {e.movePct >= 0 ? "+" : ""}{e.movePct}%
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PAPER TRADING PANEL ──────────────────────────────────────────────────────
export function PaperTradingPanel({ accent = "#00d4aa", T, paperMode, setPaperMode, assetClass = "futures" }) {
  const surface = T?.surface ?? "#0A1018";
  const border  = T?.border  ?? "#1A2535";
  const text    = T?.text    ?? "#E2EDF8";
  const dim     = T?.dim     ?? "#9DB4CC";

  const [paper, setPaper] = useState(() => getPaperState(assetClass));

  useEffect(() => { setPaper(getPaperState(assetClass)); }, [paperMode, assetClass]);

  const daysPaper = paper.startedAt ? Math.floor((Date.now() - paper.startedAt) / 864e5) : 0;
  const liveUnlocked = daysPaper >= 30;
  const totalPnl = (paper.history || []).reduce((s, h) => s + (h.pnl || 0), 0);

  const togglePaper = () => {
    const next = !paperMode;
    setPaperMode(next);
    if (next && !paper.startedAt) {
      const np = { ...paper, startedAt: Date.now() };
      setPaper(np); savePaperState(np, assetClass);
    }
  };

  const reset = () => {
    if (!confirm(`Reset ${assetClass} paper account to $10,000?`)) return;
    const np = { balance: 10000, positions: [], history: [], startedAt: paper.startedAt };
    setPaper(np); savePaperState(np, assetClass);
  };

  return (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: text, letterSpacing: 2 }}>PAPER TRADING — {assetClass.toUpperCase()}</div>
        <button onClick={togglePaper} style={{
          width: 42, height: 22, borderRadius: 12, position: "relative", cursor: "pointer",
          background: paperMode ? `${accent}30` : border,
          border: `1px solid ${paperMode ? accent : border}`,
        }}>
          <div style={{
            width: 16, height: 16, borderRadius: "50%", position: "absolute", top: 2,
            left: paperMode ? 22 : 2, background: paperMode ? accent : dim, transition: "left 0.18s",
          }} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 22, marginBottom: 12, flexWrap: "wrap" }}>
        {[
          ["BALANCE", `$${paper.balance.toLocaleString()}`, text],
          ["PAPER P&L", `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(0)}`, totalPnl >= 0 ? "#00e676" : "#ff3d57"],
          ["DAYS", String(daysPaper), text],
          ["TRADES", String((paper.history || []).length), text],
        ].map(([l, v, c]) => (
          <div key={l}>
            <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1.5, marginBottom: 3 }}>{l}</div>
            <div style={{ fontFamily: FM, fontSize: 14, fontWeight: 800, color: c }}>{v}</div>
          </div>
        ))}
      </div>

      {/* 30-day live gate progress */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1 }}>LIVE MODE GATE (30-DAY PAPER MINIMUM)</span>
          <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: liveUnlocked ? "#00e676" : "#f7c948" }}>
            {liveUnlocked ? "UNLOCKED" : `${daysPaper}/30 days`}
          </span>
        </div>
        <div style={{ height: 5, background: "#1A2535", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${Math.min(100, (daysPaper / 30) * 100)}%`,
            background: liveUnlocked ? "#00e676" : "#f7c948", borderRadius: 3, transition: "width 0.6s",
          }} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: FC, fontSize: 9, color: dim, lineHeight: 1.4 }}>
          Signals auto-execute virtually when paper mode is on.
        </span>
        <button onClick={reset} style={{
          fontFamily: FM, fontSize: 8, color: "#ff3d57", background: "none",
          border: "1px solid rgba(255,61,87,0.25)", borderRadius: 5, padding: "3px 8px", cursor: "pointer",
        }}>RESET</button>
      </div>
    </div>
  );
}
