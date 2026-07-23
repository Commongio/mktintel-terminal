"use client";
// BotDashboard.jsx — V10 KRONOS dashboard.
// Real data only (V10 item 13): no simulated stream, no mock fills, no fake P&L.
// Layout: [ SIGNAL FEED column ] [ VIX galaxy orb + market state ] [ scanner ].
// Strict mode isolation (item 9): everything on screen is scoped to OPT or FUT.
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { KronosOnboarding } from "./KronosOnboarding";
import BrokerConnect from "./BrokerConnect";
import BotMiniChart from "./BotMiniChart";
import PropFirmPanel, { PROP_FIRMS } from "./PropFirmPanel";
import MultiAgentSignal, { getPaperState, savePaperState } from "./MultiAgentSignal";
import ShadowAccountPanel, { PaperTradingPanel } from "./ShadowAccountPanel";
import { ModeSelectPopup, BrokerSideBySidePopup, BotEntryWarning, BOT_WARNING_KEY } from "./BotFlowPopups";
import SignalFeed from "./SignalFeed";
import GalaxyOrb, { CometLayer, Starfield, activeSessions, vixLabel } from "./GalaxyOrb";
import { CollapsedRail } from "./CollapseRail";
import TickerLogo from "./TickerLogo";
import { useBotUI, botPanelStyle, botTabStyle, isFloatingStyle } from "./BotSettings";
import { FuturesSessionBadge } from "./MarketStatusBadge";
import { directionLabel } from "../../lib/signalLabels";
import { ALLOWED_INTERVALS } from "../../lib/universe";

const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";
const FC = "'Inter',sans-serif";

// Per-mode instrument lists + interval defaults (mode-aware engine).
//
// V13.5: interval ladders are now CAPPED per asset class (ALLOWED_INTERVALS in
// lib/universe.js — one source of truth shared with the server cron):
//   futures → intraday only (<= 1 day): funded-account day-trading timeframes.
//   options → up to ~2-week swing: high-risk, so no month+/year horizons.
//   equity  → daily / weekly / monthly: long-horizon portfolio growth.
const MODE_CONFIG = {
  futures: { symbols: ["NQ", "MNQ", "ES", "MES", "YM", "RTY", "CL", "GC"], intervals: ALLOWED_INTERVALS.futures, defaultSymbol: "NQ", defaultInterval: "15min", color: "#7eb8f7" },
  // V10.3: options quick-picks are MAJOR INDICES only — any other ticker is
  // reached through the search box, so the row stays clean instead of a wall of
  // arbitrary large caps.
  options: { symbols: ["SPY", "QQQ"], intervals: ALLOWED_INTERVALS.options, defaultSymbol: "SPY", defaultInterval: "1h", color: "#a78bfa" },
  // V13.5: INVEST — grow-the-portfolio mode. Buy/Hold/Sell on large caps.
  equity:  { symbols: ["AAPL", "MSFT", "NVDA", "AMZN"], intervals: ALLOWED_INTERVALS.equity, defaultSymbol: "AAPL", defaultInterval: "1d", color: "#34d399" },
};

// The interval buttons used to be raw codes ("1w", "1mo"), which don't tell you
// what horizon they actually feed — you couldn't see that 1mo IS the yearly
// bucket. Each button now shows the horizon it maps to (matching SignalFeed's
// INTERVAL_BUCKET), so the full scalp→yearly range is visible rather than implied.
const INTERVAL_HORIZON = {
  "1min": "SCALP", "5min": "SCALP", "15min": "INTRADAY", "1h": "HOURLY",
  "4h": "SWING", "1d": "DAILY", "1w": "MONTHLY", "1mo": "YEARLY",
};

const vixColor = (v) => (v == null ? "#9DB4CC" : v < 15 ? "#22d3ee" : v < 20 ? "#a78bfa" : v < 30 ? "#f59e0b" : "#ef4444");

// ─── ORB LEGEND TOOLTIP ────────────────────────────────────────────────────────
function OrbTooltip({ dim, border, surface, text }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "absolute", top: 14, right: 18, zIndex: 5 }}>
      <button onClick={() => setOpen(o => !o)} aria-label="What the orb means" style={{
        width: 26, height: 26, borderRadius: "50%",
        background: surface, border: `1px solid ${border}`,
        color: dim, fontFamily: FM, fontSize: 12, fontWeight: 700,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      }}>?</button>
      {open && (
        <div style={{
          position: "absolute", top: 32, right: 0, width: 250,
          background: surface, border: `1px solid ${border}`, borderRadius: 10,
          padding: "12px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)", backdropFilter: "blur(8px)",
        }}>
          <div style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: text, letterSpacing: 1, marginBottom: 8 }}>
            THE VOLATILITY GALAXY
          </div>
          {[
            ["#22d3ee", "Cool blue/teal — VIX under 15, calm market"],
            ["#a78bfa", "Violet/white — VIX 15–20, normal range"],
            ["#f59e0b", "Amber — VIX 20–30, elevated volatility"],
            ["#ef4444", "Red — VIX 30+, fear territory"],
          ].map(([c, label]) => (
            <div key={c} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c, marginTop: 3, flexShrink: 0, boxShadow: `0 0 6px ${c}` }} />
              <span style={{ fontFamily: FC, fontSize: 10, color: dim, lineHeight: 1.4 }}>{label}</span>
            </div>
          ))}
          <div style={{ fontFamily: FC, fontSize: 9, color: dim, lineHeight: 1.5, marginTop: 6, opacity: 0.8 }}>
            Spin speed tracks volatility. Signals 78–90% conviction pulse the galaxy;
            90%+ launch as a comet into your feed. Below 78% they land silently.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STAT PILL ─────────────────────────────────────────────────────────────────
