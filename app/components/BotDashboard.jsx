"use client";
import { useState, useEffect, useRef } from "react";
import { KronosOnboarding } from "./KronosOnboarding";
import BrokerConnect from "./BrokerConnect";

// ─── TYPOGRAPHY ─────────────────────────────────────────────────────────────────
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

// ─── MOCK DATA (replaced by broker feed once connected) ───────────────────────
const INIT_SIGNALS = [
  { id:1, type:"SES",  msg:"Session: NY_AM → SCANNING | NQ: 21,498.50",         time:"09:30:00", score:null },
  { id:2, type:"SIGN", msg:"Signal COOLDOWN — LONG 120s remaining | score 78",   time:"09:31:22", score:78   },
  { id:3, type:"SIGN", msg:"Signal #657: LONG @ 21,510 | Score 74",              time:"09:32:45", score:74   },
  { id:4, type:"BROK", msg:"[WinLock] Bracket blocked — win lock active",         time:"09:33:10", score:null },
  { id:5, type:"SIGN", msg:"Signal FIRE: #658 | LONG NQ x1 @ 21,540 | stop...", time:"09:34:02", score:82   },
  { id:6, type:"SIGN", msg:"Signal COOLDOWN — LONG 237s remaining | score 79",   time:"09:35:17", score:79   },
];

const INIT_FILLS = [
  { id:1, dir:"LONG",  inst:"NQ",  status:"CLOSED", result:"WIN",  pnl:"+$748", pnlNum: 748,  score:82, day:1 },
  { id:2, dir:"LONG",  inst:"NQ",  status:"CLOSED", result:"WIN",  pnl:"+$487", pnlNum: 487,  score:74, day:2 },
  { id:3, dir:"SHORT", inst:"MNQ", status:"CLOSED", result:"LOSS", pnl:"-$125", pnlNum: -125, score:55, day:3 },
  { id:4, dir:"LONG",  inst:"NQ",  status:"CLOSED", result:"WIN",  pnl:"+$310", pnlNum: 310,  score:71, day:4 },
  { id:5, dir:"SHORT", inst:"MNQ", status:"CLOSED", result:"LOSS", pnl:"-$90",  pnlNum: -90,  score:48, day:5 },
  { id:6, dir:"LONG",  inst:"NQ",  status:"OPEN",   result:null,   pnl:"+$125", pnlNum: 125,  score:79, day:6 },
];

const DEFAULT_STRATEGIES = [
  { id:"momentum",  name:"Momentum Breakout", desc:"Enters on volume-confirmed breakouts above key resistance.", enabled:true,  threshold:65 },
  { id:"meanrev",   name:"Mean Reversion",    desc:"Fades extreme moves back toward VWAP on oversold/overbought RSI.", enabled:false, threshold:70 },
  { id:"gapgo",     name:"Gap & Go",          desc:"Trades pre-market gaps that hold above/below open on volume.", enabled:true,  threshold:60 },
  { id:"newsflow",  name:"News Flow Reactor", desc:"Reacts to breaking catalysts cross-referenced with options flow.", enabled:false, threshold:75 },
];

