"use client";
import { useState, useEffect, useRef } from "react";
import { KronosOnboarding } from "./KronosOnboarding";

// ─── TYPOGRAPHY (mirrors page.js) ──────────────────────────────────────────────
const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";
const FC = "'Inter',sans-serif";

// ─── CONVICTION HELPERS ────────────────────────────────────────────────────────
const convColor = (s) =>
  s >= 80 ? "#00ff88" : s >= 60 ? "#f7c948" : s >= 40 ? "#ff6b35" : "#ff4d6d";
const convLabel = (s) =>
  s >= 80 ? "HIGH CONFIDENCE" : s >= 60 ? "MEDIUM CONFIDENCE" : s >= 40 ? "CAUTION" : "SPECULATIVE";

// ─── STREAM TAG STYLES ─────────────────────────────────────────────────────────
const TAG = {
  SIGN: { bg: "rgba(126,184,247,0.10)", bc: "rgba(126,184,247,0.30)", tc: "#7eb8f7" },
  BROK: { bg: "rgba(247,201,72,0.10)",  bc: "rgba(247,201,72,0.30)",  tc: "#f7c948" },
  SCAN: { bg: "rgba(167,139,250,0.10)", bc: "rgba(167,139,250,0.30)", tc: "#a78bfa" },
  SES:  { bg: "rgba(0,212,170,0.10)",   bc: "rgba(0,212,170,0.30)",   tc: "#00d4aa" },
};

// ─── INITIAL MOCK DATA (replace with Webull API in V.7) ───────────────────────
const INIT_SIGNALS = [
  { id:1, type:"SES",  msg:"Session: NY_AM → SCANNING | NQ: 21,498.50",         time:"09:30:00", score:null },
  { id:2, type:"SIGN", msg:"Signal COOLDOWN — LONG 120s remaining | score 78",   time:"09:31:22", score:78   },
  { id:3, type:"SIGN", msg:"Signal #657: LONG @ 21,510 | Score 74",              time:"09:32:45", score:74   },
  { id:4, type:"BROK", msg:"[WinLock] Bracket blocked — win lock active",         time:"09:33:10", score:null },
  { id:5, type:"SIGN", msg:"Signal FIRE: #658 | LONG NQ x1 @ 21,540 | stop...", time:"09:34:02", score:82   },
  { id:6, type:"SIGN", msg:"Signal COOLDOWN — LONG 237s remaining | score 79",   time:"09:35:17", score:79   },
];

const INIT_FILLS = [
  { id:1, dir:"LONG",  inst:"NQ",  status:"CLOSED", result:"WIN",  pnl:"+$748", score:82 },
  { id:2, dir:"LONG",  inst:"NQ",  status:"CLOSED", result:"WIN",  pnl:"+$487", score:74 },
  { id:3, dir:"SHORT", inst:"MNQ", status:"CLOSED", result:"LOSS", pnl:"-$125", score:55 },
  { id:4, dir:"LONG",  inst:"NQ",  status:"OPEN",   result:null,   pnl:"+$125", score:79 },
];

// ─── SIGNAL TAG ────────────────────────────────────────────────────────────────
function SignalTag({ type }) {
  const s = TAG[type] || TAG.SIGN;
  return (
    <span style={{
      fontFamily: FM, fontSize: 8, fontWeight: 700, letterSpacing: 1,
      padding: "2px 5px", borderRadius: 3, flexShrink: 0,
      background: s.bg, border: `1px solid ${s.bc}`, color: s.tc,
    }}>
      {type}
    </span>
  );
}

