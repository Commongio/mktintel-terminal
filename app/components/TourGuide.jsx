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
const STOPS = [
  {
    id: "terminal", view: "terminal", title: "The Trading Terminal", icon: "🖥",
    intro: "Your home base — watchlist, AI desk, and live news in one screen.",
    items: [
      ["AI Desk (center)", "Your market analyst. Ask anything — \"what's moving today?\", \"break down NVDA\" — and it scans the whole market, not just your watchlist. It can also run the app for you: change themes, load charts, switch pages."],
      ["Watchlist & News", "Live prices on the left (green up, red down; RSI/MACD are momentum gauges). Headlines on the right, each with a bar rating how likely it is to move the market."],
      ["Chatty vs Command", "Top-right toggle. Chatty explains and converses; Command is terse, flat, and institutional — minimal output, zero decoration. Your pick sticks."],
    ],
  },
  {
    id: "data", view: "data", title: "The Data Page", icon: "📊",
    intro: "The intelligence dashboard — movers, calendars, filings, and a market heatmap.",
    items: [
      ["Movers & calendars", "Top movers, losers and most-active up top. Beside them: earnings dates, economic events, and upcoming IPOs — each on its own tab."],
      ["Heatmap view", "The ▦ HEATMAP button swaps the dashboard for a sector treemap — tile size is market cap, colour is today's move. Switch index or grouping from its top bar."],
      ["Filings & insiders", "SEC paperwork the moment it lands, plus Form 4 insider buys and sells. Tap anything to have the desk explain what it means."],
    ],
  },
  {
    id: "chart", view: "chart", title: "The Chart Page", icon: "📈",
    intro: "A fast native chart with the AI desk beside it.",
    items: [
      ["Load any ticker", "Search a symbol and load it. The chart remembers your last symbol and timeframe across refreshes, and rescales automatically when you switch names."],
      ["Levels drawn for you", "Ask the desk for levels, or hit \"Show trade on chart\" from any signal — entry, stop and targets are drawn directly onto the chart."],
      ["Ask while you look", "The AI panel sits right next to the chart, so you never have to leave the page to ask about what you're seeing."],
    ],
  },
  {
    id: "bot", view: "bot", title: "The Kronos Bot", icon: "🌌",
    intro: "Your signal engine — it scans continuously so you don't have to watch charts all day.",
    items: [
      ["Three modes", "FUT for futures (intraday only), OPT for options (short-dated, this week's expiry), and INVEST for long-term positions with a stated take-profit month. The toggle up top switches anytime; everything on screen belongs to the active mode."],
      ["Reading a signal", "Tap any card for entry, stop, targets, and how each AI agent voted. The orb is the VIX as a galaxy — blue calm, red fear. Kronos never touches your money: it signals, you execute in your own broker (⧉ BROKER)."],
      ["When it stands down", "If the market turns choppy, Kronos halts new setups and tells you plainly rather than feeding you whipsaw. An empty feed in chop is the system working, not broken."],
    ],
  },
  {
    id: "settings", view: "terminal", title: "Make It Yours", icon: "⚙",
    intro: "Themes, alerts, and everything that follows your account.",
    items: [
      ["Themes & type", "Settings → animated backdrops, your own photo or video, accent colours, fonts and text size. Panels can go transparent so the theme shows through."],
      ["Alerts", "Turn on push to get signals on your phone. On iPhone you must add the app to your Home Screen first — Safari only allows notifications for installed apps."],
      ["It follows you", "Settings, watchlist, layouts and chat history sync to your account. Replay this tour anytime from Settings."],
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
        boxShadow: `0 0 60px ${accent}22, 0 18px 50px rgba(0,0,0,0.6)`, backdropFilter: "blur(12px)",
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
          <span style={{ fontFamily: FD, fontSize: 19, fontWeight: 800, color: "#E8F0F8", letterSpacing: 0.4 }}>{s.title}</span>
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
            {isLastItem && isLastStop ? "✓ FINISH" : isLastItem ? `NEXT: ${STOPS[stop + 1].title.toUpperCase()} →` : "✓ GOT IT — NEXT"}
          </button>
        </div>
      </div>
    </div>
  );
}