// ─── ORB EXPLANATION TOOLTIP ───────────────────────────────────────────────────
function OrbTooltip({ dim, border, surface, text }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "absolute", top: 14, right: 18, zIndex: 5 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: 26, height: 26, borderRadius: "50%",
        background: surface, border: `1px solid ${border}`,
        color: dim, fontFamily: FM, fontSize: 12, fontWeight: 700,
        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      }}>?</button>
      {open && (
        <div style={{
          position: "absolute", top: 32, right: 0, width: 230,
          background: surface, border: `1px solid ${border}`, borderRadius: 10,
          padding: "12px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          <div style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: text, letterSpacing: 1, marginBottom: 8 }}>
            WHAT THE ORB MEANS
          </div>
          {[
            ["#00ff88", "Green core — high conviction (80%+), signal ready to fire"],
            ["#f7c948", "Yellow core — medium conviction (60-79%), scanning"],
            ["#ff6b35", "Orange core — caution (40-59%), needs confirmation"],
            ["#ff4d6d", "Red core — speculative (<40%) or cooldown active"],
          ].map(([c, label]) => (
            <div key={c} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: c, marginTop: 3, flexShrink: 0, boxShadow: `0 0 6px ${c}` }} />
              <span style={{ fontFamily: FC, fontSize: 10, color: dim, lineHeight: 1.4 }}>{label}</span>
            </div>
          ))}
          <div style={{ fontFamily: FC, fontSize: 9, color: dim, lineHeight: 1.4, marginTop: 6, opacity: 0.7 }}>
            Pulse speed reflects how often signals are firing. Ring rotation reflects market volatility.
          </div>
        </div>
      )}
    </div>
  );
}

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
      {[288, 272, 256].map((sz, i) => (
        <div key={sz} style={{
          position: "absolute", width: sz, height: sz, borderRadius: "50%",
          border: `1px solid ${cc}${["09","13","1f"][i]}`,
          animation: `bot-pulse ${2.5 + i * 0.65}s ease-in-out infinite`,
          animationDelay: `${i * 0.22}s`,
        }} />
      ))}
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
      <div style={{ position: "absolute", width: 214, height: 214, borderRadius: "50%", border: `1px solid ${cc}16`, animation: "bot-tiltX 32s linear infinite" }} />
      <div style={{ position: "absolute", width: 204, height: 204, borderRadius: "50%", border: `1px solid ${accent}0e`, animation: "bot-tiltY 25s linear infinite" }} />
      <div style={{ position: "absolute", width: 222, height: 222, borderRadius: "50%", border: `1px solid ${cc}0b`, animation: "bot-tiltXY 40s linear infinite" }} />
      <div style={{ position: "absolute", width: 248, height: 248, borderRadius: "50%", border: "1.5px solid rgba(255,77,109,0.14)", animation: "bot-spinR 50s linear infinite" }} />
      <div style={{
        position: "absolute", width: 138, height: 138, borderRadius: "50%",
        background: `radial-gradient(circle at 38% 32%,${cc}50,${cc}18 55%,transparent 78%)`,
        animation: "bot-pulse 2.8s ease-in-out infinite",
      }} />
      <div style={{
        position: "absolute", width: 176, height: 176, borderRadius: "50%",
        background: `radial-gradient(circle,${cc}07 0%,transparent 68%)`,
        animation: "bot-pulse 3.4s ease-in-out infinite", animationDelay: "0.6s",
      }} />
      <div style={{ position: "relative", zIndex: 10, width: 70, height: 70, borderRadius: "50%", animation: "bot-pulse 2.2s ease-in-out infinite" }}>
        <div style={{ position: "absolute", inset: -18, borderRadius: "50%", background: `radial-gradient(circle,${cc}22 0%,transparent 70%)` }} />
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
    <div style={{ width: 248, padding: "13px 16px", background: surface, border: `1px solid ${border}`, borderRadius: 12 }}>
      <div style={{ fontFamily: FM, fontSize: 8, color: "#555", letterSpacing: 2, marginBottom: 9, textAlign: "center" }}>
        CURRENT SIGNAL CONVICTION
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:7 }}>
        <div style={{ flex: 1, height: 7, background: "#060910", borderRadius: 4, overflow: "hidden", border: `1px solid ${border}` }}>
          <div style={{
            height: "100%", width: `${score}%`, borderRadius: 4,
            background: `linear-gradient(90deg,${cc}70,${cc})`,
            boxShadow: `0 0 10px ${cc}55`,
            transition: "width 0.85s cubic-bezier(0.4,0,0.2,1)",
          }} />
        </div>
        <span style={{ fontFamily: FM, fontSize: 18, fontWeight: 800, color: cc, minWidth: 48, textAlign: "right" }}>{score}%</span>
      </div>
      <div style={{ textAlign: "center", fontFamily: FM, fontSize: 8, color: cc, letterSpacing: 2, fontWeight: 700 }}>{cl}</div>
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

