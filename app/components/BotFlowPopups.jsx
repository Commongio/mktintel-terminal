"use client";
// BotFlowPopups.jsx — V9 two-step Kronos entry flow.
// Step 1: OPTIONS or FUTURES mode select (drives the signal engine's data + logic).
// Step 2: broker side-by-side setup — opens the user's trading platform in a
// second browser window positioned for split-screen manual execution.
import { useState } from "react";

const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";
const FC = "'Inter',sans-serif";

export const BROKER_PRESETS = [
  { id: "topstepx",   label: "TopstepX",          url: "https://topstepx.com" },
  { id: "tradovate",  label: "Tradovate Web",     url: "https://trader.tradovate.com" },
  { id: "tradelocker",label: "TradeLocker",       url: "https://live.tradelocker.com" },
  { id: "mt5web",     label: "MT4/MT5 WebTrader", url: "https://trade.mql5.com/trade" },
  { id: "thinkorswim",label: "thinkorswim Web",   url: "https://trade.thinkorswim.com" },
  { id: "webull",     label: "Webull",            url: "https://app.webull.com" },
  { id: "robinhood",  label: "Robinhood",         url: "https://robinhood.com" },
  { id: "custom",     label: "Custom URL…",       url: "" },
];

// Opens the broker in a right-half popup window. Browsers only honor
// position/size for script-opened windows and popup blockers vary, so this is
// best-effort with a graceful fallback message handled by the caller.
export function openBrokerWindow(url) {
  try {
    const w = Math.floor(window.screen.availWidth / 2);
    const h = Math.floor(window.screen.availHeight * 0.96);
    const left = window.screen.availWidth - w;
    const win = window.open(url, "kronos_broker", `left=${left},top=0,width=${w},height=${h},noopener`);
    return Boolean(win);
  } catch { return false; }
}

function Shell({ children, accent, T, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.82)", zIndex: 2500, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 520, background: T?.panel ?? "#0A1018", border: `1px solid ${accent}40`, borderRadius: 18, padding: "26px 28px", boxShadow: `0 0 80px ${accent}20` }}>
        {children}
      </div>
    </div>
  );
}

// ── STEP 1 — MODE SELECT + SIGNAL CADENCE (V10) ───────────────────────────────
const CADENCES = [
  { id: "daily", label: "DAILY", hint: "intraday setups (1m–1h)" },
  { id: "weekly", label: "WEEKLY", hint: "swing setups (4h–1d)" },
  { id: "monthly", label: "MONTHLY", hint: "position setups" },
  { id: "yearly", label: "YEARLY", hint: "long-horizon setups" },
  { id: "all", label: "ALL OF THE ABOVE", hint: "show everything" },
];
export function ModeSelectPopup({ accent, T, onSelect }) {
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#7A9AB5";
  const border = T?.border ?? "#1A2535";
  const [phase, setPhase] = useState("mode");
  const [pendingMode, setPendingMode] = useState(null);
  const [picked, setPicked] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kronos_cadence") || '["all"]'); } catch { return ["all"]; }
  });
  const MODES = [
    { id: "futures", icon: "📈", title: "FUTURES", desc: "NQ · MNQ · ES · CL · GC — Kronos Map structure + technicals + news sentiment on futures candles.", color: "#7eb8f7" },
    { id: "options", icon: "🎯", title: "OPTIONS", desc: "SPY · QQQ · NVDA · AAPL + more — underlying structure + live options flow (put/call, unusual activity, IV).", color: "#a78bfa" },
  ];

  const toggleCadence = (id) => {
    setPicked((prev) => {
      if (id === "all") return ["all"];
      const next = prev.filter((x) => x !== "all");
      return next.includes(id) ? (next.filter((x) => x !== id).length ? next.filter((x) => x !== id) : ["all"]) : [...next, id];
    });
  };
  const confirmCadence = () => {
    try { localStorage.setItem("kronos_cadence", JSON.stringify(picked)); } catch {}
    window.dispatchEvent(new Event("kronos-cadence-change"));
    onSelect(pendingMode || "futures");
  };

  if (phase === "cadence") {
    return (
      <Shell accent={accent} T={T}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 800, color: text, letterSpacing: 1 }}>HOW OFTEN DO YOU TRADE?</div>
          <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginTop: 5 }}>
            YOUR SIGNAL FEED ONLY SHOWS SETUPS MATCHING THIS CADENCE · CHANGE ANYTIME VIA ⧉
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {CADENCES.map((c) => {
            const on = picked.includes(c.id);
            return (
              <button key={c.id} onClick={() => toggleCadence(c.id)} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "12px 16px", borderRadius: 10, cursor: "pointer", textAlign: "left",
                background: on ? `${accent}12` : "transparent",
                border: `1px solid ${on ? `${accent}50` : border}`, transition: "all 0.15s",
              }}>
                <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 800, letterSpacing: 2, color: on ? accent : dim }}>
                  {on ? "◉ " : "○ "}{c.label}
                </span>
                <span style={{ fontFamily: FC, fontSize: 10, color: dim }}>{c.hint}</span>
              </button>
            );
          })}
        </div>
        <button onClick={confirmCadence} style={{
          width: "100%", padding: "13px 0", fontFamily: FM, fontSize: 10, fontWeight: 800, letterSpacing: 2,
          color: accent, background: `${accent}12`, border: `1px solid ${accent}45`, borderRadius: 9, cursor: "pointer",
        }}>CONTINUE →</button>
      </Shell>
    );
  }

  return (
    <Shell accent={accent} T={T}>
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 800, color: text, letterSpacing: 1 }}>WHAT ARE WE TRADING?</div>
        <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginTop: 5 }}>
          THIS SETS KRONOS'S DATA SOURCES + SIGNAL LOGIC · SWITCH ANYTIME (TOP-RIGHT TOGGLE)
        </div>
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        {MODES.map((m) => (
          <button key={m.id} onClick={() => { setPendingMode(m.id); setPhase("cadence"); }} style={{
            flex: 1, padding: "22px 16px", borderRadius: 14, cursor: "pointer", textAlign: "center",
            background: `${m.color}0a`, border: `1px solid ${m.color}35`, transition: "all 0.15s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${m.color}18`; e.currentTarget.style.borderColor = `${m.color}70`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = `${m.color}0a`; e.currentTarget.style.borderColor = `${m.color}35`; }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>{m.icon}</div>
            <div style={{ fontFamily: FM, fontSize: 15, fontWeight: 800, color: m.color, letterSpacing: 2, marginBottom: 8 }}>{m.title}</div>
            <div style={{ fontFamily: FC, fontSize: 10.5, color: dim, lineHeight: 1.55 }}>{m.desc}</div>
          </button>
        ))}
      </div>
    </Shell>
  );
}

