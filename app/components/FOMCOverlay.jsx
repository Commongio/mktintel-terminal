"use client";
import { useState, useEffect } from "react";

const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";

// 2026 FOMC Schedule — update each January
// Format: { meeting: [start, end], pressConf: "YYYY-MM-DD", time: "ET press conf time" }
const FOMC_2026 = [
  { meeting: ["2026-01-27","2026-01-28"], pressConf: "2026-01-28", time: "2:30 PM ET" },
  { meeting: ["2026-03-17","2026-03-18"], pressConf: "2026-03-18", time: "2:30 PM ET" },
  { meeting: ["2026-05-05","2026-05-06"], pressConf: "2026-05-06", time: "2:30 PM ET" },
  { meeting: ["2026-06-16","2026-06-17"], pressConf: "2026-06-17", time: "2:30 PM ET" },
  { meeting: ["2026-07-28","2026-07-29"], pressConf: "2026-07-29", time: "2:30 PM ET" }, // NEXT
  { meeting: ["2026-09-15","2026-09-16"], pressConf: "2026-09-16", time: "2:30 PM ET" },
  { meeting: ["2026-10-27","2026-10-28"], pressConf: "2026-10-28", time: "2:30 PM ET" },
  { meeting: ["2026-12-08","2026-12-09"], pressConf: "2026-12-09", time: "2:30 PM ET" },
];

// Federal Reserve YouTube channel
const FED_CHANNEL_ID    = "UCQFfGWe_GQEhFQ7B0u5HsBg";
const FED_LIVE_EMBED    = `https://www.youtube.com/embed/live_stream?channel=${FED_CHANNEL_ID}&autoplay=1`;
const FED_CHANNEL_URL   = `https://www.youtube.com/channel/${FED_CHANNEL_ID}/live`;

function getTodayET() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }))
    .toISOString().slice(0, 10);
}

function getFOMCStatus() {
  const today = getTodayET();
  for (const f of FOMC_2026) {
    if (today >= f.meeting[0] && today <= f.meeting[1]) {
      const isConcDay = today === f.pressConf;
      return {
        active:     true,
        pressConf:  isConcDay,
        pressTime:  f.time,
        endDate:    f.meeting[1],
        label:      isConcDay ? "FOMC PRESS CONF LIVE" : "FOMC MEETING DAY",
      };
    }
  }
  // Find next upcoming
  const upcoming = FOMC_2026.find(f => f.meeting[0] > today);
  return { active: false, upcoming: upcoming?.meeting[0] ?? null };
}

export default function FOMCOverlay({ accent = "#00d4aa" }) {
  const [status,   setStatus]   = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [dismissed,setDismissed]= useState(false);

  useEffect(() => {
    const s = getFOMCStatus();
    setStatus(s);
    // Auto-expand on press conf day if not dismissed
    if (s.active && s.pressConf && !sessionStorage.getItem("fomc_dismissed")) {
      setExpanded(true);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("fomc_dismissed", "1");
  };

  if (!status?.active || dismissed) return null;

  const borderColor = status.pressConf ? "#ff4d6d" : "#f7c948";
  const glowColor   = status.pressConf ? "rgba(255,77,109,0.25)" : "rgba(247,201,72,0.20)";

  return (
    <>
      <style>{`
        @keyframes fomc-pulse { 0%,100%{opacity:0.6;} 50%{opacity:1;} }
        @keyframes fomc-appear { from{opacity:0;transform:scale(0.94) translateY(8px);} to{opacity:1;transform:scale(1) translateY(0);} }
      `}</style>

      <div style={{
        position: "fixed", bottom: 20, right: 20, zIndex: 8000,
        display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10,
        animation: "fomc-appear 0.3s ease",
      }}>

        {/* Expanded YouTube embed */}
        {expanded && (
          <div style={{
            width: 380, background: "#060910",
            border: `1px solid ${borderColor}40`, borderRadius: 12,
            boxShadow: `0 0 40px ${glowColor}, 0 8px 32px rgba(0,0,0,0.6)`,
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 14px",
              background: `${borderColor}12`,
              borderBottom: `1px solid ${borderColor}25`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: status.pressConf ? "#ff4d6d" : "#f7c948",
                  boxShadow: `0 0 8px ${borderColor}`,
                  animation: "fomc-pulse 1.2s ease-in-out infinite",
                }}/>
                <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 2, color: borderColor }}>
                  {status.label}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <a href={FED_CHANNEL_URL} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: FM, fontSize: 8, color: "#3a4a5a", letterSpacing: 1, textDecoration: "none" }}>
                  OPEN YT
                </a>
                <button onClick={dismiss} style={{
                  background: "transparent", border: "none", color: "#3a4a5a",
                  cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px",
                }}>×</button>
              </div>
            </div>

            {/* Press conf time */}
            {status.pressConf && (
              <div style={{
                padding: "6px 14px", fontFamily: FM, fontSize: 8,
                color: "#f7c948", letterSpacing: 1,
                background: "rgba(247,201,72,0.05)", borderBottom: `1px solid ${borderColor}15`,
              }}>
                Press Conference: {status.pressTime} — Fed Chair live statement
              </div>
            )}

            {/* YouTube embed */}
            <div style={{ position: "relative", width: "100%", paddingBottom: "56.25%", background: "#000" }}>
              <iframe
                src={FED_LIVE_EMBED}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Federal Reserve Live Stream"
              />
            </div>

            {!status.pressConf && (
              <div style={{
                padding: "8px 14px", fontFamily: FM, fontSize: 8, color: "#3a4a5a",
                letterSpacing: 1, textAlign: "center",
              }}>
                Press conference: {status.pressTime} on {status.endDate}
              </div>
            )}
          </div>
        )}

        {/* Floating pill button */}
        <button onClick={() => setExpanded(e => !e)} style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "9px 14px", borderRadius: 20,
          background: `${borderColor}12`,
          border: `1px solid ${borderColor}40`,
          cursor: "pointer",
          boxShadow: expanded ? `0 0 20px ${glowColor}` : "none",
          transition: "all 0.2s",
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: borderColor, boxShadow: `0 0 8px ${borderColor}`,
            animation: "fomc-pulse 1.2s ease-in-out infinite",
          }}/>
          <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 2, color: borderColor }}>
            {expanded ? "HIDE FEED" : status.label}
          </span>
          <span style={{ fontSize: 10, color: borderColor, opacity: 0.7 }}>{expanded ? "▾" : "▸"}</span>
        </button>
      </div>
    </>
  );
}