// ─── STRATEGIES TAB ────────────────────────────────────────────────────────────
function StrategiesTab({ accent, T }) {
  const surface = T?.surface ?? "#0b1320";
  const border  = T?.border  ?? "#172030";
  const text    = T?.text    ?? "#c8d8e8";
  const dim     = T?.dim     ?? "#3a4a5a";

  const [strategies, setStrategies] = useState(DEFAULT_STRATEGIES);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("kronos_strategies");
      if (saved) setStrategies(JSON.parse(saved));
    } catch {}
  }, []);

  const update = (id, patch) => {
    setStrategies(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...patch } : s);
      localStorage.setItem("kronos_strategies", JSON.stringify(next));
      return next;
    });
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      <div style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, marginBottom: 14 }}>
        ACTIVE SIGNAL STRATEGIES — toggle on/off, adjust conviction threshold required to fire
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 560 }}>
        {strategies.map(s => (
          <div key={s.id} style={{
            background: surface, border: `1px solid ${s.enabled ? accent + "30" : border}`,
            borderRadius: 12, padding: "14px 16px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div>
                <div style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, color: text }}>{s.name}</div>
                <div style={{ fontFamily: FC, fontSize: 10.5, color: dim, marginTop: 3, lineHeight: 1.4, maxWidth: 360 }}>{s.desc}</div>
              </div>
              <button onClick={() => update(s.id, { enabled: !s.enabled })} style={{
                width: 38, height: 21, borderRadius: 12, flexShrink: 0,
                background: s.enabled ? `${accent}30` : border,
                border: `1px solid ${s.enabled ? accent : border}`,
                position: "relative", cursor: "pointer",
              }}>
                <div style={{
                  width: 15, height: 15, borderRadius: "50%",
                  background: s.enabled ? accent : dim,
                  position: "absolute", top: 2, left: s.enabled ? 19 : 2,
                  transition: "left 0.18s",
                }} />
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1, width: 110 }}>MIN CONVICTION</span>
              <input
                type="range" min={40} max={95} value={s.threshold}
                onChange={e => update(s.id, { threshold: Number(e.target.value) })}
                style={{ flex: 1, accentColor: accent }}
              />
              <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, color: accent, minWidth: 36, textAlign: "right" }}>{s.threshold}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ANALYTICS TAB ─────────────────────────────────────────────────────────────