// ─── FILL CARD ─────────────────────────────────────────────────────────────────
function FillCard({ fill, accent }) {
  const isOpen = fill.result === null;
  const isWin  = fill.result === "WIN";
  const bc     = isOpen ? accent : isWin ? "#00ff88" : "#ff4d6d";
  const cc     = convColor(fill.score);
  return (
    <div style={{
      border: `1px solid ${bc}22`, borderLeft: `3px solid ${bc}`,
      borderRadius: 8, padding: "9px 11px", marginBottom: 7,
      background: `${isOpen ? accent : isWin ? "#00ff88" : "#ff4d6d"}06`,
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
          {!isOpen && (
            <span style={{
              fontFamily: FM, fontSize: 8, fontWeight: 700,
              padding: "2px 5px", borderRadius: 3,
              color: isWin ? "#00ff88" : "#ff4d6d",
              background: isWin ? "#00ff8812" : "#ff4d6d12",
              border: `1px solid ${isWin ? "#00ff8828" : "#ff4d6d28"}`,
            }}>{fill.result}</span>
          )}
          <span style={{
            fontFamily: FM, fontSize: 11, fontWeight: 700,
            color: fill.dir === "LONG" ? "#00d4aa" : "#ff4d6d",
          }}>
            {fill.dir} {fill.inst}
          </span>
        </div>
        <span style={{
          fontFamily: FM, fontSize: 13, fontWeight: 800,
          color: fill.pnl.startsWith("+") ? "#00ff88" : "#ff4d6d",
        }}>
          {fill.pnl}
        </span>
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <span style={{
          fontFamily: FM, fontSize: 8, padding: "1px 6px", borderRadius: 3,
          color: isOpen ? accent : "#555",
          background: isOpen ? `${accent}10` : "#ffffff08",
          border: `1px solid ${isOpen ? accent + "28" : "#ffffff10"}`,
        }}>
          {fill.status}
        </span>
        <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 700, color: cc }}>
          {fill.score}% conviction
        </span>
      </div>
    </div>
  );
}

