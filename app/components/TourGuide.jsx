"use client";
// TourGuide.jsx — V10 "Take a Tour" interactive onboarding.
// Five stops (Terminal → Data → Chart → Kronos → Settings); each stop switches
// the app to that view and walks through its features in beginner language.
// Auto-shows once on first launch after signup; relaunchable from Settings.
import { useState, useEffect } from "react";

const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";
const FC = "'Inter',sans-serif";

// V14: rebuilt for the current app and deliberately SHORT — 5 stops × 3 items
// (was 5 × 5). A first-run tour someone actually finishes beats a thorough one
// they abandon. Content refreshed for everything shipped since V10: the three
// bot modes (INVEST is new), the Chatty/Command mode selector, the Data page's
// heatmap + IPO tabs, and the chop stand-down. Stale claims removed — the chart
// is our own lightweight-charts build now, not a TradingView embed.
// COPY STANDARD (V14): instrument documentation, not conversation.
//   • No idioms — "home base" → "central dashboard", "around the clock" → "continuously".
//   • Utility over personality — describe what a control DOES, not how it feels.
//   • Active, precise verbs — "execute", "navigate", "displays", not "run it for you".
//   • Standard feature names — "AI Assistant"/"AI Desk", never "Chatty".
const STOPS = [
  {
    id: "terminal", view: "terminal", title: "Trading Terminal", icon: "🖥",
    intro: "Your central dashboard: watchlist, AI Desk, and live news in a single view.",
    items: [
      ["AI Desk (center)", "An integrated market analyst. Enter natural-language queries (\"what's moving today?\", \"analyze NVDA\") to scan the broader market — not only your watchlist. The AI can also navigate the platform, load charts, and adjust settings on command."],
      ["Watchlist & News", "Live pricing on the left, with RSI and MACD momentum readings per symbol. Headlines on the right, each scored for probable market impact."],
      ["Interaction modes", "Top-right toggle. AI Assistant returns explanatory analysis; Command Palette returns minimal, formatted output. The selection persists across sessions."],
    ],
  },
  {
    id: "data", view: "data", title: "Data", icon: "📊",
    intro: "Market intelligence: movers, calendars, filings, and sector performance.",
    items: [
      ["Movers & calendars", "Top gainers, decliners, and most-active issues. Adjacent panels cover earnings dates, economic releases, and upcoming IPOs."],
      ["Heatmap", "The HEATMAP control replaces the dashboard with a sector treemap — tile size represents market capitalization, color represents daily change. Index and grouping are configurable."],
      ["Filings & insiders", "SEC filings on publication, plus Form 4 insider transactions. Select any entry for AI analysis."],
    ],
  },
  {
    id: "chart", view: "chart", title: "Charts", icon: "📈",
    intro: "Native charting with the AI Desk alongside.",
    items: [
      ["Symbol loading", "Enter a symbol to load it. Symbol and timeframe persist across sessions, and the price axis rescales automatically on symbol change."],
      ["Level plotting", "Request levels from the AI Desk, or select \"Show trade on chart\" from any signal to plot entry, stop, and targets directly."],
      ["Inline analysis", "The AI panel is docked beside the chart, so queries require no page change."],
    ],
  },
  {
    id: "bot", view: "bot", title: "Kronos Bot", icon: "🌌",
    intro: "The signal engine. Scans continuously and grades every setup on conviction.",
    items: [
      ["Three modes", "FUT for futures (intraday only), OPT for options (short-dated, current-week expiry), and INVEST for long-term positions with a stated take-profit month. The active mode scopes everything displayed."],
      ["Reading a signal", "Select any signal for entry, stop, targets, and the individual agent votes behind it. The orb displays VIX as a volatility gauge. Kronos issues signals only — execution occurs in your own broker (⧉ BROKER)."],
      ["Stand-down conditions", "In choppy or directionless conditions, Kronos suspends new signals and displays a stand-down notice. An empty feed under those conditions is expected behavior."],
    ],
  },
  {
    id: "settings", view: "terminal", title: "Configuration", icon: "⚙",
    intro: "Appearance, alerts, and account-level persistence.",
    items: [
      ["Appearance", "Settings provides animated backdrops, custom image or video backgrounds, accent colors, typefaces, and text sizing. Side panels support transparency."],
      ["Alerts", "Enable push notifications to receive signals on mobile. On iOS, the app must be added to the Home Screen first — Safari restricts notifications to installed applications."],
      ["Persistence", "Settings, watchlist, layouts, and chat history sync to your account. This tour can be replayed from Settings."],
    ],
  },
];