function AnalyticsTab({ accent, T, fills }) {
  const surface = T?.surface ?? "#0b1320";
  const border  = T?.border  ?? "#172030";
  const text    = T?.text    ?? "#c8d8e8";
  const dim     = T?.dim     ?? "#3a4a5a";

  const closed = fills.filter(f => f.result !== null);
  const wins   = closed.filter(f => f.result === "WIN").length;
  const wr     = closed.length > 0 ? Math.round((wins / closed.length) * 100) : 0;
  const totalPnl = fills.reduce((s, f) => s + (f.pnlNum || 0), 0);

  let running = 0;
  const curve = fills.map(f => { running += f.pnlNum || 0; return running; });
  const maxVal = Math.max(...curve, 1);
  const minVal = Math.min(...curve, 0);
  const range  = maxVal - minVal || 1;
  const W = 480, H = 140, PAD = 10;
  const points = curve.map((v, i) => {
    const x = PAD + (i / Math.max(curve.length - 1, 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - minVal) / range) * (H - PAD * 2);
    return `${x},${y}`;
  }).join(" ");

  let peak = -Infinity, maxDD = 0;
  curve.forEach(v => { peak = Math.max(peak, v); maxDD = Math.min(maxDD, v - peak); });

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      <div style={{ display: "flex", gap: 30, marginBottom: 24, flexWrap: "wrap" }}>
        <Stat label="WIN RATE" value={`${wr}%`} accent={accent} />
        <Stat label="TOTAL P&L" value={`${totalPnl >= 0 ? "+" : ""}$${totalPnl}`} accent={totalPnl >= 0 ? "#00ff88" : "#ff4d6d"} />
        <Stat label="MAX DRAWDOWN" value={`$${maxDD}`} accent="#ff4d6d" />
        <Stat label="TOTAL TRADES" value={String(fills.length)} accent={accent} />
      </div>

      <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: 16, marginBottom: 16, maxWidth: 520 }}>
        <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginBottom: 10 }}>EQUITY CURVE</div>
        <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <line x1={PAD} y1={H - PAD - ((0 - minVal) / range) * (H - PAD*2)} x2={W - PAD} y2={H - PAD - ((0 - minVal) / range) * (H - PAD*2)}
            stroke={border} strokeWidth="1" strokeDasharray="3,3" />
          <polyline points={points} fill="none" stroke={totalPnl >= 0 ? "#00ff88" : "#ff4d6d"} strokeWidth="2" />
          {curve.map((v, i) => {
            const x = PAD + (i / Math.max(curve.length - 1, 1)) * (W - PAD * 2);
            const y = H - PAD - ((v - minVal) / range) * (H - PAD * 2);
            return <circle key={i} cx={x} cy={y} r="3" fill={totalPnl >= 0 ? "#00ff88" : "#ff4d6d"} />;
          })}
        </svg>
      </div>

      <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: 16, maxWidth: 520 }}>
        <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginBottom: 10 }}>TRADE-BY-TRADE P&L</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
          {fills.map((f, i) => {
            const h = Math.max(6, (Math.abs(f.pnlNum || 0) / Math.max(...fills.map(x => Math.abs(x.pnlNum||0)), 1)) * 70);
            const win = (f.pnlNum || 0) >= 0;
            return (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", height: h, background: win ? "#00ff8850" : "#ff4d6d50", border: `1px solid ${win ? "#00ff8880" : "#ff4d6d80"}`, borderRadius: 3 }} />
                <span style={{ fontFamily: FM, fontSize: 7, color: dim }}>T{i+1}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── STUDIO TAB ────────────────────────────────────────────────────────────────
function StudioTab({ accent, T, profile, onEditProfile, onOpenBroker, brokerData }) {
  const surface = T?.surface ?? "#0b1320";
  const border  = T?.border  ?? "#172030";
  const text    = T?.text    ?? "#c8d8e8";
  const dim     = T?.dim     ?? "#3a4a5a";

  const [maxLoss, setMaxLoss] = useState(profile?.maxLoss || "500");
  const [maxPositions, setMaxPositions] = useState(3);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("kronos_studio_config");
      if (saved) {
        const c = JSON.parse(saved);
        setMaxLoss(c.maxLoss ?? maxLoss);
        setMaxPositions(c.maxPositions ?? 3);
      }
    } catch {}
    // eslint-disable-next-line
  }, []);

  const saveConfig = (patch) => {
    const next = { maxLoss, maxPositions, ...patch };
    setMaxLoss(next.maxLoss);
    setMaxPositions(next.maxPositions);
    localStorage.setItem("kronos_studio_config", JSON.stringify(next));
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 460 }}>

        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, marginBottom: 10 }}>BROKER CONNECTION</div>
          {brokerData ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: FM, fontSize: 11, color: "#00ff88", fontWeight: 700 }}>
                ◈ {brokerData.broker?.toUpperCase()} CONNECTED
              </span>
              <button onClick={onOpenBroker} style={{ fontFamily: FM, fontSize: 9, color: accent, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                View / Manage
              </button>
            </div>
          ) : (
            <button onClick={onOpenBroker} style={{
              width: "100%", padding: "10px 0", fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 2,
              color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8, cursor: "pointer",
            }}>
              + CONNECT BROKER ACCOUNT
            </button>
          )}
        </div>

        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, marginBottom: 10 }}>RISK PROFILE</div>
          {profile ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: FM, fontSize: 11, color: text }}>
                {profile.riskTolerance} · {profile.experience} · {profile.accountSize}
              </div>
              <button onClick={onEditProfile} style={{ fontFamily: FM, fontSize: 9, color: accent, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                Edit
              </button>
            </div>
          ) : (
            <button onClick={onEditProfile} style={{
              width: "100%", padding: "10px 0", fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 2,
              color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8, cursor: "pointer",
            }}>
              SET UP RISK PROFILE
            </button>
          )}
        </div>

        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, marginBottom: 12 }}>RISK LIMITS</div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: FM, fontSize: 9, color: dim }}>MAX DAILY LOSS</span>
              <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, color: accent }}>${maxLoss}</span>
            </div>
            <input
              type="range" min={50} max={5000} step={50} value={maxLoss}
              onChange={e => saveConfig({ maxLoss: e.target.value })}
              style={{ width: "100%", accentColor: accent }}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: FM, fontSize: 9, color: dim }}>MAX OPEN POSITIONS</span>
              <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, color: accent }}>{maxPositions}</span>
            </div>
            <input
              type="range" min={1} max={10} value={maxPositions}
              onChange={e => saveConfig({ maxPositions: Number(e.target.value) })}
              style={{ width: "100%", accentColor: accent }}
            />
          </div>
        </div>

        <div style={{ fontFamily: FM, fontSize: 8, color: dim, lineHeight: 1.6, padding: "0 4px" }}>
          These limits feed directly into the Kronos executor prompt — signals exceeding your daily loss or position limits will be held instead of fired.
        </div>
      </div>
    </div>
  );
}

