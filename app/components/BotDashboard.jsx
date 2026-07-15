"use client";
// BotDashboard.jsx — V10 KRONOS dashboard.
// Real data only (V10 item 13): no simulated stream, no mock fills, no fake P&L.
// Layout: [ SIGNAL FEED column ] [ VIX galaxy orb + market state ] [ scanner ].
// Strict mode isolation (item 9): everything on screen is scoped to OPT or FUT.
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { KronosOnboarding } from "./KronosOnboarding";
import BrokerConnect from "./BrokerConnect";
import PropFirmPanel, { PROP_FIRMS } from "./PropFirmPanel";
import MultiAgentSignal, { getPaperState, savePaperState } from "./MultiAgentSignal";
import ShadowAccountPanel, { PaperTradingPanel } from "./ShadowAccountPanel";
import { ModeSelectPopup, BrokerSideBySidePopup } from "./BotFlowPopups";
import SignalFeed from "./SignalFeed";
import GalaxyOrb, { CometLayer, Starfield, activeSessions, vixLabel } from "./GalaxyOrb";
import { CollapsedRail } from "./CollapseRail";
import TickerLogo from "./TickerLogo";
import { useBotUI, botPanelStyle } from "./BotSettings";

const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";
const FC = "'Inter',sans-serif";

// Per-mode instrument lists + interval defaults (mode-aware engine)
const MODE_CONFIG = {
  futures: { symbols: ["NQ", "MNQ", "ES", "MES", "CL", "GC"], intervals: ["1min", "5min", "15min", "1h"], defaultSymbol: "NQ", defaultInterval: "15min", color: "#7eb8f7" },
  // V10.3: options quick-picks are MAJOR INDICES only — any other ticker is
  // reached through the search box, so the row stays clean instead of a wall of
  // arbitrary large caps.
  options: { symbols: ["SPY", "QQQ"], intervals: ["15min", "1h", "4h", "1d"], defaultSymbol: "SPY", defaultInterval: "1h", color: "#a78bfa" },
};