export default function TourGuide({ accent = "#00d4aa", T, onClose, onSwitchView }) {
  const [stop, setStop] = useState(0);
  const [item, setItem] = useState(0);
  const s = STOPS[stop];
  const isLastItem = item >= s.items.length - 1;
  const isLastStop = stop >= STOPS.length - 1;

  useEffect(() => { onSwitchView?.(s.view); }, [stop]); // eslint-disable-line

  const next = () => {
    if (!isLastItem) { setItem(item + 1); return; }
    if (!isLastStop) { setStop(stop + 1); setItem(0); return; }
    finish();
  };
  const finish = () => {
    try { localStorage.setItem("kronos_tour_seen", "1"); } catch {}
    onClose();
  };

  const [title, desc] = s.items[item];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3500, pointerEvents: "none" }}>
      {/* dim everything except a bottom-anchored guide card */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", pointerEvents: "auto" }} onClick={() => {}} />
      <div style={{
        position: "absolute", left: "50%", bottom: 28, transform: "translateX(-50%)",
        width: "min(560px, calc(100vw - 32px))", pointerEvents: "auto",
        background: "rgba(10,16,26,0.98)", border: `1px solid ${accent}45`, borderRadius: 18,
        boxShadow: "0 20px 56px rgba(0,0,0,0.66)", backdropFilter: "blur(12px)",
        padding: "20px 24px",
      }}>
        {/* stop progress */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {STOPS.map((st, i) => (
            <div key={st.id} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ height: 3, borderRadius: 2, background: i < stop ? accent : i === stop ? `${accent}70` : "rgba(127,127,127,0.2)", transition: "background 0.3s" }} />
              <span style={{ fontFamily: FM, fontSize: 6.5, letterSpacing: 1, color: i === stop ? accent : "#5a6a7d", textAlign: "center" }}>
                {i < stop ? "✓ " : ""}{st.title.split(" ").pop().toUpperCase()}
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 20 }}>{s.icon}</span>
          {/* V14: Inter, matching the welcome + release-notes popups. */}
          <span style={{ fontFamily: FC, fontSize: 18, fontWeight: 700, color: "#E8F0F8", letterSpacing: -0.2 }}>{s.title}</span>
          <span style={{ fontFamily: FM, fontSize: 8, color: "#5a6a7d", letterSpacing: 1 }}>STEP {item + 1}/{s.items.length}</span>
        </div>
        <div style={{ fontFamily: FC, fontSize: 11, color: "#7A8FA5", marginBottom: 12 }}>{s.intro}</div>

        <div style={{ background: `${accent}0a`, border: `1px solid ${accent}25`, borderRadius: 12, padding: "13px 16px", marginBottom: 16, minHeight: 86 }}>
          <div style={{ fontFamily: FM, fontSize: 11, fontWeight: 800, color: accent, letterSpacing: 1, marginBottom: 6 }}>{title}</div>
          <div style={{ fontFamily: FC, fontSize: 12.5, color: "#C6D4E2", lineHeight: 1.65 }}>{desc}</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={finish} style={{ padding: "10px 16px", borderRadius: 9, background: "transparent", border: "1px solid rgba(127,127,127,0.25)", color: "#7A8FA5", fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, cursor: "pointer" }}>
            SKIP TOUR
          </button>
          <div style={{ flex: 1 }} />
          {item > 0 && (
            <button onClick={() => setItem(item - 1)} style={{ padding: "10px 16px", borderRadius: 9, background: "transparent", border: `1px solid ${accent}30`, color: accent, fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 1.5, cursor: "pointer" }}>
              ← BACK
            </button>
          )}
          <button onClick={next} style={{
            padding: "10px 22px", borderRadius: 9, cursor: "pointer",
            background: `linear-gradient(135deg,${accent}30,${accent}12)`, border: `1px solid ${accent}55`,
            color: accent, fontFamily: FM, fontSize: 10, fontWeight: 800, letterSpacing: 2,
          }}>
            {isLastItem && isLastStop ? "FINISH" : isLastItem ? `NEXT: ${STOPS[stop + 1].title.toUpperCase()} →` : "CONTINUE"}
          </button>
        </div>
      </div>
    </div>
  );
}
