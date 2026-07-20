"use client";
// BotMiniChart.jsx — V12: the dedicated bot-side chart flagged earlier (when
// "Show on Chart" was implemented by reusing the terminal chart). A small chart
// icon on the bot page that opens a compact chart for the current ticker, with
// an interval switch and an "expand" that hands off to the full terminal chart.
import { useState } from "react";
import LightweightChart from "./LightweightChart";

const FM = "'JetBrains Mono',monospace";
const IVS = [["15min", "15m"], ["1h", "1H"], ["1d", "1D"]];

export default function BotMiniChart({ symbol = "NQ", T, accent }) {
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#9DB4CC";
  const border = T?.border ?? "#1A2535";
  const surface = T?.surface ?? "#0A1018";
  const [open, setOpen] = useState(false);
  const [iv, setIv] = useState("15min");

  return (
    <>
      {/* The trigger icon — lives in the bot header/toolbar. */}
      <button onClick={() => setOpen((o) => !o)} title={`Mini chart · ${symbol}`}
        style={{
          width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, cursor: "pointer",
          color: open ? accent : dim, background: open ? `${accent}12` : surface,
          border: `1px solid ${open ? `${accent}30` : border}`,
        }}>▤</button>

      {open && (
        <div style={{
          position: "absolute", top: 44, right: 8, zIndex: 60,
          width: "min(440px, calc(100vw - 24px))", height: 300,
          background: surface, border: `1px solid ${border}`, borderRadius: 12,
          boxShadow: "0 18px 50px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 10px", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
            <span style={{ fontFamily: FM, fontSize: 10, fontWeight: 800, color: text, letterSpacing: 1 }}>{symbol}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {IVS.map(([code, label]) => (
                <button key={code} onClick={() => setIv(code)} style={{
                  fontFamily: FM, fontSize: 8, fontWeight: 700, padding: "3px 6px", borderRadius: 4, cursor: "pointer",
                  color: iv === code ? accent : dim, background: iv === code ? `${accent}14` : "transparent",
                  border: `1px solid ${iv === code ? `${accent}30` : border}`,
                }}>{label}</button>
              ))}
              {/* Expand → hand off to the full terminal chart (same event the
                  feed's "Show on Chart" uses), then close the mini. */}
              <button onClick={() => { window.dispatchEvent(new CustomEvent("kronos-show-chart", { detail: { symbol } })); setOpen(false); }}
                title="Expand to full chart"
                style={{ fontFamily: FM, fontSize: 8, fontWeight: 700, padding: "3px 6px", borderRadius: 4, cursor: "pointer", color: accent, background: `${accent}12`, border: `1px solid ${accent}30` }}>⤢</button>
              <button onClick={() => setOpen(false)} title="Close" style={{ fontFamily: FM, fontSize: 12, color: dim, background: "transparent", border: "none", cursor: "pointer", padding: "0 2px" }}>✕</button>
            </div>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <LightweightChart symbol={symbol} interval={iv} T={T} accent={accent} annotations={[]} />
          </div>
        </div>
      )}
    </>
  );
}