const vixColor = (v) => (v == null ? "#7A9AB5" : v < 15 ? "#22d3ee" : v < 20 ? "#a78bfa" : v < 30 ? "#f59e0b" : "#ef4444");

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
            Kronos only calls a setup when agent conviction clears this bar. Higher = fewer,
            stricter signals. This directly gates the engine's FIRE decision.
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
export default function BotDashboard({ accent = "#00d4aa", T, botName = "KRONOS" }) {
  // V10.5: the bot's own appearance (panel style, text size, grid) — set in the
  // bot-scoped settings panel, live-updates without a reload.
  const botUI = useBotUI();
  const panelSx = botPanelStyle(botUI, T, accent);

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

  useEffect(() => { try { localStorage.setItem("kronos_min_conviction", String(minConviction)); } catch {} }, [minConviction]);

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
  const assetClass = botMode === "options" ? "options" : "futures";
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
  const toggleMode = () => {
    const next = assetClass === "futures" ? "options" : "futures";
    setBotMode(next);
    try { localStorage.setItem("kronos_botmode", next); } catch {}
    const cfg = MODE_CONFIG[next];
    setSignalSymbol(cfg.defaultSymbol);
    setSignalInterval(cfg.defaultInterval);
    setLatestSignal(null); // item 9: nothing carries across modes
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
      {flowStep === "mode" && !showOnboarding && <ModeSelectPopup accent={accent} T={T} onSelect={selectMode} />}
      {flowStep === "broker" && !showOnboarding && (
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
                <span style={{ fontFamily: FM, fontSize: 8, color: Math.abs(Math.min(0, propRules.dailyLossUsed)) / propRules.dailyLossLimit > 0.5 ? "#ff3d57" : "#7A9AB5" }}>
                  DL: ${Math.abs(Math.min(0, propRules.dailyLossUsed)).toFixed(0)}/${propRules.dailyLossLimit}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button onClick={() => setFlowStep("broker")} title="Open broker side-by-side" style={{
            padding: "4px 10px", borderRadius: 7, cursor: "pointer",
            fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 1,
            color: dim, background: "transparent", border: `1px solid ${border}`,
          }}>⧉ BROKER</button>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${border}` }}>
            {[["futures", "FUT"], ["options", "OPT"]].map(([m, label]) => (
              <button key={m} onClick={() => { if (assetClass !== m) toggleMode(); }} style={{
                padding: "5px 12px", cursor: "pointer",
                fontFamily: FM, fontSize: 9, fontWeight: 800, letterSpacing: 2,
                color: assetClass === m ? MODE_CONFIG[m].color : dim,
                background: assetClass === m ? `${MODE_CONFIG[m].color}16` : "transparent",
                border: "none",
                borderRight: m === "futures" ? `1px solid ${border}` : "none",
              }}>{label}</button>
            ))}
          </div>
          <div style={{ fontFamily: FM, fontSize: 12, color: dim, letterSpacing: 1, fontVariantNumeric: "tabular-nums" }}>{etTime}</div>
        </div>
      </div>

      {/* NAV TABS — restyled by the bot's panel style (solid / glass / outline / flat / neon) */}
      <div style={{ ...panelSx, display: "flex", gap: 5, padding: "6px 20px", borderRadius: 0, borderTop: "none", borderLeft: "none", borderRight: "none", flexShrink: 0 }}>
        {TABS.map(t => {
          const active = tab === t.toLowerCase();
          // "solid"/"flat" keep the original underline look; the richer styles get
          // a filled pill so the tab reads as a surface, matching the panels.
          const pill = botUI.panelStyle !== "solid" && botUI.panelStyle !== "flat";
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
                    boxShadow: active && botUI.panelStyle === "neon" ? `0 0 12px ${accent}35` : "none",
                    backdropFilter: botUI.panelStyle === "glass" ? "blur(8px)" : "none",
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

      {/* TRADING TAB */}
      {tab === "trading" && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* LEFT — the enlarged signal feed column (items 7+10: stream/tape removed) */}
          {botCollapsed.feed ? (
            <CollapsedRail label="Signal Feed" side="left" onExpand={() => toggleBotCol("feed")} accent={accent} T={T} />
          ) : (
            <div style={{ ...panelSx, width: 340, borderRadius: 0, borderTop: "none", borderBottom: "none", borderLeft: "none", flexShrink: 0, padding: 10, display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
              <button onClick={() => toggleBotCol("feed")} title="Collapse signal feed" style={{ position: "absolute", top: 6, right: 6, zIndex: 10, width: 18, height: 18, borderRadius: 4, background: `${surface}cc`, border: `1px solid ${border}`, color: dim, cursor: "pointer", fontFamily: FM, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>◂</button>
              <SignalFeed ref={feedRef} accent={accent} T={T} assetClass={assetClass} onNewSignal={handleSignalEvent} fill vix={vix} />
            </div>
          )}

          {/* CENTER — VIX galaxy + real market state */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, position: "relative", overflow: "hidden" }}>
            <OrbTooltip dim={dim} border={border} surface={surface} text={text} />
            {/* Stars fill the whole panel, BEHIND the galaxy — so the orb sits in
                space rather than floating on a flat surface. */}
            <Starfield T={T} />
            {botUI.showGrid && (
              <div style={{
                position: "absolute", inset: 0, pointerEvents: "none",
                backgroundImage: `linear-gradient(${border}18 1px,transparent 1px),linear-gradient(90deg,${border}18 1px,transparent 1px)`,
                backgroundSize: "46px 46px", opacity: 0.22,
              }} />
            )}

            {/* The galaxy. The VIX read-out is NOT overlaid on it any more — it was
                sitting right on the core and hiding the thing it describes. */}
            <div ref={orbWrapRef} style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", marginTop: -6 }}>
              <GalaxyOrb ref={orbRef} size={560} vix={vix} T={T} />
            </div>

            {/* VIX read-out — below the galaxy, clear of it. */}
            <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "baseline", gap: 12, marginTop: -28 }}>
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
                { label: "LAST SIGNAL", value: latestSignal ? `${latestSignal.direction ?? ""} ${latestSignal.symbol ?? ""}`.trim() || "—" : "—", color: latestSignal?.direction === "SHORT" ? "#ff3d57" : "#00e676" },
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

            {/* Conviction ladder — makes the three orb tiers legible instead of a footnote */}
            <div style={{ ...panelSx, display: "flex", alignItems: "center", gap: 10, position: "relative", zIndex: 1, padding: "6px 12px", borderRadius: 20 }}>
              {[
                { c: "#7A9AB5", t: "<78% SILENT" },
                { c: "#f7c948", t: "78–90% PULSE" },
                { c: "#00e676", t: "90%+ COMET" },
              ].map((x, i) => (
                <div key={x.t} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {i > 0 && <span style={{ color: border, fontSize: 8 }}>│</span>}
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: x.c, boxShadow: `0 0 6px ${x.c}` }} />
                  <span style={{ fontFamily: FM, fontSize: 7.5, color: dim, letterSpacing: 1 }}>{x.t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — live scanner */}
          {botCollapsed.scanner ? (
            <CollapsedRail label="Scanner" side="right" onExpand={() => toggleBotCol("scanner")} accent={accent} T={T} />
          ) : (
          <div style={{ ...panelSx, width: 300, borderRadius: 0, borderTop: "none", borderBottom: "none", borderRight: "none", overflowY: "auto", padding: 12, flexShrink: 0, position: "relative" }}>
            <button onClick={() => toggleBotCol("scanner")} title="Collapse scanner" style={{ position: "absolute", top: 6, left: 6, zIndex: 10, width: 18, height: 18, borderRadius: 4, background: `${surface}cc`, border: `1px solid ${border}`, color: dim, cursor: "pointer", fontFamily: FM, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>▸</button>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, paddingLeft: 20 }}>
              <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 800, letterSpacing: 2, color: modeCfg.color }}>
                {assetClass === "options" ? "🎯 OPTIONS MODE" : "📈 FUTURES MODE"}
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

            <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
              {modeCfg.intervals.map(iv => (
                <button key={iv} onClick={() => setSignalInterval(iv)} style={{
                  flex: 1, fontFamily: FM, fontSize: 8, fontWeight: 700,
                  color: signalInterval === iv ? accent : dim,
                  background: signalInterval === iv ? `${accent}10` : "transparent",
                  border: `1px solid ${signalInterval === iv ? `${accent}25` : border}`,
                  padding: "4px 6px", borderRadius: 5, cursor: "pointer",
                }}>{iv}</button>
              ))}
            </div>
            <MultiAgentSignal
              accent={accent} T={T}
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