// ── STEP 2 — BROKER SIDE-BY-SIDE ─────────────────────────────────────────────
export function BrokerSideBySidePopup({ accent, T, onDone, onSkip }) {
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#7A9AB5";
  const surface = T?.surface ?? "#0D1520";
  const border = T?.border ?? "#1A2535";

  const [selected, setSelected] = useState(() => {
    try { return localStorage.getItem("kronos_broker_preset") || "topstepx"; } catch { return "topstepx"; }
  });
  const [customUrl, setCustomUrl] = useState(() => {
    try { return localStorage.getItem("kronos_broker_url") || ""; } catch { return ""; }
  });
  const [blocked, setBlocked] = useState(false);
  const [remember, setRemember] = useState(true);

  const launch = () => {
    const preset = BROKER_PRESETS.find((b) => b.id === selected);
    const url = selected === "custom" ? customUrl.trim() : preset?.url;
    if (!url || !/^https?:\/\//.test(url)) { setBlocked(false); return; }
    try {
      localStorage.setItem("kronos_broker_preset", selected);
      if (selected === "custom") localStorage.setItem("kronos_broker_url", url);
      if (remember) localStorage.setItem("kronos_flow_done", "1");
    } catch {}
    const ok = openBrokerWindow(url);
    if (!ok) { setBlocked(true); return; }
    onDone();
  };

  const skip = () => {
    try { if (remember) localStorage.setItem("kronos_flow_done", "1"); } catch {}
    onSkip();
  };

  return (
    <Shell accent={accent} T={T} onClose={skip}>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 800, color: text, letterSpacing: 0.5 }}>TRADE SIDE-BY-SIDE</div>
        <div style={{ fontFamily: FC, fontSize: 11.5, color: dim, lineHeight: 1.6, marginTop: 8, maxWidth: 420, margin: "8px auto 0" }}>
          Kronos surfaces the signals — <b style={{ color: text }}>you</b> place the trades in your own broker window.
          Pick your platform and we'll open it beside the terminal.
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        {BROKER_PRESETS.map((b) => (
          <button key={b.id} onClick={() => setSelected(b.id)} style={{
            padding: "7px 12px", borderRadius: 7, cursor: "pointer",
            fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 1,
            color: selected === b.id ? accent : dim,
            background: selected === b.id ? `${accent}12` : "transparent",
            border: `1px solid ${selected === b.id ? `${accent}40` : border}`,
          }}>{b.label}</button>
        ))}
      </div>

      {selected === "custom" && (
        <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)} placeholder="https://your-broker-platform.com"
          style={{ width: "100%", background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "9px 12px", color: text, fontFamily: FM, fontSize: 11, marginBottom: 12, outline: "none" }} />
      )}

      {blocked && (
        <div style={{ fontFamily: FC, fontSize: 10.5, color: "#f7c948", background: "rgba(247,201,72,0.07)", border: "1px solid rgba(247,201,72,0.25)", borderRadius: 8, padding: "9px 12px", marginBottom: 12, lineHeight: 1.55 }}>
          ⚠ Popup blocked by the browser. Allow popups for this site, or open your broker manually and
          drag its window to the right half of your screen (terminal on the left).
        </div>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, cursor: "pointer" }}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ accentColor: accent }} />
        <span style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 1 }}>DON'T SHOW THIS AGAIN (RE-OPEN VIA ⧉ BUTTON IN THE BOT HEADER)</span>
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={skip} style={{ flex: 1, padding: "12px 0", fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 2, color: dim, background: "transparent", border: `1px solid ${border}`, borderRadius: 9, cursor: "pointer" }}>
          SKIP — JUST THE TERMINAL
        </button>
        <button onClick={launch} style={{ flex: 1.4, padding: "12px 0", fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 2, color: accent, background: `${accent}12`, border: `1px solid ${accent}40`, borderRadius: 9, cursor: "pointer" }}>
          ⧉ OPEN BROKER SIDE-BY-SIDE
        </button>
      </div>
      <div style={{ fontFamily: FM, fontSize: 7.5, color: dim, letterSpacing: 1, textAlign: "center", marginTop: 12, opacity: 0.7 }}>
        SIGNALS ARE INFORMATIONAL · YOU ARE THE TRADER OF RECORD · NOT FINANCIAL ADVICE
      </div>
    </Shell>
  );
}