function Stat({ label, value, accent }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: FM, fontSize: 8, color: "#44566b", letterSpacing: 2, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: FM, fontSize: 16, fontWeight: 800, color: value === "—" ? "#2a3648" : accent, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// ─── ANALYTICS TAB (real data only) ────────────────────────────────────────────
function AnalyticsTab({ accent, T, paperMode, setPaperMode, assetClass }) {
  const surface = T?.surface ?? "#0b1320";
  const border = T?.border ?? "#172030";
  const dim = T?.dim ?? "#3a4a5a";
  const [paper, setPaper] = useState(() => getPaperState(assetClass));
  useEffect(() => { setPaper(getPaperState(assetClass)); }, [assetClass, paperMode]);

  const history = paper.history || [];
  let running = 0;
  const curve = history.map(h => { running += h.pnl || 0; return running; });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      <div style={{ maxWidth: 560 }}>
        <div style={{ marginBottom: 16 }}>
          <PaperTradingPanel accent={accent} T={T} paperMode={paperMode} setPaperMode={setPaperMode} assetClass={assetClass} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <ShadowAccountPanel accent={accent} T={T} assetClass={assetClass} />
        </div>
        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginBottom: 10 }}>
            PAPER EQUITY CURVE — {assetClass.toUpperCase()}
          </div>
          {curve.length >= 2 ? (
            <svg width="100%" height={120} viewBox={`0 0 480 120`} preserveAspectRatio="none">
              {(() => {
                const maxV = Math.max(...curve, 1), minV = Math.min(...curve, 0), range = maxV - minV || 1;
                const pts = curve.map((v, i) => `${10 + (i / Math.max(curve.length - 1, 1)) * 460},${110 - ((v - minV) / range) * 100}`).join(" ");
                const up = curve[curve.length - 1] >= 0;
                return <polyline points={pts} fill="none" stroke={up ? "#00e676" : "#ff3d57"} strokeWidth="2" />;
              })()}
            </svg>
          ) : (
            <div style={{ fontFamily: FC, fontSize: 10.5, color: dim, lineHeight: 1.6, padding: "10px 0" }}>
              No closed paper trades yet in {assetClass} mode. Turn on paper trading and the equity
              curve builds from real virtual executions — nothing here is simulated.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── STUDIO TAB ────────────────────────────────────────────────────────────────
function StudioTab({ accent, T, profile, onEditProfile, onOpenBroker, brokerData, onSelectPropFirm, assetClass, minConviction, setMinConviction }) {
  const surface = T?.surface ?? "#0b1320";
  const border = T?.border ?? "#172030";
  const text = T?.text ?? "#c8d8e8";
  const dim = T?.dim ?? "#3a4a5a";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 460 }}>

        {/* ENGINE — the ONE control that genuinely changes bot behavior (V10 item 8:
            the old Strategies tab was decorative and has been removed entirely). */}
        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, marginBottom: 6 }}>SIGNAL ENGINE</div>
          <div style={{ fontFamily: FC, fontSize: 10.5, color: dim, lineHeight: 1.55, marginBottom: 12 }}>
            Every setup Kronos looks at gets scored 0–100% — that's how strongly its different
            angles of analysis (price trend, chart structure, options/sentiment flow) agree
            with each other. Think of it like a vote: this slider is the minimum percentage
            of agreement required before Kronos will call it a real, tradeable setup.
            <br /><br />
            <b style={{ color: text }}>Higher</b> = only the most one-sided, highest-agreement
            setups get through — fewer signals, but each one stronger. <b style={{ color: text }}>Lower</b> = you'll
            see more setups, including ones where the analysis is more mixed or uncertain.
            <br /><br />
            Any signal above this level is saved into your <b style={{ color: text }}>Signal Feed</b> —
            from manual searches, background scans, and news-driven setups alike.
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: FM, fontSize: 9, color: dim }}>MIN CONVICTION TO FIRE</span>
            <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 800, color: accent }}>{minConviction}%</span>
          </div>
          <input type="range" min={40} max={95} value={minConviction}
            onChange={e => setMinConviction(Number(e.target.value))}
            style={{ width: "100%", accentColor: accent }} />
        </div>

        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, marginBottom: 10 }}>BROKER CONNECTION</div>
          {brokerData ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: FM, fontSize: 11, color: "#00ff88", fontWeight: 700 }}>◈ {brokerData.broker?.toUpperCase()} CONNECTED</span>
              <button onClick={onOpenBroker} style={{ fontFamily: FM, fontSize: 9, color: accent, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>View / Manage</button>
            </div>
          ) : (
            <button onClick={onOpenBroker} style={{
              width: "100%", padding: "10px 0", fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 2,
              color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8, cursor: "pointer",
            }}>+ CONNECT BROKER ACCOUNT</button>
          )}
        </div>

        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, marginBottom: 10 }}>RISK PROFILE</div>
          {profile ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: FM, fontSize: 11, color: text }}>
                {profile.riskTolerance} · {profile.experience} · {profile.accountSize}
              </div>
              <button onClick={onEditProfile} style={{ fontFamily: FM, fontSize: 9, color: accent, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Edit</button>
            </div>
          ) : (
            <button onClick={onEditProfile} style={{
              width: "100%", padding: "10px 0", fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 2,
              color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8, cursor: "pointer",
            }}>SET UP RISK PROFILE</button>
          )}
        </div>

        {/* Prop-firm evals are a FUTURES concept — hidden in Options mode (item 9). */}
        {assetClass === "futures" ? (
          <PropFirmPanel accent={accent} T={T} onFirmSelect={onSelectPropFirm} />
        ) : (
          <div style={{ background: surface, border: `1px dashed ${border}`, borderRadius: 12, padding: "12px 16px" }}>
            <span style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1, lineHeight: 1.6 }}>
              PROP FIRM EVAL TRACKING IS FUTURES-ONLY — SWITCH TO FUT MODE TO CONFIGURE
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
export default function BotDashboard({ accent = "#00d4aa", T, botName = "KRONOS", isMobile = false, isDev = false }) {
  // V10.5: the bot's own appearance (panel style, text size, grid) — set in the
  // bot-scoped settings panel, live-updates without a reload.
  const botUI = useBotUI();
  const panelSx = botPanelStyle(botUI, T, accent);
  const tabSx = botTabStyle(botUI, T, accent);
  const floating = isFloatingStyle(botUI.panelStyle);
  // Child panels (SignalFeed, the scanner) paint their OWN `T.surface` card
  // background. Inside a glass/outline/neon column that re-introduces an opaque
  // block and defeats "everything except the tabs is transparent" — the wrapper
  // was see-through but the contents weren't. Blanking `surface` (and ONLY
  // surface — `panel` stays opaque so the reasoning popups remain readable)
  // makes the children honour the chosen style.
  const panelT = useMemo(
    () => (floating ? { ...T, surface: "transparent" } : T),
    [T, floating]
  );

  const [tab, setTab] = useState("trading");
  const [etTime, setEtTime] = useState("--:--:-- ET");
  const [sessions, setSessions] = useState([]);
  const [vix, setVix] = useState(null);
  const [profile, setProfile] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showBroker, setShowBroker] = useState(false);
  const [brokerData, setBrokerData] = useState(null);
  const [propFirm, setPropFirm] = useState(null);
  const [signalSymbol, setSignalSymbol] = useState("NQ");
  const [signalInterval, setSignalInterval] = useState("15min");
  const [tickerQuery, setTickerQuery] = useState("");
  const [minConviction, setMinConviction] = useState(() => {
    try { return Number(localStorage.getItem("kronos_min_conviction")) || 65; } catch { return 65; }
  });
  const [latestSignal, setLatestSignal] = useState(null); // most recent real event, for center readout

  // V10.2: collapsible bot columns (persisted in its own key; survives reloads)
  const [botCollapsed, setBotCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kronos_bot_collapsed") || "{}"); } catch { return {}; }
  });
  const toggleBotCol = (k) => setBotCollapsed((prev) => {
    const next = { ...prev, [k]: !prev[k] };
    try { localStorage.setItem("kronos_bot_collapsed", JSON.stringify(next)); } catch {}
    return next;
  });

  const orbRef = useRef(null);
  const orbWrapRef = useRef(null);
  const feedRef = useRef(null);
  const cometRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem("kronos_min_conviction", String(minConviction)); } catch {}
    window.dispatchEvent(new Event("kronos-minconviction-change"));
  }, [minConviction]);

  // V13.5: one-time risk-acknowledgment gate. Blocks the mode/broker flow until
  // acknowledged; the flag lives in localStorage and is reviewable from Bot
  // Settings. `reviewWarning` re-opens it on demand without touching the flag.
  const [showEntryWarning, setShowEntryWarning] = useState(() => {
    try { return localStorage.getItem(BOT_WARNING_KEY) !== "1"; } catch { return true; }
  });
  const [reviewWarning, setReviewWarning] = useState(false);
  const acknowledgeWarning = () => {
    try { localStorage.setItem(BOT_WARNING_KEY, "1"); } catch {}
    setShowEntryWarning(false);
  };
  useEffect(() => {
    const onReview = () => setReviewWarning(true);
    window.addEventListener("kronos-bot-review-warning", onReview);
    return () => window.removeEventListener("kronos-bot-review-warning", onReview);
  }, []);

  // Mode + entry flow
  const [botMode, setBotMode] = useState(() => {
    try { return localStorage.getItem("kronos_botmode") || null; } catch { return null; }
  });
  const [flowStep, setFlowStep] = useState(() => {
    try {
      if (!localStorage.getItem("kronos_botmode")) return "mode";
      return localStorage.getItem("kronos_flow_done") === "1" ? "done" : "broker";
    } catch { return "mode"; }
  });
  const assetClass = botMode === "options" ? "options" : botMode === "equity" ? "equity" : "futures";
  const modeCfg = MODE_CONFIG[assetClass];

  // Mode switch resets the scanned instrument. The ticker search lets ANY symbol
  // through now, so we can no longer rely on a whitelist check at render time to
  // stop a futures symbol (NQ) leaking into options mode and vice-versa.
  // MUST stay below `assetClass` — referencing it above its `const` declaration is
  // a temporal-dead-zone ReferenceError that crashes the whole bot page.
  useEffect(() => {
    setSignalSymbol(modeCfg.defaultSymbol);
    setSignalInterval(modeCfg.defaultInterval);
    setTickerQuery("");
  }, [assetClass, modeCfg]);

  const selectMode = (m) => {
    setBotMode(m);
    try { localStorage.setItem("kronos_botmode", m); } catch {}
    const cfg = MODE_CONFIG[m] || MODE_CONFIG.futures;
    setSignalSymbol(cfg.defaultSymbol);
    setSignalInterval(cfg.defaultInterval);
    setLatestSignal(null);
    setFlowStep((prev) => (prev === "mode" ? "broker" : prev));
  };
  // V13.5: switch to a SPECIFIC mode (3 modes now: futures / options / equity),
  // rather than the old 2-way flip. The segmented toggle calls this directly.
  const switchMode = (next) => {
    if (!MODE_CONFIG[next] || next === assetClass) return;
    setBotMode(next);
    try { localStorage.setItem("kronos_botmode", next); } catch {}
    const cfg = MODE_CONFIG[next];
    setSignalSymbol(cfg.defaultSymbol);
    setSignalInterval(cfg.defaultInterval);
    setLatestSignal(null); // nothing carries across modes
  };

  const [paperMode, setPaperMode] = useState(() => {
    try { return localStorage.getItem("kronos_papermode") === "1"; } catch { return false; }
  });
  useEffect(() => { try { localStorage.setItem("kronos_papermode", paperMode ? "1" : "0"); } catch {} }, [paperMode]);

  const handlePaperTrade = useCallback((sig) => {
    const ac = sig.assetClass || "futures";
    const p = getPaperState(ac);
    const riskAmt = p.balance * 0.01;
    const stopDist = Math.abs(sig.entry - sig.stop) || sig.entry * 0.005;
    const qty = Math.max(1, Math.floor(riskAmt / stopDist));
    p.positions.push({ ...sig, qty, openedAt: Date.now() });
    savePaperState(p, ac);
  }, []);

  // ET clock + session tracker (item 12)
  useEffect(() => {
    const tick = () => {
      const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      setEtTime(et.toTimeString().slice(0, 8) + " ET");
      setSessions(activeSessions());
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // Live VIX for the galaxy (60s poll through the redundant data layer)
  useEffect(() => {
    let stop = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/yf-quotes?symbols=${encodeURIComponent("^VIX")}`);
        const d = await r.json();
        const q = (d.data || [])[0];
        if (!stop && q?.price != null) setVix(q.price);
      } catch {}
    };
    poll();
    const t = setInterval(poll, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  // Profile / broker / prop firm restore
  useEffect(() => {
    const saved = localStorage.getItem("kronos_profile");
    if (saved) { try { setProfile(JSON.parse(saved)); } catch { setShowOnboarding(true); } }
    else setShowOnboarding(true);
    try { const b = localStorage.getItem("kronos_broker"); if (b) setBrokerData(JSON.parse(b)); } catch {}
    try { const pf = localStorage.getItem("kronos_propfirm"); if (pf) setPropFirm(JSON.parse(pf).firmId || null); } catch {}
  }, []);

  const refreshBrokerFromStorage = () => {
    try { const b = localStorage.getItem("kronos_broker"); setBrokerData(b ? JSON.parse(b) : null); }
    catch { setBrokerData(null); }
  };

  // Three-tier orb cues (item 14 spec): <78 silent · 78–90 pulse · 90+ comet.
  const handleSignalEvent = useCallback((sig, landCb) => {
    setLatestSignal(sig);
    const conviction = sig.conviction ?? 0;
    const isFire = (sig.status || "").toUpperCase() === "FIRE";
    if (isFire && conviction >= 90) {
      cometRef.current?.launch(orbWrapRef.current, feedRef.current, sig, landCb);
    } else if (isFire && conviction >= 78) {
      orbRef.current?.pulse();
      landCb?.();
    } else {
      landCb?.();
    }
  }, []);

  // V13.5: fire a demo signal through the SAME cue path a real signal uses, so a
  // test genuinely exercises pulse()/launch() rather than a separate mock.
  const testCue = useCallback((conviction) => {
    handleSignalEvent({
      id: `test-${Date.now()}`, symbol: modeCfg.defaultSymbol, asset_class: assetClass,
      status: "FIRE", direction: "LONG", conviction, interval: modeCfg.defaultInterval,
      plan: null, _test: true,
    });
  }, [handleSignalEvent, modeCfg, assetClass]);

  // V13.6: consume the dev "test comet" flag set on /admin — fire a comet once the
  // orb + feed refs are mounted (short delay), then clear the flag so it's one-shot.
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem("kronos_dev_comet_test") === "1"; } catch {}
    if (!seen) return;
    try { localStorage.removeItem("kronos_dev_comet_test"); } catch {}
    const t = setTimeout(() => testCue(95), 1600);
    return () => clearTimeout(t);
  }, [testCue]);

  const bg = T?.bg ?? "#060910";
  const surface = T?.surface ?? "#0b1320";
  const border = T?.border ?? "#172030";
  const text = T?.text ?? "#c8d8e8";
  const dim = T?.dim ?? "#3a4a5a";
  const TABS = ["TRADING", "ANALYTICS", "STUDIO"];

  // propRules: prop-firm limits are futures-only (item 9); minConviction applies to both.
  const propRules = useMemo(() => {
    try {
      const base = { minConviction };
      if (assetClass !== "futures") return base;
      const pf = JSON.parse(localStorage.getItem("kronos_propfirm") || "null");
      if (!pf) return base;
      const firm = PROP_FIRMS[pf.firmId];
      const account = firm?.accounts?.[pf.accountIdx ?? 0];
      if (!account) return base;
      return {
        minConviction,
        dailyLossUsed: brokerData?.portfolio?.dayPnl ?? 0,
        dailyLossLimit: account.dailyLoss ?? account.trailingDD,
        firmName: firm.name, accountLabel: account.label,
      };
    } catch { return { minConviction }; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brokerData, propFirm, assetClass, minConviction]);

  return (
    // Text size: every size in this subtree is an inline px value, so a CSS
    // custom property or a root font-size can't reach them. `zoom` scales the
    // whole subtree (text AND chrome) and is the only thing that actually works
    // here — it's supported in every current browser (Firefox picked it up in 126).
    // A transform:scale would scale it visually but leave the layout box wrong.
    <div className="kronos-bot" style={{ flex: 1, display: "flex", flexDirection: "column", background: bg, overflow: "hidden", minWidth: 0, position: "relative", zoom: botUI.fontScale }}>
      {showOnboarding && (
        <KronosOnboarding accent={accent} T={T} onComplete={(p) => { setProfile(p); setShowOnboarding(false); }} />
      )}
      {showBroker && (
        <BrokerConnect accent={accent} T={T} onClose={() => { setShowBroker(false); refreshBrokerFromStorage(); }} />
      )}
      {/* V13.5: risk warning gates the whole entry flow — mode/broker popups wait
          until it's acknowledged (or already seen on a prior visit). */}
      {showEntryWarning && !showOnboarding && (
        <BotEntryWarning accent={accent} T={T} onAcknowledge={acknowledgeWarning} />
      )}
      {reviewWarning && (
        <BotEntryWarning accent={accent} T={T} reviewMode onAcknowledge={() => setReviewWarning(false)} />
      )}
      {!showEntryWarning && flowStep === "mode" && !showOnboarding && <ModeSelectPopup accent={accent} T={T} onSelect={selectMode} />}
      {!showEntryWarning && flowStep === "broker" && !showOnboarding && (
        <BrokerSideBySidePopup accent={accent} T={T} onDone={() => setFlowStep("done")} onSkip={() => setFlowStep("done")} />
      )}

      {/* comet overlay across the whole dashboard */}
      <CometLayer ref={cometRef} T={T} />

      <style>{`
        @keyframes bot-dot { 0%,100%{opacity:0.35;} 50%{opacity:1;} }
      `}</style>

      {/* HEADER */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 20px", borderBottom: `1px solid ${border}`,
        background: `linear-gradient(180deg, ${surface}f2, ${surface}d8)`, backdropFilter: "blur(10px)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flexWrap: "wrap" }}>
          <div style={{ fontFamily: FD, fontSize: 20, fontWeight: 700, color: text, letterSpacing: 0.4 }}>{botName}</div>
          {/* Active trading sessions (item 12) — real clock math, not decoration */}
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {["ASIA", "LONDON", "NEW YORK"].map((s) => {
              const on = sessions.includes(s);
              return (
                <div key={s} style={{
                  display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 20,
                  border: `1px solid ${on ? "rgba(0,230,118,0.35)" : border}`,
                  background: on ? "rgba(0,230,118,0.07)" : "transparent",
                }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: on ? "#00e676" : "#2a3648", boxShadow: on ? "0 0 6px #00e676" : "none", animation: on ? "bot-dot 1.8s ease-in-out infinite" : "none" }} />
                  <span style={{ fontFamily: FM, fontSize: 7.5, fontWeight: 700, letterSpacing: 1.5, color: on ? "#00e676" : dim }}>{s}</span>
                </div>
              );
            })}
            {sessions.includes("GLOBEX") && (
              <span style={{ fontFamily: FM, fontSize: 7.5, color: dim, letterSpacing: 1 }}>GLOBEX O/N</span>
            )}
          </div>
          {profile && (
            <button onClick={() => setShowOnboarding(true)} style={{
              padding: "3px 10px", borderRadius: 20, cursor: "pointer",
              border: `1px solid ${dim}20`, fontFamily: FM, fontSize: 8, color: dim, background: "transparent",
            }}>{profile.riskTolerance?.toUpperCase()} | {profile.accountSize}</button>
          )}
          {brokerData && (
            <button onClick={() => setShowBroker(true)} style={{
              padding: "3px 10px", borderRadius: 20, cursor: "pointer",
              border: "1px solid rgba(0,255,136,0.25)", fontFamily: FM, fontSize: 8, color: "#00ff88", background: "rgba(0,255,136,0.06)",
            }}>◈ {brokerData.broker?.toUpperCase()}</button>
          )}
          {/* Eval banner — futures mode only (item 9) */}
          {assetClass === "futures" && propRules?.firmName && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20,
              border: "1px solid rgba(247,201,72,0.3)", background: "rgba(247,201,72,0.07)",
            }}>
              <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 700, letterSpacing: 1, color: "#f7c948" }}>
                EVAL: {propRules.firmName} {propRules.accountLabel}
              </span>
              {propRules.dailyLossLimit && (
                <span style={{ fontFamily: FM, fontSize: 8, color: Math.abs(Math.min(0, propRules.dailyLossUsed)) / propRules.dailyLossLimit > 0.5 ? "#ff3d57" : "#9DB4CC" }}>
                  DL: ${Math.abs(Math.min(0, propRules.dailyLossUsed)).toFixed(0)}/${propRules.dailyLossLimit}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, position: "relative" }}>
          {/* V12: dedicated bot-side mini chart for the current instrument. */}
          <BotMiniChart symbol={signalSymbol} T={T} accent={accent} />
          <button onClick={() => setFlowStep("broker")} title="Open broker side-by-side" style={{
            padding: "4px 10px", borderRadius: 7, cursor: "pointer",
            fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 1,
            color: dim, background: "transparent", border: `1px solid ${border}`,
          }}>⧉ BROKER</button>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${border}` }}>
            {[["futures", "FUT"], ["options", "OPT"], ["equity", "INVEST"]].map(([m, label], i) => (
              <button key={m} onClick={() => switchMode(m)} style={{
                padding: "5px 12px", cursor: "pointer",
                fontFamily: FM, fontSize: 9, fontWeight: 800, letterSpacing: 2,
                color: assetClass === m ? MODE_CONFIG[m].color : dim,
                background: assetClass === m ? `${MODE_CONFIG[m].color}16` : "transparent",
                border: "none",
                borderRight: i < 2 ? `1px solid ${border}` : "none",
              }}>{label}</button>
            ))}
          </div>
          {/* V13: futures scan around the clock (Globex, not equity hours) — show
              THAT session instead of implying the bot is idle overnight. */}
          {assetClass === "futures" && <FuturesSessionBadge T={T} />}
          <div style={{ fontFamily: FM, fontSize: 12, color: dim, letterSpacing: 1, fontVariantNumeric: "tabular-nums" }}>{etTime}</div>
        </div>
      </div>

      {/* NAV TABS — the one surface that keeps chrome (frosted/solid-ish) across
          every panel style; the panels themselves (below) go transparent instead. */}
      <div style={{
        ...tabSx, display: "flex", gap: 5, padding: "6px 20px", flexShrink: 0,
        // Flush-mounted for solid/flat (classic terminal look); floated with a
        // margin for glass/outline/neon so the rounded corners + edge are visible
        // instead of being cropped against the window.
        ...(floating
          ? { margin: "8px 10px 4px" }
          : { borderTop: "none", borderLeft: "none", borderRight: "none" }),
      }}>
        {TABS.map(t => {
          const active = tab === t.toLowerCase();
          // "solid"/"flat" keep the original underline look; the richer styles get
          // a filled pill so the tab reads as a surface, matching the panels.
          const pill = botUI.panelStyle !== "solid" && botUI.panelStyle !== "flat";
          const glow = botUI.panelStyle === "neon" || botUI.panelStyle === "outline";
          return (
            <button key={t} onClick={() => setTab(t.toLowerCase())} style={{
              padding: pill ? "7px 16px" : "9px 18px",
              fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 2,
              color: active ? accent : dim,
              cursor: "pointer", transition: "all 0.2s",
              ...(pill
                ? {
                    borderRadius: 8,
                    background: active ? `${accent}18` : "transparent",
                    border: `1px solid ${active ? `${accent}45` : "transparent"}`,
                    boxShadow: active && glow ? `0 0 ${botUI.panelStyle === "neon" ? 12 : 6}px ${accent}${botUI.panelStyle === "neon" ? "35" : "20"}` : "none",
                    backdropFilter: (botUI.panelStyle === "glass" || botUI.panelStyle === "outline" || botUI.panelStyle === "neon") ? "blur(8px)" : "none",
                  }
                : {
                    background: "transparent",
                    border: "none",
                    borderBottom: `2px solid ${active ? accent : "transparent"}`,
                  }),
            }}>{t}</button>
          );
        })}
      </div>

      {/* TRADING TAB
          Mobile: the 340 + orb + 300 three-column row becomes ONE scrolling
          column. Order is deliberate — SCANNER first (the thing you came to ask),
          then the FEED, then the orb. The orb is beautiful but it's ambient; on a
          phone the actionable content has to win the top of the viewport. */}
      {tab === "trading" && (
        <div style={{
          flex: 1, display: "flex", position: "relative",
          ...(isMobile
            ? { flexDirection: "column", overflowY: "auto", overflowX: "hidden", WebkitOverflowScrolling: "touch" }
            : { overflow: "hidden" }),
        }}>
          {/* V10.5: Starfield moved from inside just the center column to here — a
              sibling spanning the WHOLE three-column row — so stars actually reach
              every corner of the screen instead of stopping at the center panel's
              edges. It paints behind the feed/center/scanner columns (DOM order);
              with any non-solid panel style those columns are now transparent
              (see BotSettings' botPanelStyle), so the stars show straight through. */}
          <Starfield T={T} />
          {/* LEFT — the enlarged signal feed column (items 7+10: stream/tape removed).
              On mobile: full-width, order 2 (under the scanner). Collapse rails are
              a desktop idea — there's no side to collapse to on a phone, and the
              tab bar already gets you out. */}
          {botCollapsed.feed && !isMobile ? (
            <CollapsedRail label="Signal Feed" side="left" onExpand={() => toggleBotCol("feed")} accent={accent} T={T} />
          ) : (
            <div style={{
              ...panelSx, padding: 10,
              display: "flex", flexDirection: "column", position: "relative",
              ...(isMobile
                ? { order: 2, width: "100%", flexShrink: 0, minHeight: 420, margin: "6px 0" }
                : { width: 340, flexShrink: 0, minHeight: 0,
                    ...(floating ? { margin: "4px 5px 8px 10px" } : { borderTop: "none", borderBottom: "none", borderLeft: "none" }) }),
            }}>
              {!isMobile && (
                <button onClick={() => toggleBotCol("feed")} title="Collapse signal feed" style={{ position: "absolute", top: 6, right: 6, zIndex: 10, width: 18, height: 18, borderRadius: 4, background: `${surface}cc`, border: `1px solid ${border}`, color: dim, cursor: "pointer", fontFamily: FM, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>◂</button>
              )}
              <SignalFeed ref={feedRef} accent={accent} T={panelT} assetClass={assetClass} onNewSignal={handleSignalEvent} fill vix={vix} isDev={isDev} />
            </div>
          )}

          {/* CENTER — VIX galaxy + real market state. Order 3 on mobile: it's the
              ambient volatility gauge, not the thing you act on. */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 12, position: "relative", overflow: "hidden",
            ...(isMobile ? { order: 3, width: "100%", flexShrink: 0, padding: "18px 0 26px" } : { flex: 1 }),
          }}>
            <OrbTooltip dim={dim} border={border} surface={surface} text={text} />
            {botUI.showGrid && (
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                backgroundImage: `linear-gradient(${border}18 1px,transparent 1px),linear-gradient(90deg,${border}18 1px,transparent 1px)`,
                backgroundSize: "46px 46px", opacity: 0.22,
              }} />
            )}

            {/* The galaxy. The VIX read-out is NOT overlaid on it any more — it was
                sitting right on the core and hiding the thing it describes. */}
            {/* 640 is a desktop number — it would overflow a 375px phone and force
                a horizontal scroll. 300 keeps the galaxy legible without hijacking
                the whole viewport. */}
            <div ref={orbWrapRef} style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", marginTop: isMobile ? 0 : -6 }}>
              <GalaxyOrb ref={orbRef} size={isMobile ? 300 : 640} vix={vix} T={T} />
            </div>

            {/* VIX read-out — below the galaxy, clear of it. The -28 pull-up is
                tuned to the 640px orb's empty lower halo; at 300px that would
                drag the number onto the galaxy itself. */}
            <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "baseline", gap: 12, marginTop: isMobile ? -6 : -28 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: FM, fontSize: 7.5, color: dim, letterSpacing: 3.5, marginBottom: 4 }}>MARKET VOLATILITY</div>
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <span style={{ fontFamily: FM, fontSize: 44, fontWeight: 900, lineHeight: 1, color: vixColor(vix), textShadow: `0 0 34px ${vixColor(vix)}55`, fontVariantNumeric: "tabular-nums" }}>
                    {vix != null ? vix.toFixed(2) : "—"}
                  </span>
                  <span style={{ padding: "3px 10px", borderRadius: 20, background: `${vixColor(vix)}18`, border: `1px solid ${vixColor(vix)}45` }}>
                    <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, letterSpacing: 2, color: vixColor(vix) }}>VIX · {vixLabel(vix)}</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Stat strip — carded, so it reads as instrumentation instead of loose text */}
            <div style={{ display: "flex", gap: 8, position: "relative", zIndex: 1 }}>
              {[
                { label: "MODE", value: assetClass.toUpperCase(), color: modeCfg.color },
                { label: "LAST SIGNAL", value: latestSignal ? `${latestSignal.direction ? directionLabel(latestSignal.direction, assetClass) : ""} ${latestSignal.symbol ?? ""}`.trim() || "—" : "—", color: latestSignal?.direction === "SHORT" ? "#ff3d57" : "#00e676" },
                { label: "CONVICTION", value: latestSignal?.conviction != null ? `${latestSignal.conviction}%` : "—", color: accent },
              ].map((s) => (
                <div key={s.label} style={{
                  minWidth: 108, padding: "9px 14px", borderRadius: 10, textAlign: "center",
                  ...panelSx,
                }}>
                  <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 2, marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontFamily: FM, fontSize: 13, fontWeight: 800, color: s.color, letterSpacing: 0.5 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Conviction ladder — makes the three orb tiers legible instead of a
                footnote. V13.5: each tier is now a TEST TRIGGER — click PULSE or
                COMET to fire that cue with a demo signal so users (and dev) can
                confirm the orb effects work. */}
            <div style={{ ...panelSx, display: "flex", alignItems: "center", gap: 10, position: "relative", zIndex: 1, padding: "6px 12px", borderRadius: 20 }}>
              {[
                { c: "#9DB4CC", t: "<78% SILENT", conv: null },
                { c: "#f7c948", t: "78–90% PULSE", conv: 85 },
                { c: "#00e676", t: "90%+ COMET", conv: 95 },
              ].map((x, i) => (
                <div key={x.t}
                  onClick={x.conv ? () => testCue(x.conv) : undefined}
                  title={x.conv ? "Click to test this orb cue" : "Below 78% the signal lands silently"}
                  style={{ display: "flex", alignItems: "center", gap: 6, cursor: x.conv ? "pointer" : "default" }}>
                  {i > 0 && <span style={{ color: border, fontSize: 8 }}>│</span>}
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: x.c, boxShadow: `0 0 6px ${x.c}` }} />
                  <span style={{ fontFamily: FM, fontSize: 7.5, color: dim, letterSpacing: 1 }}>{x.t}{x.conv ? " ▸" : ""}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — live scanner. Order 1 on mobile: this is the ask-a-ticker
              panel, so it earns the top of the phone viewport. */}
          {botCollapsed.scanner && !isMobile ? (
            <CollapsedRail label="Scanner" side="right" onExpand={() => toggleBotCol("scanner")} accent={accent} T={T} />
          ) : (
          <div style={{
            ...panelSx, padding: 12, position: "relative",
            ...(isMobile
              ? { order: 1, width: "100%", flexShrink: 0, margin: "6px 0 0" }
              : { width: 300, overflowY: "auto", flexShrink: 0,
                  ...(floating ? { margin: "4px 10px 8px 5px" } : { borderTop: "none", borderBottom: "none", borderRight: "none" }) }),
          }}>
            {!isMobile && (
              <button onClick={() => toggleBotCol("scanner")} title="Collapse scanner" style={{ position: "absolute", top: 6, left: 6, zIndex: 10, width: 18, height: 18, borderRadius: 4, background: `${surface}cc`, border: `1px solid ${border}`, color: dim, cursor: "pointer", fontFamily: FM, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>▸</button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingLeft: isMobile ? 0 : 20 }}>
              <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 800, letterSpacing: 2, color: modeCfg.color }}>
                {assetClass === "options" ? "🎯 OPTIONS MODE" : assetClass === "equity" ? "📊 INVEST MODE" : "📈 FUTURES MODE"}
              </span>
            </div>
            {/* Quick-picks: major indices only */}
            <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
              {modeCfg.symbols.map(s => (
                <button key={s} onClick={() => { setSignalSymbol(s); setTickerQuery(""); }} style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                  fontFamily: FM, fontSize: 10, fontWeight: 800, letterSpacing: 1,
                  color: signalSymbol === s ? accent : dim,
                  background: signalSymbol === s ? `${accent}12` : "transparent",
                  border: `1px solid ${signalSymbol === s ? `${accent}35` : border}`,
                  padding: "7px 8px", borderRadius: 7, cursor: "pointer", transition: "all 0.15s",
                }}>
                  <TickerLogo symbol={s} size={14} />{s}
                </button>
              ))}
            </div>

            {/* Ticker search — any tradeable symbol, not just the quick-picks */}
            <form onSubmit={(e) => { e.preventDefault(); const t = tickerQuery.trim().toUpperCase(); if (t) setSignalSymbol(t); }}
              style={{ position: "relative", marginBottom: 10 }}>
              <input
                value={tickerQuery}
                onChange={(e) => setTickerQuery(e.target.value.toUpperCase().replace(/[^A-Z0-9.\-=]/g, "").slice(0, 10))}
                placeholder="What stock are we looking at today?"
                aria-label="Search any ticker to analyze"
                style={{
                  width: "100%", boxSizing: "border-box", padding: "8px 30px 8px 26px",
                  background: "#05080F", border: `1px solid ${tickerQuery ? `${accent}45` : border}`,
                  borderRadius: 7, color: text, fontFamily: FM, fontSize: 10, letterSpacing: 0.5, outline: "none",
                }}
              />
              <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: dim, pointerEvents: "none" }}>⌕</span>
              {tickerQuery && (
                <button type="submit" title="Analyze this ticker" style={{
                  position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)",
                  width: 20, height: 20, borderRadius: 5, border: `1px solid ${accent}40`, background: `${accent}15`,
                  color: accent, fontFamily: FM, fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}>▸</button>
              )}
            </form>

            {/* Which symbol the engine is actually on right now */}
            {!modeCfg.symbols.includes(signalSymbol) && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9, padding: "5px 9px", borderRadius: 6, background: `${accent}0c`, border: `1px solid ${accent}28` }}>
                <TickerLogo symbol={signalSymbol} size={13} />
                <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, color: accent, letterSpacing: 1 }}>{signalSymbol}</span>
                <span style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1 }}>CUSTOM</span>
                <button onClick={() => setSignalSymbol(modeCfg.defaultSymbol)} title="Back to default"
                  style={{ marginLeft: "auto", background: "none", border: "none", color: dim, cursor: "pointer", fontSize: 10, fontFamily: FM }}>✕</button>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
              {modeCfg.intervals.map(iv => (
                <button key={iv} onClick={() => setSignalInterval(iv)}
                  title={`${iv} candles — ${INTERVAL_HORIZON[iv] || ""} horizon`}
                  style={{
                    flex: "1 1 22%", fontFamily: FM, fontWeight: 700, lineHeight: 1.25,
                    color: signalInterval === iv ? accent : dim,
                    background: signalInterval === iv ? `${accent}10` : "transparent",
                    border: `1px solid ${signalInterval === iv ? `${accent}25` : border}`,
                    padding: "4px 5px", borderRadius: 5, cursor: "pointer",
                  }}>
                  <span style={{ display: "block", fontSize: 8.5 }}>{iv}</span>
                  <span style={{ display: "block", fontSize: 6, letterSpacing: 0.5, opacity: 0.75 }}>{INTERVAL_HORIZON[iv]}</span>
                </button>
              ))}
            </div>
            <MultiAgentSignal
              accent={accent} T={panelT}
              symbol={signalSymbol || modeCfg.defaultSymbol}
              interval={modeCfg.intervals.includes(signalInterval) ? signalInterval : modeCfg.defaultInterval}
              assetClass={assetClass}
              propRules={propRules}
              paperMode={paperMode}
              onPaperTrade={handlePaperTrade}
              onFire={(sig) => handleSignalEvent(sig)}
            />
          </div>
          )}
        </div>
      )}

      {/* ANALYTICS TAB */}
      {tab === "analytics" && (
        <AnalyticsTab accent={accent} T={T} paperMode={paperMode} setPaperMode={setPaperMode} assetClass={assetClass} />
      )}

      {/* STUDIO TAB */}
      {tab === "studio" && (
        <StudioTab
          accent={accent} T={T} profile={profile}
          onEditProfile={() => setShowOnboarding(true)}
          onOpenBroker={() => setShowBroker(true)}
          onSelectPropFirm={(d) => setPropFirm(d)}
          brokerData={brokerData}
          assetClass={assetClass}
          minConviction={minConviction}
          setMinConviction={setMinConviction}
        />
      )}
    </div>
  );
}