// ─── ANIMATED ORB ──────────────────────────────────────────────────────────────
function BotOrb({ score, accent }) {
  const cc = convColor(score);
  return (
    <div style={{
      position: "relative", width: 264, height: 264,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>

      {/* Outer pulse halos */}
      {[288, 272, 256].map((sz, i) => (
        <div key={sz} style={{
          position: "absolute", width: sz, height: sz, borderRadius: "50%",
          border: `1px solid ${cc}${["09","13","1f"][i]}`,
          animation: `bot-pulse ${2.5 + i * 0.65}s ease-in-out infinite`,
          animationDelay: `${i * 0.22}s`,
        }} />
      ))}

      {/* Flat outer mesh ring — slow spin */}
      <div style={{
        position: "absolute", width: 236, height: 236, borderRadius: "50%",
        border: `1px solid ${cc}20`,
        animation: "bot-spin 22s linear infinite",
      }}>
        {[...Array(12)].map((_, i) => (
          <div key={i} style={{
            position: "absolute", width: "100%", height: 1, top: "50%", left: 0,
            background: `linear-gradient(90deg,transparent,${cc}16,${cc}28,${cc}16,transparent)`,
            transform: `rotate(${i * 15}deg)`, transformOrigin: "center",
          }} />
        ))}
      </div>

      {/* Flat inner mesh ring — counter spin */}
      <div style={{
        position: "absolute", width: 190, height: 190, borderRadius: "50%",
        border: `1px solid ${accent}18`,
        animation: "bot-spinR 14s linear infinite",
      }}>
        {[...Array(8)].map((_, i) => (
          <div key={i} style={{
            position: "absolute", width: "100%", height: 1, top: "50%", left: 0,
            background: `linear-gradient(90deg,transparent,${accent}12,${accent}22,${accent}12,transparent)`,
            transform: `rotate(${i * 22.5}deg)`, transformOrigin: "center",
          }} />
        ))}
      </div>

      {/* Tilted ring X — 3D illusion (keyframe includes tilt) */}
      <div style={{
        position: "absolute", width: 214, height: 214, borderRadius: "50%",
        border: `1px solid ${cc}16`,
        animation: "bot-tiltX 32s linear infinite",
      }} />

      {/* Tilted ring Y */}
      <div style={{
        position: "absolute", width: 204, height: 204, borderRadius: "50%",
        border: `1px solid ${accent}0e`,
        animation: "bot-tiltY 25s linear infinite",
      }} />

      {/* Tilted ring XY diagonal */}
      <div style={{
        position: "absolute", width: 222, height: 222, borderRadius: "50%",
        border: `1px solid ${cc}0b`,
        animation: "bot-tiltXY 40s linear infinite",
      }} />

      {/* Red accent outer ring — homage to JARVIS */}
      <div style={{
        position: "absolute", width: 248, height: 248, borderRadius: "50%",
        border: "1.5px solid rgba(255,77,109,0.14)",
        animation: "bot-spinR 50s linear infinite",
      }} />

      {/* Soft inner glow sphere */}
      <div style={{
        position: "absolute", width: 138, height: 138, borderRadius: "50%",
        background: `radial-gradient(circle at 38% 32%,${cc}50,${cc}18 55%,transparent 78%)`,
        animation: "bot-pulse 2.8s ease-in-out infinite",
      }} />

      {/* Outer ambient fill */}
      <div style={{
        position: "absolute", width: 176, height: 176, borderRadius: "50%",
        background: `radial-gradient(circle,${cc}07 0%,transparent 68%)`,
        animation: "bot-pulse 3.4s ease-in-out infinite",
        animationDelay: "0.6s",
      }} />

      {/* Core — pulsing wrapper + static colored ball */}
      <div style={{
        position: "relative", zIndex: 10,
        width: 70, height: 70, borderRadius: "50%",
        animation: "bot-pulse 2.2s ease-in-out infinite",
      }}>
        {/* Core glow ring */}
        <div style={{
          position: "absolute", inset: -18, borderRadius: "50%",
          background: `radial-gradient(circle,${cc}22 0%,transparent 70%)`,
        }} />
        {/* Core ball */}
        <div style={{
          width: "100%", height: "100%", borderRadius: "50%",
          background: `radial-gradient(circle at 34% 30%,#ffffff,${cc}ee 42%,${cc}88 68%,transparent)`,
          boxShadow: `0 0 22px ${cc}70, 0 0 44px ${cc}35, 0 0 70px ${cc}18`,
        }} />
      </div>
    </div>
  );
}

// ─── CONVICTION BAR ────────────────────────────────────────────────────────────
function ConvictionBar({ score, border, surface }) {
  const cc = convColor(score);
  const cl = convLabel(score);
  return (
    <div style={{
      width: 248, padding: "13px 16px",
      background: surface, border: `1px solid ${border}`, borderRadius: 12,
    }}>
      <div style={{
        fontFamily: FM, fontSize: 8, color: "#555",
        letterSpacing: 2, marginBottom: 9, textAlign: "center",
      }}>
        CURRENT SIGNAL CONVICTION
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
        <div style={{
          flex: 1, height: 7, background: "#060910",
          borderRadius: 4, overflow: "hidden", border: `1px solid ${border}`,
        }}>
          <div style={{
            height: "100%", width: `${score}%`, borderRadius: 4,
            background: `linear-gradient(90deg,${cc}70,${cc})`,
            boxShadow: `0 0 10px ${cc}55`,
            transition: "width 0.85s cubic-bezier(0.4,0,0.2,1)",
          }} />
        </div>
        <span style={{
          fontFamily: FM, fontSize: 18, fontWeight: 800,
          color: cc, minWidth: 48, textAlign: "right",
        }}>
          {score}%
        </span>
      </div>
      <div style={{
        textAlign: "center", fontFamily: FM,
        fontSize: 8, color: cc, letterSpacing: 2, fontWeight: 700,
      }}>
        {cl}
      </div>
    </div>
  );
}

// ─── STAT PILL ─────────────────────────────────────────────────────────────────
function Stat({ label, value, accent }) {
  return (
    <div style={{ textAlign:"center" }}>
      <div style={{ fontFamily:FM, fontSize:8, color:"#444", letterSpacing:2, marginBottom:3 }}>{label}</div>
      <div style={{ fontFamily:FM, fontSize:16, fontWeight:800, color:value==="—"?"#2a2a2a":accent }}>{value}</div>
    </div>
  );
}

// ─── COMING SOON TAB ──────────────────────────────────────────────────────────
function ComingSoon({ tab, dim }) {
  const subtitles = {
    strategies: "V.7 — AI strategy builder, backtester & optimizer",
    analytics:  "V.7 — Full win/loss curves, drawdown analysis & heatmaps",
    studio:     "V.7 — Bot config, training parameters & self-improvement loop",
  };
  return (
    <div style={{
      flex:1, display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", gap:10,
    }}>
      <div style={{ fontFamily:FD, fontSize:32, fontWeight:700, color:dim, opacity:0.35 }}>
        {tab.charAt(0).toUpperCase() + tab.slice(1)}
      </div>
      <div style={{ fontFamily:FC, fontSize:13, color:dim, opacity:0.25 }}>
        {subtitles[tab]}
      </div>
    </div>
  );
}

// ─── MAIN BOT DASHBOARD ────────────────────────────────────────────────────────
export default function BotDashboard({ accent = "#00d4aa", T, botName = "KRONOS" }) {

  const [tab,       setTab]       = useState("trading");
  const [signals,   setSignals]   = useState(INIT_SIGNALS);
  const [fills]                   = useState(INIT_FILLS);
  const [sessionPnL]              = useState(1235);
  const [botStatus, setBotStatus] = useState("SCANNING");
  const [etTime,    setEtTime]    = useState("--:--:-- ET");
  const [score,     setScore]     = useState(78);
  const [profile,        setProfile]        = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const streamRef = useRef(null);
  const sigId     = useRef(7);

  // ── Live ET clock ──────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      setEtTime(et.toTimeString().slice(0, 8) + " ET");
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  // ── Auto-scroll stream to bottom ───────────────────────────────────────────
  useEffect(() => {
    if (streamRef.current) streamRef.current.scrollTop = streamRef.current.scrollHeight;
  }, [signals]);

  useEffect(() => {
    const saved = localStorage.getItem("kronos_profile");
    if (saved) {
      try { setProfile(JSON.parse(saved)); }
      catch { setShowOnboarding(true); }
    } else {
      setShowOnboarding(true);
    }
  }, []);

  // ── Simulated live signals (replace with Webull WS feed in V.7) ────────────
  useEffect(() => {
    const TYPES = ["SIGN", "SIGN", "SIGN", "BROK", "SES"];
    const gen = (s, p, id) => [
      `Signal COOLDOWN — LONG ${Math.floor(Math.random() * 280) + 20}s remaining | score ${s}`,
      `Signal FIRE: #${id} | LONG NQ x1 @ ${p} | stop ${(parseFloat(p) - 50).toFixed(2)}`,
      `Signal #${id}: LONG @ ${p} | Score ${s}`,
      `[WinLock] Bracket activated — profit locked in`,
      `Session: NY_PM → ${["SCANNING","LIVE","COOLDOWN"][Math.floor(Math.random()*3)]}`,
    ];
    const interval = setInterval(() => {
      const newScore = Math.floor(Math.random() * 36) + 57;
      const price    = (21400 + Math.random() * 260).toFixed(2);
      const idx      = Math.floor(Math.random() * 5);
      const id       = sigId.current++;
      setSignals(prev => [...prev.slice(-24), {
        id,
        type: TYPES[idx],
        msg:  gen(newScore, price, id)[idx],
        time: new Date().toTimeString().slice(0, 8),
        score: TYPES[idx] === "SIGN" ? newScore : null,
      }]);
      if (TYPES[idx] === "SIGN") {
        setScore(newScore);
        if (newScore >= 80) setBotStatus("LIVE");
        else if (newScore >= 60) setBotStatus("SCANNING");
        else setBotStatus("COOLDOWN");
      }
    }, 3800);
    return () => clearInterval(interval);
  }, []);

  // ── Derived stats ──────────────────────────────────────────────────────────
  const wins   = fills.filter(f => f.result === "WIN").length;
  const closed = fills.filter(f => f.result !== null).length;
  const wr     = closed > 0 ? Math.round((wins / closed) * 100) : 0;
  const open   = fills.filter(f => f.status === "OPEN").length;

  // ── Theme fallbacks ────────────────────────────────────────────────────────
  const bg      = T?.bg      ?? "#060910";
  const surface = T?.surface ?? "#0b1320";
  const border  = T?.border  ?? "#172030";
  const text    = T?.text    ?? "#c8d8e8";
  const dim     = T?.dim     ?? "#3a4a5a";

  const TABS = ["TRADING", "STRATEGIES", "ANALYTICS", "STUDIO"];
  const statusColor = botStatus === "LIVE" ? "#00ff88" : botStatus === "SCANNING" ? "#f7c948" : "#ff4d6d";

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", background:bg, overflow:"hidden", minWidth:0 }}>
      {showOnboarding && (
        <KronosOnboarding accent={accent} T={T} onComplete={(p)=>{setProfile(p);setShowOnboarding(false);}} />
      )}

      {/* ── KEYFRAME ANIMATIONS ── */}
      <style>{`
        @keyframes bot-spin    { from{transform:rotate(0deg);}    to{transform:rotate(360deg);}  }
        @keyframes bot-spinR   { from{transform:rotate(360deg);}  to{transform:rotate(0deg);}    }
        @keyframes bot-pulse   { 0%,100%{opacity:0.60;} 50%{opacity:1;} }
        @keyframes bot-pnl     { 0%,100%{text-shadow:0 0 18px #00ff8828;} 50%{text-shadow:0 0 36px #00ff8868,0 0 70px #00ff8822;} }
        @keyframes bot-stream  { from{opacity:0;transform:translateX(-8px);} to{opacity:1;transform:translateX(0);} }
        @keyframes bot-dot     { 0%,100%{opacity:0.35;} 50%{opacity:1;} }
        @keyframes bot-tiltX   { from{transform:perspective(480px) rotateX(74deg) rotate(0deg);}    to{transform:perspective(480px) rotateX(74deg) rotate(360deg);}    }
        @keyframes bot-tiltY   { from{transform:perspective(480px) rotateY(66deg) rotate(0deg);}    to{transform:perspective(480px) rotateY(66deg) rotate(-360deg);}   }
        @keyframes bot-tiltXY  { from{transform:perspective(480px) rotateX(44deg) rotateY(28deg) rotate(0deg);} to{transform:perspective(480px) rotateX(44deg) rotateY(28deg) rotate(360deg);} }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"10px 20px", borderBottom:`1px solid ${border}`,
        background:surface, flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ fontFamily:FD, fontSize:20, fontWeight:700, color:text, letterSpacing:0.4 }}>
            {botName}
          </div>
          <div style={{
            display:"flex", alignItems:"center", gap:6,
            padding:"4px 11px", borderRadius:20,
            border:`1px solid ${statusColor}28`, background:`${statusColor}0a`,
          }}>
            <div style={{
              width:6, height:6, borderRadius:"50%",
              background:statusColor, boxShadow:`0 0 7px ${statusColor}`,
              animation:"bot-dot 1.6s ease-in-out infinite",
            }} />
            <span style={{ fontFamily:FM, fontSize:9, fontWeight:700, letterSpacing:2, color:statusColor }}>
              {botStatus}
            </span>
          </div>
          {profile && (
            <button onClick={() => setShowOnboarding(true)} style={{
              padding:"3px 10px", borderRadius:20, cursor:"pointer",
              border:`1px solid ${dim}20`, fontFamily:FM, fontSize:8, color:dim,
            }}>
              {profile.riskTolerance?.toUpperCase()} | {profile.accountSize}
            </button>
          )}
        </div>
        <div style={{ fontFamily:FM, fontSize:12, color:dim, letterSpacing:1 }}>{etTime}</div>
      </div>

      {/* ── NAV TABS ── */}
      <div style={{
        display:"flex", padding:"0 20px",
        borderBottom:`1px solid ${border}`, background:surface, flexShrink:0,
      }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t.toLowerCase())} style={{
            padding:"9px 18px", fontFamily:FM, fontSize:10, fontWeight:700, letterSpacing:2,
            color: tab === t.toLowerCase() ? accent : dim,
            background:"transparent", border:"none",
            borderBottom:`2px solid ${tab === t.toLowerCase() ? accent : "transparent"}`,
            cursor:"pointer", transition:"color 0.15s",
          }}>
            {t}
          </button>
        ))}
      </div>

      {/* ── TRADING TAB ── */}
      {tab === "trading" && (
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

          {/* LEFT: Signal Stream + Fills Tape */}
          <div style={{
            width:272, borderRight:`1px solid ${border}`,
            display:"flex", flexDirection:"column", flexShrink:0, background:surface,
          }}>

            {/* Stream header */}
            <div style={{ padding:"9px 14px", borderBottom:`1px solid ${border}`, flexShrink:0 }}>
              <span style={{ fontFamily:FM, fontSize:9, color:dim, letterSpacing:2 }}>STREAM</span>
            </div>

            {/* Signal entries */}
            <div ref={streamRef} style={{ flex:1, overflowY:"auto", padding:"6px 0" }}>
              {signals.map((sig, i) => (
                <div key={sig.id} style={{
                  padding:"7px 13px", borderBottom:`1px solid ${border}38`,
                  display:"flex", gap:7, alignItems:"flex-start",
                  animation: i === signals.length - 1 ? "bot-stream 0.28s ease" : "none",
                }}>
                  <SignalTag type={sig.type} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:FM, fontSize:10, color:text, lineHeight:1.45, wordBreak:"break-word" }}>
                      {sig.msg}
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
                      <span style={{ fontFamily:FM, fontSize:8, color:dim }}>{sig.time}</span>
                      {sig.score != null && (
                        <span style={{ fontFamily:FM, fontSize:8, fontWeight:700, color:convColor(sig.score) }}>
                          {sig.score}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tape: Live Fills */}
            <div style={{ borderTop:`1px solid ${border}`, flexShrink:0 }}>
              <div style={{ padding:"8px 14px", borderBottom:`1px solid ${border}` }}>
                <span style={{ fontFamily:FM, fontSize:9, color:dim, letterSpacing:2 }}>TAPE · LIVE FILLS</span>
              </div>
              <div style={{ padding:"8px", maxHeight:236, overflowY:"auto" }}>
                {fills.map(f => <FillCard key={f.id} fill={f} accent={accent} />)}
              </div>
            </div>
          </div>

          {/* CENTER: Orb + P&L + Stats + Conviction */}
          <div style={{
            flex:1, display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center",
            gap:16, position:"relative", overflow:"hidden",
          }}>

            {/* Subtle background grid */}
            <div style={{
              position:"absolute", inset:0, pointerEvents:"none",
              backgroundImage:`linear-gradient(${border}20 1px,transparent 1px),linear-gradient(90deg,${border}20 1px,transparent 1px)`,
              backgroundSize:"46px 46px", opacity:0.5,
            }} />

            {/* The orb */}
            <BotOrb score={score} accent={accent} />

            {/* Session P&L */}
            <div style={{ textAlign:"center", position:"relative", zIndex:1 }}>
              <div style={{ fontFamily:FM, fontSize:9, color:dim, letterSpacing:3, marginBottom:7 }}>
                SESSION P&L
              </div>
              <div style={{
                fontFamily:FM, fontSize:56, fontWeight:900, lineHeight:1,
                color: sessionPnL >= 0 ? "#00ff88" : "#ff4d6d",
                animation:"bot-pnl 3s ease-in-out infinite",
                letterSpacing:-1,
              }}>
                {sessionPnL >= 0 ? "+" : ""}${sessionPnL.toLocaleString()}
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display:"flex", gap:40, position:"relative", zIndex:1 }}>
              <Stat label="TRADES"   value={String(closed)}         accent={accent} />
              <Stat label="WIN RATE" value={wr > 0 ? `${wr}%` : "—"} accent={accent} />
              <Stat label="OPEN"     value={String(open)}           accent={accent} />
            </div>

            {/* Conviction bar */}
            <div style={{ position:"relative", zIndex:1 }}>
              <ConvictionBar score={score} border={border} surface={surface} />
            </div>

            {/* Webull badge placeholder */}
            <div style={{
              position:"absolute", bottom:14, right:18,
              fontFamily:FM, fontSize:8, color:dim, letterSpacing:1,
              opacity:0.4,
            }}>
              ◈ BROKER: WEBULL (CONNECT IN V.7)
            </div>
          </div>
        </div>
      )}

      {/* ── PLACEHOLDER TABS ── */}
      {tab === "strategies" && <ComingSoon tab="strategies" dim={dim} />}
      {tab === "analytics"  && <ComingSoon tab="analytics"  dim={dim} />}
      {tab === "studio"     && <ComingSoon tab="studio"     dim={dim} />}

    </div>
  );
}