// ─── MAIN BOT DASHBOARD ────────────────────────────────────────────────────────
export default function BotDashboard({ accent = "#00d4aa", T, botName = "KRONOS" }) {

  const [tab,       setTab]       = useState("trading");
  const [signals,   setSignals]   = useState(INIT_SIGNALS);
  const [fills]                   = useState(INIT_FILLS);
  const [botStatus, setBotStatus] = useState("SCANNING");
  const [etTime,    setEtTime]    = useState("--:--:-- ET");
  const [score,     setScore]     = useState(78);
  const [profile,        setProfile]        = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showBroker,     setShowBroker]     = useState(false);
  const [brokerData,     setBrokerData]     = useState(null);
  const streamRef = useRef(null);
  const sigId     = useRef(7);

  useEffect(() => {
    const tick = () => {
      const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
      setEtTime(et.toTimeString().slice(0, 8) + " ET");
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

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
    try {
      const b = localStorage.getItem("kronos_broker");
      if (b) setBrokerData(JSON.parse(b));
    } catch {}
  }, []);

  const refreshBrokerFromStorage = () => {
    try {
      const b = localStorage.getItem("kronos_broker");
      setBrokerData(b ? JSON.parse(b) : null);
    } catch { setBrokerData(null); }
  };

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
        id, type: TYPES[idx], msg: gen(newScore, price, id)[idx],
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

  const wins   = fills.filter(f => f.result === "WIN").length;
  const closed = fills.filter(f => f.result !== null).length;
  const wr     = closed > 0 ? Math.round((wins / closed) * 100) : 0;
  const open   = fills.filter(f => f.status === "OPEN").length;

  const sessionPnL = brokerData?.portfolio?.dayPnl != null
    ? Number(brokerData.portfolio.dayPnl)
    : 1235;

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
      {showBroker && (
        <BrokerConnect accent={accent} T={T} onClose={() => { setShowBroker(false); refreshBrokerFromStorage(); }} />
      )}

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

      {/* HEADER */}
      <div style={{
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"10px 20px", borderBottom:`1px solid ${border}`,
        background:surface, flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:14 }}>
          <div style={{ fontFamily:FD, fontSize:20, fontWeight:700, color:text, letterSpacing:0.4 }}>{botName}</div>
          <div style={{
            display:"flex", alignItems:"center", gap:6,
            padding:"4px 11px", borderRadius:20,
            border:`1px solid ${statusColor}28`, background:`${statusColor}0a`,
          }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:statusColor, boxShadow:`0 0 7px ${statusColor}`, animation:"bot-dot 1.6s ease-in-out infinite" }} />
            <span style={{ fontFamily:FM, fontSize:9, fontWeight:700, letterSpacing:2, color:statusColor }}>{botStatus}</span>
          </div>
          {profile && (
            <button onClick={() => setShowOnboarding(true)} style={{
              padding:"3px 10px", borderRadius:20, cursor:"pointer",
              border:`1px solid ${dim}20`, fontFamily:FM, fontSize:8, color:dim, background:"transparent",
            }}>
              {profile.riskTolerance?.toUpperCase()} | {profile.accountSize}
            </button>
          )}
          {brokerData && (
            <button onClick={() => setShowBroker(true)} style={{
              padding:"3px 10px", borderRadius:20, cursor:"pointer",
              border:"1px solid rgba(0,255,136,0.25)", fontFamily:FM, fontSize:8, color:"#00ff88", background:"rgba(0,255,136,0.06)",
            }}>
              ◈ {brokerData.broker?.toUpperCase()}
            </button>
          )}
        </div>
        <div style={{ fontFamily:FM, fontSize:12, color:dim, letterSpacing:1 }}>{etTime}</div>
      </div>

      {/* NAV TABS */}
      <div style={{ display:"flex", padding:"0 20px", borderBottom:`1px solid ${border}`, background:surface, flexShrink:0 }}>
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

      {/* TRADING TAB */}
      {tab === "trading" && (
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
          <div style={{ width:272, borderRight:`1px solid ${border}`, display:"flex", flexDirection:"column", flexShrink:0, background:surface }}>
            <div style={{ padding:"9px 14px", borderBottom:`1px solid ${border}`, flexShrink:0 }}>
              <span style={{ fontFamily:FM, fontSize:9, color:dim, letterSpacing:2 }}>STREAM</span>
            </div>
            <div ref={streamRef} style={{ flex:1, overflowY:"auto", padding:"6px 0" }}>
              {signals.map((sig, i) => (
                <div key={sig.id} style={{
                  padding:"7px 13px", borderBottom:`1px solid ${border}38`,
                  display:"flex", gap:7, alignItems:"flex-start",
                  animation: i === signals.length - 1 ? "bot-stream 0.28s ease" : "none",
                }}>
                  <SignalTag type={sig.type} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontFamily:FM, fontSize:10, color:text, lineHeight:1.45, wordBreak:"break-word" }}>{sig.msg}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", marginTop:3 }}>
                      <span style={{ fontFamily:FM, fontSize:8, color:dim }}>{sig.time}</span>
                      {sig.score != null && (
                        <span style={{ fontFamily:FM, fontSize:8, fontWeight:700, color:convColor(sig.score) }}>{sig.score}%</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop:`1px solid ${border}`, flexShrink:0 }}>
              <div style={{ padding:"8px 14px", borderBottom:`1px solid ${border}` }}>
                <span style={{ fontFamily:FM, fontSize:9, color:dim, letterSpacing:2 }}>TAPE · LIVE FILLS</span>
              </div>
              <div style={{ padding:"8px", maxHeight:236, overflowY:"auto" }}>
                {fills.map(f => <FillCard key={f.id} fill={f} accent={accent} />)}
              </div>
            </div>
          </div>

          <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, position:"relative", overflow:"hidden" }}>
            <OrbTooltip dim={dim} border={border} surface={surface} text={text} />
            <div style={{
              position:"absolute", inset:0, pointerEvents:"none",
              backgroundImage:`linear-gradient(${border}20 1px,transparent 1px),linear-gradient(90deg,${border}20 1px,transparent 1px)`,
              backgroundSize:"46px 46px", opacity:0.5,
            }} />
            <BotOrb score={score} accent={accent} />
            <div style={{ textAlign:"center", position:"relative", zIndex:1 }}>
              <div style={{ fontFamily:FM, fontSize:9, color:dim, letterSpacing:3, marginBottom:7 }}>SESSION P&L</div>
              <div style={{
                fontFamily:FM, fontSize:56, fontWeight:900, lineHeight:1,
                color: sessionPnL >= 0 ? "#00ff88" : "#ff4d6d",
                animation:"bot-pnl 3s ease-in-out infinite", letterSpacing:-1,
              }}>
                {sessionPnL >= 0 ? "+" : ""}${Number(sessionPnL).toLocaleString()}
              </div>
            </div>
            <div style={{ display:"flex", gap:40, position:"relative", zIndex:1 }}>
              <Stat label="TRADES"   value={String(closed)}         accent={accent} />
              <Stat label="WIN RATE" value={wr > 0 ? `${wr}%` : "—"} accent={accent} />
              <Stat label="OPEN"     value={String(open)}           accent={accent} />
            </div>
            <div style={{ position:"relative", zIndex:1 }}>
              <ConvictionBar score={score} border={border} surface={surface} />
            </div>
            <button onClick={() => setShowBroker(true)} style={{
              position:"absolute", bottom:14, right:18,
              fontFamily:FM, fontSize:8, color: brokerData ? "#00ff88" : dim, letterSpacing:1,
              opacity:0.7, background:"none", border:"none", cursor:"pointer",
            }}>
              ◈ {brokerData ? `${brokerData.broker?.toUpperCase()} LIVE` : "CONNECT BROKER"}
            </button>
          </div>
        </div>
      )}

      {/* STRATEGIES TAB */}
      {tab === "strategies" && <StrategiesTab accent={accent} T={T} />}

      {/* ANALYTICS TAB */}
      {tab === "analytics" && <AnalyticsTab accent={accent} T={T} fills={fills} />}

      {/* STUDIO TAB */}
      {tab === "studio" && (
        <StudioTab
          accent={accent} T={T} profile={profile}
          onEditProfile={() => setShowOnboarding(true)}
          onOpenBroker={() => setShowBroker(true)}
          brokerData={brokerData}
        />
      )}

    </div>
  );
}