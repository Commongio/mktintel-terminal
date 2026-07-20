"use client";
// CalendarPanel.jsx — V12: Data-page calendars with two tabs.
//   EARNINGS  — Finnhub earnings calendar (upcoming + just-reported).
//   ECONOMIC  — US high/medium-impact events (FairEconomy ForexFactory feed).
// Rendered as a fixed panel (like MoversPanel) so it never depends on the
// draggable-grid fallback logic.
import { useState, useEffect, useCallback } from "react";
import TickerLogo from "./TickerLogo";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

const fmtBig = (n) => {
  if (n == null) return "—";
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (n >= 1e9)  return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6)  return "$" + (n / 1e6).toFixed(0) + "M";
  return "$" + n;
};
const dayLabel = (d) => {
  if (!d) return "";
  const dt = new Date(d + "T12:00:00");
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

export default function CalendarPanel({ T, accent, onPick, fill = false }) {
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#9DB4CC";
  const border = T?.border ?? "#1A2535";
  const surface = T?.surface ?? "#0A1018";

  const [tab, setTab] = useState("earnings");
  const [earn, setEarn] = useState({ state: "loading", rows: [] });
  const [econ, setEcon] = useState({ state: "loading", rows: [], stale: false });

  const loadEarn = useCallback(async () => {
    setEarn((s) => ({ ...s, state: s.rows.length ? "live" : "loading" }));
    try {
      const r = await fetch("/api/earnings?days=14");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "unavailable");
      setEarn({ state: (d.rows || []).length ? "live" : "empty", rows: d.rows || [] });
    } catch { setEarn((s) => ({ ...s, state: s.rows.length ? "live" : "error" })); }
  }, []);

  const loadEcon = useCallback(async () => {
    setEcon((s) => ({ ...s, state: s.rows.length ? "live" : "loading" }));
    try {
      const r = await fetch("/api/econ-calendar");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "unavailable");
      setEcon({ state: (d.rows || []).length ? "live" : "empty", rows: d.rows || [], stale: !!d.stale, note: d.note || "", source: d.source || "" });
    } catch { setEcon((s) => ({ ...s, state: s.rows.length ? "live" : "error" })); }
  }, []);

  useEffect(() => { if (tab === "earnings") loadEarn(); else loadEcon(); }, [tab, loadEarn, loadEcon]);

  const TABS = [["earnings", "📅 EARNINGS"], ["econ", "🏛 ECONOMIC"]];

  return (
    <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column", ...(fill ? { height: "100%", minHeight: 0 } : {}) }}>
      <div style={{ display: "flex", gap: 4, padding: 8, borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: "6px 4px", borderRadius: 6, cursor: "pointer",
            fontFamily: FM, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5,
            color: tab === id ? accent : dim, background: tab === id ? `${accent}12` : "transparent",
            border: `1px solid ${tab === id ? `${accent}30` : border}`,
          }}>{label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* ── EARNINGS ── */}
        {tab === "earnings" && (
          earn.state === "loading" ? <Msg dim={dim}>Loading earnings calendar…</Msg>
          : earn.state === "error" ? <Msg color="#ff3d57">⚠ Earnings feed unavailable.</Msg>
          : earn.state === "empty" ? <Msg dim={dim}>No earnings scheduled in the window.</Msg>
          : earn.rows.map((e, i) => (
            <div key={e.symbol + e.date + i} onClick={() => onPick?.(e.symbol)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 11px", borderBottom: `1px solid ${border}55`, cursor: onPick ? "pointer" : "default" }}
              onMouseEnter={(ev) => { if (onPick) ev.currentTarget.style.background = "rgba(127,127,127,0.07)"; }}
              onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <TickerLogo symbol={e.symbol} size={20} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: FM, fontSize: 11.5, fontWeight: 800, color: text }}>{e.symbol}</span>
                    {e.when && <span style={{ fontFamily: FM, fontSize: 7, fontWeight: 800, color: accent, background: `${accent}14`, borderRadius: 3, padding: "1px 4px" }}>{e.when}</span>}
                    {e.reported && <span style={{ fontFamily: FM, fontSize: 7, fontWeight: 800, color: "#00e676" }}>REPORTED</span>}
                  </div>
                  <div style={{ fontFamily: FM, fontSize: 8, color: dim }}>{dayLabel(e.date)}{e.quarter ? ` · Q${e.quarter}` : ""}</div>
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: FM, fontSize: 9, color: dim }}>EPS est {e.epsEst != null ? e.epsEst.toFixed(2) : "—"}
                  {e.epsActual != null && <span style={{ color: e.epsActual >= (e.epsEst ?? 0) ? "#00e676" : "#ff3d57", fontWeight: 800 }}> → {e.epsActual.toFixed(2)}</span>}
                </div>
                <div style={{ fontFamily: FM, fontSize: 8, color: dim }}>rev est {fmtBig(e.revEst)}</div>
              </div>
            </div>
          ))
        )}

        {/* ── ECONOMIC (US, high/medium) — FRED schedule + FOMC; each row links to that day on ForexFactory ── */}
        {tab === "econ" && (
          <>
            {econ.note && (
              <div style={{ fontFamily: FM, fontSize: 7.5, color: "#f7c948", padding: "6px 11px", borderBottom: `1px solid ${border}55`, lineHeight: 1.4 }}>
                ⚠ {econ.note}
              </div>
            )}
            {econ.state === "loading" ? <Msg dim={dim}>Loading US economic calendar…</Msg>
            : econ.state === "error" ? <Msg color="#f7c948">Economic calendar temporarily unavailable. It usually recovers shortly.</Msg>
            : econ.state === "empty" ? <Msg dim={dim}>No high/medium-impact US events in the window.</Msg>
            : econ.rows.map((e, i) => {
              const clr = e.folder === "red" ? "#ff3d57" : "#f7c948"; // high=red, medium=amber
              const openFF = e.ffUrl ? () => window.open(e.ffUrl, "_blank", "noopener,noreferrer") : undefined;
              return (
                <div key={e.title + e.date + i} onClick={openFF} title={openFF ? "Open this day on ForexFactory ↗" : undefined}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 11px", borderBottom: `1px solid ${border}55`, gap: 10, cursor: openFF ? "pointer" : "default" }}
                  onMouseEnter={(ev) => { if (openFF) ev.currentTarget.style.background = "rgba(127,127,127,0.07)"; }}
                  onMouseLeave={(ev) => { ev.currentTarget.style.background = "transparent"; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: clr, flexShrink: 0, boxShadow: `0 0 6px ${clr}88` }} title={e.impact + " impact"} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: FC, fontSize: 11, fontWeight: 600, color: text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</div>
                      <div style={{ fontFamily: FM, fontSize: 8, color: dim }}>{dayLabel(e.date)}{e.time ? ` · ${e.time} ET` : ""} · US</div>
                    </div>
                  </div>
                  {openFF && <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 800, color: accent, flexShrink: 0 }}>FF ↗</span>}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function Msg({ children, dim, color }) {
  return <div style={{ padding: 14, fontFamily: FM, fontSize: 9, color: color || dim, lineHeight: 1.5 }}>{children}</div>;
}
