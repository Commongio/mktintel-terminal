"use client";
// MoversPanel.jsx — V12: Top Movers / Top Losers / Most Active.
// Market-wide (Yahoo predefined screener via /api/movers) — every tradeable US
// equity, not the curated universe. Rows are clickable → onPick(symbol) so the
// Data page and the ticker Overview can both route a click to the overview.
import { useState, useEffect, useCallback } from "react";
import TickerLogo from "./TickerLogo";

const FM = "'JetBrains Mono',monospace";
const TABS = [["gainers", "▲ TOP MOVERS"], ["losers", "▼ TOP LOSERS"], ["actives", "● MOST ACTIVE"]];

function fmtVol(v) {
  if (v == null) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return String(v);
}

export default function MoversPanel({ T, accent, onPick, fill = false }) {
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#9DB4CC";
  const border = T?.border ?? "#1A2535";
  const surface = T?.surface ?? "#0A1018";

  const [tab, setTab] = useState("gainers");
  const [rows, setRows] = useState([]);
  const [state, setState] = useState("loading");

  const load = useCallback(async (type) => {
    setState("loading");
    try {
      const r = await fetch(`/api/movers?type=${type}&count=30`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "unavailable");
      setRows(d.rows || []);
      setState((d.rows || []).length ? "live" : "empty");
    } catch (e) { setState("error"); setRows([]); }
  }, []);

  useEffect(() => { load(tab); }, [tab, load]);
  // Refresh every 60s while mounted — movers churn intraday.
  useEffect(() => { const t = setInterval(() => load(tab), 60_000); return () => clearInterval(t); }, [tab, load]);

  return (
    <div style={{
      background: surface, border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden",
      display: "flex", flexDirection: "column", ...(fill ? { height: "100%", minHeight: 0 } : {}),
    }}>
      <div style={{ display: "flex", gap: 4, padding: 8, borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: "6px 4px", borderRadius: 6, cursor: "pointer",
            fontFamily: FM, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5,
            color: tab === id ? accent : dim,
            background: tab === id ? `${accent}12` : "transparent",
            border: `1px solid ${tab === id ? `${accent}30` : border}`,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {state === "loading" && <div style={{ padding: 14, fontFamily: FM, fontSize: 9, color: dim }}>Loading market movers…</div>}
        {state === "error" && <div style={{ padding: 14, fontFamily: FM, fontSize: 9, color: "#ff3d57" }}>⚠ Movers feed unavailable — retrying next cycle.</div>}
        {state === "empty" && <div style={{ padding: 14, fontFamily: FM, fontSize: 9, color: dim }}>No movers right now.</div>}
        {rows.map((r) => {
          const up = (r.changePct ?? 0) >= 0;
          const clr = up ? "#00e676" : "#ff3d57";
          return (
            <div key={r.symbol} onClick={() => onPick?.(r.symbol)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "8px 11px", borderBottom: `1px solid ${border}55`,
                cursor: onPick ? "pointer" : "default", transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { if (onPick) e.currentTarget.style.background = "rgba(127,127,127,0.07)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <TickerLogo symbol={r.symbol} size={20} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: FM, fontSize: 11.5, fontWeight: 800, color: text, letterSpacing: 0.5 }}>{r.symbol}</div>
                  <div style={{ fontFamily: FM, fontSize: 8, color: dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>{(r.name || r.symbol).slice(0, 22)}</div>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, color: text }}>{r.price != null ? `$${Number(r.price).toFixed(2)}` : "—"}</div>
                <div style={{ fontFamily: FM, fontSize: 10, fontWeight: 800, color: clr }}>
                  {r.changePct != null ? `${up ? "▲" : "▼"} ${Math.abs(r.changePct).toFixed(2)}%` : ""}
                </div>
                <div style={{ fontFamily: FM, fontSize: 7.5, color: dim }}>vol {fmtVol(r.volume)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
