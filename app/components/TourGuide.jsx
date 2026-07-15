"use client";
// TourGuide.jsx — V10 "Take a Tour" interactive onboarding.
// Five stops (Terminal → Data → Chart → Kronos → Settings); each stop switches
// the app to that view and walks through its features in beginner language.
// Auto-shows once on first launch after signup; relaunchable from Settings.
import { useState, useEffect } from "react";

const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";
const FC = "'Inter',sans-serif";

const STOPS = [
  {
    id: "terminal", view: "terminal", title: "The Trading Terminal", icon: "🖥",
    intro: "Your home base — everything live, in one screen.",
    items: [
      ["Watchlist (left)", "Your tickers with live prices. Green = up today, red = down. The small RSI/MACD numbers are momentum gauges — tap the ⓘ button up top any time for a plain-English explanation."],
      ["AI Desk (center)", "Chat with your personal market analyst. Ask anything — \"what's the news today?\", \"how's the market looking?\" — or ask it to change your theme, load a chart, even switch pages. It can actually do it."],
      ["Quick Actions", "One-tap prompts under the chat: breaking news, whale activity, sector scans. No typing needed."],
      ["News (right)", "Live headlines. The red-to-green bar under each story rates how likely it is to move the market — hover it to see why. A \"T\" badge marks Trump/Truth Social items."],
      ["Quick Chart (below)", "Scroll down for a live chart of your top ticker. The 🔓 LAYOUT button (top right) lets you drag and resize every panel to build your own layout."],
    ],
  },
  {
    id: "data", view: "data", title: "The Data Page", icon: "📊",
    intro: "The intelligence dashboard — filings, insiders, options flow.",
    items: [
      ["Breaking News", "Same live feed, with impact ratings, in dashboard form."],
      ["SEC Filings", "Official company paperwork the moment it drops. The chip under each tells you if it's a routine report or an EVENT that can move the price fast."],
      ["Insider Trades", "When executives buy or sell their own stock (Form 4). Insider buying is often a bullish tell."],
      ["Options Intelligence", "Unusual options activity — where big money is placing bets. Click anything to have the AI break it down."],
      ["Customize it", "This page supports drag-and-drop too — 🔓 LAYOUT up top, then move and resize any card."],
    ],
  },
  {
    id: "chart", view: "chart", title: "The Chart Page", icon: "📈",
    intro: "Full TradingView charting with the AI desk beside it.",
    items: [
      ["Load any ticker", "Type a symbol in the search box and hit LOAD. Your chart remembers itself now — refresh-proof."],
      ["Draw and analyze", "It's a full TradingView chart: indicators, drawings, timeframes — all free."],
      ["Ask while you look", "The AI panel sits right next to the chart. See something odd? Ask about it without leaving the page."],
    ],
  },
  {
    id: "bot", view: "bot", title: "The Kronos Bot", icon: "🌌",
    intro: "Your signal engine — it scans markets and calls setups so you don't stare at charts all day.",
    items: [
      ["Pick your mode", "FUTURES (NQ, ES...) or OPTIONS (SPY, NVDA...) — the OPT/FUT toggle up top switches anytime. Everything on screen belongs to the active mode only."],
      ["The galaxy orb", "That's the market's fear gauge (VIX) as a living galaxy: blue = calm, violet = normal, amber = tense, red = fear. It spins faster as volatility rises."],
      ["Signal feed (left)", "Real setups from the engine. ⚡ SETUP = actionable — tap one to see entry, stop, targets, and exactly why each AI agent voted for it. 90%+ conviction signals literally fly in as comets."],
      ["Trade side-by-side", "Kronos never touches your money. The ⧉ BROKER button opens your own trading platform next to the terminal — it signals, you decide, you execute."],
      ["Paper trading & shadow account", "In ANALYTICS: practice with virtual money first, and check the shadow account — the bot's honest, public win-rate record. No fake numbers anywhere."],
    ],
  },
  {
    id: "settings", view: "terminal", title: "Settings & Personalization", icon: "⚙",
    intro: "Make it yours — every choice saves to your account.",
    items: [
      ["Themes", "Settings → Personal: animated backdrops — a galaxy, a news globe, a world map, even a live chart of your favorite ticker as wallpaper. Or upload your own photo."],
      ["Fonts & colors", "Pick your font, accent color, panel colors, text size. Side panels can go transparent so your theme shows through."],
      ["Layouts", "Any layout you build with 🔓 LAYOUT is saved per page, per account."],
      ["It follows you", "Sign in anywhere — settings, watchlist, layouts, even your AI chat history come with you."],
      ["Replay this tour", "Settings → Personal → \"Take the tour again\" whenever you need a refresher."],
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
