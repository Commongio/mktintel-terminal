"use client";
// SignalFeed.jsx — V10 rich server-signal feed (now the Kronos left column).
// Data-dense entries: conviction bar, agent votes, full trade plan, R:R, age,
// session tag; filtered by active mode AND the user's cadence preference.
// Emits onNewSignal(sig) for orb cues (pulse / comet) and exposes a ref used
// as the comet landing target.
import { useState, useEffect, forwardRef, useRef } from "react";
import { createPortal } from "react-dom";
import { getSupabase, supabaseConfigured, getAccessToken } from "../../lib/supabase";
import { symbolTier, allowedTiers, PRIORITY_INDEX_OPTIONS } from "../../lib/universe";
import { directionLabel, directionColor } from "../../lib/signalLabels";

// V13: "prioritized but not fully prioritized" — major index options get a
// badge + sorted-to-top display treatment, but conviction itself is untouched
// (see universe.js's scanUniverse for the always-scan side of this).
const isPriorityIndex = (sym) => PRIORITY_INDEX_OPTIONS.includes(String(sym || "").toUpperCase());
import { getMarketStatus, getFuturesSessionStatus } from "./MarketStatusBadge";
import TickerLogo from "./TickerLogo";
import { makeLevel, loadAnnotations, saveAnnotations } from "../../lib/chartAnnotations";

// ── V12 lifecycle helpers ─────────────────────────────────────────────────────

// A signal that reached a terminal state feeds the Phase-1 self-learning engine
// (kronosMemory reads kronos_shadow). Lost/invalidated are the autopsy fuel;
// wins reinforce pattern memory. Deduped by signal id so a re-render can't double
// count. Outcome maps to the vocabulary kronosMemory grades on.
const OUTCOME_MAP = { won: "WIN", lost: "STOPPED", invalidated: "INVALIDATED" };
function recordOutcome(r, state) {
  const outcome = OUTCOME_MAP[state];
  if (!outcome) return;
  try {
    const arr = JSON.parse(localStorage.getItem("kronos_shadow") || "[]");
    if (arr.some((x) => x._sigId === r.id)) return; // already recorded
    arr.push({
      _sigId: r.id, symbol: r.symbol, direction: r.direction, conviction: r.conviction,
      interval: r.interval, setup: r.plan?.kind || r.status, outcome,
      entry: r.plan?.entry ?? null, movePct: null, time: Date.now(),
    });
    localStorage.setItem("kronos_shadow", JSON.stringify(arr.slice(-200)));
  } catch {}
}

// "Show Trade on Chart": prepare chart-ready data (entry/TP/SL as level lines)
// via the SAME annotation model the terminal chart uses, then ask the shell to
// open the chart. Rendering "exactly like the terminal chart" is literal here —
// it IS the terminal chart + terminal annotation system, not a separate clone.
function showTradeOnChart(r) {
  try {
    const sym = String(r.symbol || "").toUpperCase();
    if (!sym) return;
    const all = loadAnnotations().filter((a) => a.symbol !== sym); // clear old lines for this symbol
    const p = r.plan || {};
    const add = (price, kind, label) => { const lv = makeLevel({ symbol: sym, price, kind, label }); if (lv) all.push(lv); };
    add(p.entry, "entry", `ENTRY ${directionLabel(r.direction, r.asset_class)}`);
    add(p.stop, "sl", "STOP");
    add(p.t1, "tp", "TP1");
    add(p.t2, "tp", "TP2");
    saveAnnotations(all);
    window.dispatchEvent(new CustomEvent("kronos-show-chart", { detail: { symbol: sym } }));
  } catch {}
}

function getRiskProfile() {
  try { return JSON.parse(localStorage.getItem("kronos_profile") || "null"); } catch { return null; }
}

// The user's own "min conviction to fire" slider (Studio tab). The feed should
// never show weaker setups than the user themselves asked for.
function getUserMinConviction() {
  try { return Number(localStorage.getItem("kronos_min_conviction")) || 65; } catch { return 65; }
}

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

const stColor = (s) => (s === "FIRE" ? "#00e676" : s === "HOLD" ? "#f7c948" : "#7eb8f7");
const dirColor = (d) => (d === "LONG" ? "#00e676" : d === "SHORT" ? "#ff3d57" : "#9DB4CC");
const convColor = (c) => (c >= 90 ? "#00e676" : c >= 78 ? "#f7c948" : c >= 60 ? "#fb923c" : "#9DB4CC");

// Cadence buckets: interval → bucket. "daily" = intraday signals, "weekly" = swing TFs.
const INTERVAL_BUCKET = { "1min": "daily", "5min": "daily", "15min": "daily", "1h": "daily", "4h": "weekly", "1d": "weekly", "1w": "monthly", "1mo": "yearly" };
export function getCadencePref() {
  try { return JSON.parse(localStorage.getItem("kronos_cadence") || '["all"]'); } catch { return ["all"]; }
}

function ago(ts) {
  const m = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  return m < 1 ? "now" : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
}

// V10.5 lifecycle: the old 4h age cap was silently dropping good setups overnight
// and across weekends. Now we keep every STRONG signal from the current or previous
// trading day instead, so nothing worth seeing gets binned just because time passed.
// V12: mirrors MIN_SURFACE_CONVICTION in lib/signalEngine (kept as a literal so
// this client component doesn't bundle the server engine). Lowered 60 → 45 per
// the V12 spec: the user's own conviction slider is the real gate; this is just
// the hard floor so the slider can reach down to 45%.
export const MIN_FEED_CONVICTION = 45;
const isActive = (s) => s === "FIRE" || s === "HOLD";

// Start-of-day in US market time (ET) for a given date.
function etStartOfDay(d) {
  const et = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  et.setHours(0, 0, 0, 0);
  // Convert that ET midnight back to a real timestamp.
  const offset = d.getTime() - new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" })).getTime();
  return et.getTime() + offset;
}

// The cutoff: midnight ET of the PREVIOUS trading day. Weekends walk back to
// Friday, so a Saturday/Sunday viewer still sees Thursday+Friday's signals rather
// than an empty feed.
export function tradingDayCutoff(now = new Date()) {
  const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = etNow.getDay(); // 0=Sun .. 6=Sat
  // How many days back is "the previous trading day"?
  //   Mon(1) → Friday = 3 days back.  Sun(0) → Thursday = 3.  Sat(6) → Thursday = 2.
  //   Tue-Fri → yesterday = 1 day back.
  const back = day === 1 ? 3 : day === 0 ? 3 : day === 6 ? 2 : 1;
  const prev = new Date(now.getTime() - back * 86400000);
  return etStartOfDay(prev);
}

// Plain-English "why" for a signal, derived from the agents that actually voted.
// No new data — this reads the same agent output the engine already produced, so
// the explanation can never drift from the verdict.
function reasoningFor(r) {
  const agents = Array.isArray(r.agents) ? r.agents : [];
  const dirWord = r.direction === "LONG" ? "bullish" : r.direction === "SHORT" ? "bearish" : "neutral";
  const agree = agents.filter((a) => (r.direction === "LONG" && a.signal === "bullish") || (r.direction === "SHORT" && a.signal === "bearish"));
  const against = agents.filter((a) => (r.direction === "LONG" && a.signal === "bearish") || (r.direction === "SHORT" && a.signal === "bullish"));
  const lead = agree.slice().sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];

  let headline;
  if (r.status === "FIRE") {
    headline = `All gates passed. ${agree.length} of ${agents.length} agents voted ${dirWord}${lead ? `, led by ${lead.agent} at ${lead.confidence}%` : ""} — conviction ${r.conviction}% cleared the risk gate, so this is a live setup.`;
  } else if (r.status === "HOLD") {
    headline = `A ${dirWord} setup is forming but hasn't cleared the risk gate. Conviction is ${r.conviction}%${against.length ? `, and ${against.length} agent${against.length > 1 ? "s" : ""} still disagree` : ""} — watch, don't fire yet.`;
  } else {
    headline = `No tradeable edge here right now. The agents are split or flat, so the portfolio manager is standing down.`;
  }
  return { headline, agree, against, agents };
}

// Popup anchored to the LEFT of the clicked row.
// PORTALED to <body> with fixed positioning: the feed column has overflow
// hidden + overflowY auto, so an absolutely-positioned popup inside a row would
// be clipped by the scroll container. anchorRect comes from the row's rect.
function ReasoningPopup({ r, T, accent, anchorRect, onClose }) {
  const border = T?.border ?? "#1A2535";
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#9DB4CC";
  const panel = T?.panel ?? "#0A1018";
  const { headline, agents } = reasoningFor(r);
  const sc = stColor(r.status);
  const rr = r.plan?.entry != null && r.plan?.stop != null && r.plan?.t2 != null
    ? Math.abs((r.plan.t2 - r.plan.entry) / (r.plan.entry - r.plan.stop || 1)).toFixed(1)
    : null;

  if (!anchorRect || typeof document === "undefined") return null;

  const W = 300, MAXH = 460, PAD = 10;
  // Prefer the left of the row; if there's no room (collapsed/narrow window),
  // flip to the right rather than rendering off-screen.
  const flip = anchorRect.left < W + PAD * 2;
  const left = flip ? Math.min(window.innerWidth - W - PAD, anchorRect.right + PAD) : anchorRect.left - W - PAD;
  const top = Math.max(PAD, Math.min(anchorRect.top, window.innerHeight - MAXH - PAD));

  return createPortal(
    <div onClick={(e) => e.stopPropagation()} style={{
      position: "fixed", top, left, width: W, zIndex: 2000,
      background: panel, border: `1px solid ${sc}45`, borderRadius: 12,
      boxShadow: `0 12px 48px rgba(0,0,0,0.75), 0 0 30px ${sc}18`,
      padding: 13, maxHeight: MAXH, overflowY: "auto",
    }}>
      {/* little arrow pointing at the row */}
      <div style={{ position: "absolute", top: 16, [flip ? "left" : "right"]: -5, width: 9, height: 9, background: panel, borderRight: `1px solid ${sc}45`, borderTop: `1px solid ${sc}45`, transform: "rotate(45deg)" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <TickerLogo symbol={r.symbol} size={16} />
          <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 800, color: directionColor(r.direction, r.asset_class) }}>
            {r.direction !== "NEUTRAL" ? `${directionLabel(r.direction, r.asset_class)} ` : ""}{r.symbol}
          </span>
          <span style={{ fontFamily: FM, fontSize: 7.5, fontWeight: 800, color: sc, letterSpacing: 1, border: `1px solid ${sc}40`, borderRadius: 4, padding: "1px 5px" }}>{r.status}</span>
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: dim, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>✕</button>
      </div>

      {/* V13: absolute timestamp, rendered in the VIEWER's own local timezone —
          deliberately NOT the ET-locale convention used elsewhere for "market
          time" badges (spec asks for the user's local time here specifically). */}
      {r.created_at && (
        <div style={{ fontFamily: FM, fontSize: 8.5, color: dim, marginBottom: 9 }}>
          {new Date(r.created_at).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
        </div>
      )}

      {/* THE WHY */}
      <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 2, fontWeight: 700, marginBottom: 5 }}>WHY THIS SIGNAL</div>
      <div style={{ fontFamily: FC, fontSize: 11, color: text, lineHeight: 1.6, marginBottom: 11, padding: "9px 10px", background: `${sc}0b`, border: `1px solid ${sc}25`, borderRadius: 8 }}>
        {headline}
      </div>

      {/* Conviction */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
        <span style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1 }}>CONVICTION</span>
        <div style={{ flex: 1, height: 5, background: "#0c1420", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ width: `${r.conviction}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg,${convColor(r.conviction)}66,${convColor(r.conviction)})` }} />
        </div>
        <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 800, color: convColor(r.conviction) }}>{r.conviction}%</span>
      </div>

      {/* Full technicals — every agent, every reason */}
      <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>AGENT VOTES & TECHNICALS</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 11 }}>
        {agents.map((a, i) => {
          const ac = a.signal === "bullish" ? "#00e676" : a.signal === "bearish" ? "#ff3d57" : dim;
          return (
            <div key={i} style={{ padding: "7px 9px", borderRadius: 7, background: "#070d16", borderLeft: `2px solid ${ac}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 800, color: text, letterSpacing: 1 }}>{a.agent}</span>
                <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 800, color: ac }}>{String(a.signal || "").toUpperCase()} {a.confidence != null ? `${a.confidence}%` : ""}</span>
              </div>
              {(a.reasons || []).map((why, k) => (
                <div key={k} style={{ fontFamily: FC, fontSize: 9.5, color: dim, lineHeight: 1.5, paddingLeft: 8, position: "relative" }}>
                  <span style={{ position: "absolute", left: 0, color: ac }}>•</span>{why}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Trade plan */}
      {r.plan?.entry != null && (
        <>
          <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>TRADE PLAN</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, padding: "9px 10px", background: "#070d16", border: `1px solid ${border}`, borderRadius: 8 }}>
            {[["ENTRY", r.plan.entry, text], ["STOP", r.plan.stop, "#ff3d57"], ["T1", r.plan.t1, "#00e676"], ["T2", r.plan.t2, "#00e676"]].map(([l, v, c]) => (
              <div key={l}>
                <div style={{ fontFamily: FM, fontSize: 6.5, color: dim, letterSpacing: 1 }}>{l}</div>
                <div style={{ fontFamily: FM, fontSize: 10.5, fontWeight: 700, color: c }}>{Number(v).toFixed(2)}</div>
              </div>
            ))}
            {rr && (
              <div style={{ gridColumn: "1 / -1", fontFamily: FM, fontSize: 8, color: dim, paddingTop: 4, borderTop: `1px solid ${border}` }}>
                R:R ≈ {rr} · risk {Math.abs(r.plan.entry - r.plan.stop).toFixed(2)} pts{r.plan.contractGuidance ? ` · ${r.plan.contractGuidance}` : ""}
              </div>
            )}
          </div>
        </>
      )}
      {/* Show Trade on Chart — draws entry/TP/SL on the (shared) terminal chart. */}
      {r.plan?.entry != null && r.direction !== "NEUTRAL" && (
        <button
          onClick={(e) => { e.stopPropagation(); showTradeOnChart(r); onClose?.(); }}
          style={{
            width: "100%", marginTop: 10, padding: "9px 0", borderRadius: 8, cursor: "pointer",
            fontFamily: FM, fontSize: 9, fontWeight: 800, letterSpacing: 1.5,
            color: accent, background: `${accent}12`, border: `1px solid ${accent}35`,
          }}
        >⧉ SHOW TRADE ON CHART</button>
      )}
      <div style={{ fontFamily: FM, fontSize: 7, color: dim, marginTop: 10, opacity: 0.7, lineHeight: 1.5 }}>
        Probability-based analysis — not financial advice.
      </div>
    </div>,
    document.body
  );
}

function FeedRow({ r, T, accent, highlight, onDelete, isDev, onDevGrade }) {
  const border = T?.border ?? "#1A2535";
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#9DB4CC";
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const [devMenu, setDevMenu] = useState(false); // V13.6 dev deletion reason picker
  const rowRef = useRef(null);
  const sc = stColor(r.status);
  const won = r.state === "won"; // only active + won reach this component

  const toggle = () => {
    if (open) { setOpen(false); return; }
    setAnchorRect(rowRef.current?.getBoundingClientRect() || null);
    setOpen(true);
  };

  // Close on Escape, and re-anchor (or close) if the feed scrolls/resizes under us.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const reanchor = () => setAnchorRect(rowRef.current?.getBoundingClientRect() || null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", reanchor);
    window.addEventListener("scroll", reanchor, true); // capture: catches the feed's own scroll
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reanchor);
      window.removeEventListener("scroll", reanchor, true);
    };
  }, [open]);

  return (
    <div ref={rowRef} onClick={toggle} style={{
      padding: "10px 12px", borderBottom: `1px solid ${border}55`, cursor: "pointer",
      background: won ? "rgba(0,230,118,0.06)" : highlight ? `${sc}14` : "transparent",
      transition: "background 0.8s ease",
      position: "relative",
    }}>
      {/* WON badge — winners stay in the feed (spec: never hide winning trades). */}
      {won && (
        <span style={{
          position: "absolute", top: 8, right: 30, zIndex: 2,
          fontFamily: FM, fontSize: 7.5, fontWeight: 800, letterSpacing: 1.5, color: "#00e676",
          background: "rgba(0,230,118,0.12)", border: "1px solid rgba(0,230,118,0.4)",
          borderRadius: 4, padding: "2px 6px",
        }}>✓ WON</span>
      )}
      {/* Manual delete. For a normal user it's a local per-user hide. For the DEV
          account (V13.6) it's a graded outcome — a reason picker records WHY
          (stopped-out / bad R:R) so the deletion feeds the self-learning loop
          instead of vanishing. */}
      <button
        onClick={(e) => { e.stopPropagation(); if (isDev) setDevMenu((v) => !v); else onDelete?.(r); }}
        title={isDev ? "Grade & remove (feeds self-learning)" : "Delete this signal"}
        style={{
          position: "absolute", top: 6, right: 6, zIndex: 4, width: 20, height: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 5, background: "transparent", border: "none",
          color: dim, fontSize: 11, cursor: "pointer", opacity: 0.55,
        }}
      >🗑</button>
      {isDev && devMenu && (
        <div onClick={(e) => e.stopPropagation()} style={{
          position: "absolute", top: 28, right: 6, zIndex: 6, width: 168,
          background: T?.panel ?? "#0A1018", border: `1px solid ${border}`, borderRadius: 8,
          boxShadow: "0 8px 30px rgba(0,0,0,0.6)", padding: 6,
        }}>
          <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1, padding: "3px 6px 5px" }}>WHY REMOVE? (LOGS OUTCOME)</div>
          {[["stopped_out", "Stopped out", "#ff3d57"], ["bad_rr", "R:R turned negative", "#f7c948"]].map(([reason, label, c]) => (
            <button key={reason}
              onClick={() => { setDevMenu(false); onDevGrade?.(r, reason); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 8px", borderRadius: 6, background: "transparent", border: "none", color: c, fontFamily: FM, fontSize: 9.5, fontWeight: 700, cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
      )}
      {/* V13.5: the header row reserves its right edge (paddingRight) for the
          absolutely-positioned delete button + WON badge, and the age moved into
          the left cluster — previously the far-right age sat directly under the
          trash icon and was covered by it. */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5, paddingRight: won ? 60 : 22 }}>
        <div style={{ display: "flex", gap: 7, alignItems: "center", minWidth: 0 }}>
          <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 800, color: sc, letterSpacing: 1, flexShrink: 0 }}>
            {r.status === "FIRE" ? "⚡ SETUP" : r.status === "HOLD" ? "FORMING" : "NO SETUP"}
          </span>
          <TickerLogo symbol={r.symbol} size={16} />
          <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 800, color: directionColor(r.direction, r.asset_class) }}>
            {r.direction !== "NEUTRAL" ? `${directionLabel(r.direction, r.asset_class)} ` : ""}{r.symbol}
          </span>
          {isPriorityIndex(r.symbol) && (
            <span title="Major index option — always scanned every run"
              style={{ fontFamily: FM, fontSize: 6.5, fontWeight: 800, letterSpacing: 1, color: accent, background: `${accent}14`, border: `1px solid ${accent}40`, borderRadius: 4, padding: "2px 4px", flexShrink: 0 }}>
              INDEX
            </span>
          )}
          <span style={{ fontFamily: FM, fontSize: 8, color: dim, flexShrink: 0 }}>{r.interval}</span>
          <span style={{ fontFamily: FM, fontSize: 8, color: dim, flexShrink: 0 }}>· {ago(r.created_at)}</span>
        </div>
      </div>

      {/* conviction bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 4, background: "#0c1420", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${r.conviction}%`, height: "100%", borderRadius: 2, background: `linear-gradient(90deg,${convColor(r.conviction)}66,${convColor(r.conviction)})`, transition: "width 0.6s" }} />
        </div>
        <span style={{ fontFamily: FM, fontSize: 10, fontWeight: 800, color: convColor(r.conviction), minWidth: 32, textAlign: "right" }}>{r.conviction}%</span>
      </div>

      {/* Click → reasoning popup, anchored to the LEFT of this row */}
      {open && <ReasoningPopup r={r} T={T} accent={accent} anchorRect={anchorRect} onClose={() => setOpen(false)} />}
    </div>
  );
}

const SignalFeed = forwardRef(function SignalFeed({ accent = "#00d4aa", T, assetClass = "futures", onNewSignal, fill = false, vix = null, isDev = false }, ref) {
  const surface = T?.surface ?? "#0A1018";
  const border = T?.border ?? "#1A2535";
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#9DB4CC";

  const [rows, setRows] = useState([]);
  // V13.6: broad-market chop state (from /api/market-state). When choppy, the bot
  // has halted new FIRE signals server-side; we surface a professional stand-down
  // banner so the user knows WHY the feed is quiet — not a bug, a decision.
  const [chop, setChop] = useState(null);
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/market-state");
        if (r.ok && live) setChop(await r.json());
      } catch {}
    };
    poll();
    const t = setInterval(poll, 120000);
    return () => { live = false; clearInterval(t); };
  }, []);
  // V13.6: dev-only preview of the chop stand-down banner (set on /admin DEV TOOLS)
  // so it can be verified without waiting for a real whipsaw. Dismissible.
  const [devChopPreview, setDevChopPreview] = useState(false);
  useEffect(() => {
    if (!isDev) return;
    try { if (localStorage.getItem("kronos_dev_test_chop") === "1") setDevChopPreview(true); } catch {}
  }, [isDev]);
  const dismissChopPreview = () => {
    setDevChopPreview(false);
    try { localStorage.removeItem("kronos_dev_test_chop"); } catch {}
  };
  const showChopBanner = Boolean(chop?.choppy) || devChopPreview;
  // V12: user-dismissed signal ids. The `signals` table is a SHARED standardized
  // feed (one row seen by everyone), so a trash click can't hard-delete the row
  // globally — it's a per-user hide, persisted locally. This is the manual
  // override that sits on top of the automatic lifecycle.
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("kronos_dismissed") || "[]")); } catch { return new Set(); }
  });
  const dismissSignal = (r) => {
    setDismissed((prev) => {
      const next = new Set(prev); next.add(r.id);
      try { localStorage.setItem("kronos_dismissed", JSON.stringify([...next].slice(-500))); } catch {}
      return next;
    });
  };
  // V13.6: dev grades a deletion (stopped-out / bad-RR) → records a terminal state
  // on the shared row so the self-learning loop learns from it, THEN hides it
  // locally. Falls back to a plain local dismiss if the grade call fails.
  const devGrade = async (r, reason) => {
    dismissSignal(r); // hide immediately; the grade is the durable part
    try {
      const token = await getAccessToken();
      await fetch("/api/admin/signal-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id: r.id, reason }),
      });
    } catch { /* already hidden locally; grading is best-effort */ }
  };
  const [state, setState] = useState(supabaseConfigured() ? "loading" : "unconfigured");
  const [highlightId, setHighlightId] = useState(null);
  const [cadence, setCadence] = useState(getCadencePref());
  const [userMinConviction, setUserMinConviction] = useState(getUserMinConviction());
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const onNewRef = useRef(onNewSignal);
  onNewRef.current = onNewSignal;
  // The feed never shows below this, no matter what the user's slider says —
  // it's the platform-wide floor, not a personalization knob.
  const effectiveThreshold = Math.max(MIN_FEED_CONVICTION, userMinConviction);
  const thresholdRef = useRef(effectiveThreshold);
  thresholdRef.current = effectiveThreshold;

  useEffect(() => {
    const onStorage = () => setCadence(getCadencePref());
    const onConviction = () => setUserMinConviction(getUserMinConviction());
    window.addEventListener("kronos-cadence-change", onStorage);
    window.addEventListener("kronos-minconviction-change", onConviction);
    return () => {
      window.removeEventListener("kronos-cadence-change", onStorage);
      window.removeEventListener("kronos-minconviction-change", onConviction);
    };
  }, []);

  // Manual refresh — V10.5b: this now actually RE-RUNS the engine for the active
  // mode's core instruments (via /api/refresh-feed, which applies the user's own
  // conviction threshold), then re-pulls the table. Previously it only re-SELECTed
  // the table, so if the cron hadn't run you got the same stale rows back and the
  // button looked broken. The cron endpoint itself stays server-only (CRON_SECRET
  // must never reach the browser) — hence the separate, deliberately narrow route.
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await fetch("/api/refresh-feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetClass, minConviction: thresholdRef.current }),
      });
    } catch {
      // Engine re-run failed (offline/rate-limited) — still re-pull below so the
      // button does something useful rather than silently dying.
    }
    setReloadKey((k) => k + 1); // triggers the effect that re-SELECTs + clears `refreshing`
  };

  useEffect(() => {
    if (!supabaseConfigured()) return;
    const sb = getSupabase();
    let channel, cancelled = false;
    (async () => {
      const cutoff = tradingDayCutoff();
      // `source` only exists once migration 003 has been applied. Selecting a
      // column that doesn't exist makes Postgres reject the WHOLE query (42703),
      // which would black out the entire feed on any deployment where the
      // migration hasn't been run yet. So: try with it, and fall back without it.
      // Pre-migration the feed still works, it just can't tell manual signals
      // apart (they get tier-filtered like cron ones until 003 lands).
      // V12 lifecycle: prefer state-based selection with NO time deletion — show
      // active + won, hide lost + invalidated (kept in the DB for analysis). Falls
      // back to the old time-window query only if migration 006 (state) isn't run.
      const COLS = "id,asset_class,symbol,interval,status,direction,conviction,plan,agents,source,created_at";
      const stateQuery = () => sb.from("signals")
        .select(`${COLS},state,resolved_at`)
        .eq("asset_class", assetClass)
        .gte("conviction", MIN_FEED_CONVICTION)
        .in("state", ["active", "won"])                 // hide lost/invalidated; no time filter
        .order("created_at", { ascending: false })
        .limit(200);
      const legacyQuery = (withSource) => sb.from("signals")
        .select(withSource ? COLS : COLS.replace(",source", ""))
        .eq("asset_class", assetClass)
        .gte("conviction", MIN_FEED_CONVICTION)
        .gte("created_at", new Date(cutoff).toISOString()) // pre-006 keeps the 2-session window
        .order("created_at", { ascending: false })
        .limit(200);

      let { data, error } = await stateQuery();
      if (error?.code === "42703") {                    // state column not there yet
        ({ data, error } = await legacyQuery(true));
        if (error?.code === "42703") ({ data, error } = await legacyQuery(false)); // nor source
      }
      if (cancelled) return;
      if (error) { setState("error"); return; }
      // Dedupe to the newest signal per instrument (older same-instrument rows are
      // stale by definition). The DB already applied the strength/date filters.
      const seen = new Set();
      const deduped = (data || [])
        .filter((r) => { const k = `${r.symbol}|${r.interval}`; if (seen.has(k)) return false; seen.add(k); return true; });
      setRows(deduped);
      setState(deduped.length ? "live" : "empty");
      setRefreshing(false);
      channel = sb.channel("signals-feed-v12")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "signals" }, (payload) => {
          const sig = payload.new;
          if (sig?.asset_class !== assetClass) return; // strict mode isolation
          // A weak incoming signal can still supersede a shown one (setup gone),
          // but never earns a row of its own.
          const strongEnough = (sig.conviction ?? 0) >= thresholdRef.current;
          setRows((prev) => {
            const key = `${sig.symbol}|${sig.interval}`;
            // V12: a superseding signal now simply DROPS the stale row (no blur/
            // grace). The cron will mark that row 'invalidated' server-side; here
            // we optimistically remove it and record it for the learning engine.
            let next = prev;
            const superseded = prev.filter((r) =>
              `${r.symbol}|${r.interval}` === key && isActive(r.status) &&
              (sig.status === "SCAN" || sig.direction === "NEUTRAL" || sig.direction !== r.direction));
            if (superseded.length) {
              superseded.forEach((r) => recordOutcome(r, "invalidated"));
              next = prev.filter((r) => !superseded.includes(r));
            }
            if (!strongEnough) return next;
            // Replace an existing same-direction row for this instrument, else prepend.
            const has = next.some((r) => `${r.symbol}|${r.interval}` === key && r.direction === sig.direction && isActive(sig.status));
            if (isActive(sig.status)) {
              next = has
                ? next.map((r) => (`${r.symbol}|${r.interval}` === key && r.direction === sig.direction ? { ...sig } : r))
                : [sig, ...next];
            }
            return next.slice(0, 200);
          });
          setState("live");
          if (strongEnough) {
            onNewRef.current?.(sig, () => {
              setHighlightId(sig.id);
              setTimeout(() => setHighlightId(null), 2500);
            });
          }
        })
        // V12: server-side state transitions (grading). won → keep + mark; lost/
        // invalidated → remove from the main feed and feed the learning engine.
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "signals" }, (payload) => {
          const sig = payload.new;
          if (sig?.asset_class !== assetClass) return;
          setRows((prev) => {
            if (sig.state === "lost" || sig.state === "invalidated") {
              const gone = prev.find((r) => r.id === sig.id);
              if (gone) recordOutcome(gone, sig.state);
              return prev.filter((r) => r.id !== sig.id);
            }
            if (sig.state === "won") {
              recordOutcome(sig, "won");
              return prev.map((r) => (r.id === sig.id ? { ...r, state: "won", resolved_at: sig.resolved_at } : r));
            }
            return prev.map((r) => (r.id === sig.id ? { ...r, ...sig } : r));
          });
        })
        .subscribe();
    })();
    return () => { cancelled = true; if (channel) getSupabase()?.removeChannel(channel); };
  }, [assetClass, reloadKey]);

  // V12: NO time-based deletion. Signals live until a terminal state (won/lost/
  // invalidated), which is decided server-side by the cron grader and arrives via
  // the realtime UPDATE handler above. This interval only bumps a tick so the
  // relative ages ("3m ago") re-render — it no longer drops any rows.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  // V10.2: surface signals by the user's risk profile — low-risk/beginner users
  // see safer large-cap tiers only; high-risk/advanced users also see small/mid
  // cap higher-volatility setups. (Futures tiers still apply lightly.)
  const profile = getRiskProfile();
  const tiers = allowedTiers(profile, vix);
  const filtered = rows.filter((r) => {
    if (dismissed.has(r.id)) return false;                 // user trashed it (local override)
    if (r.state === "lost" || r.state === "invalidated") return false; // defensive: hide non-terminal-good
    if ((r.conviction ?? 0) < effectiveThreshold) return false;
    if (!cadence.includes("all") && !cadence.includes(INTERVAL_BUCKET[r.interval] || "daily")) return false;
    // A signal the user explicitly searched for bypasses the risk-tier filter —
    // that filter exists to gate what the engine auto-surfaces, not to hide a
    // ticker the user themselves typed in and got a real setup on.
    if (r.source === "manual") return true;
    return tiers.includes(symbolTier(r.symbol));
  }).sort((a, b) => (isPriorityIndex(b.symbol) ? 1 : 0) - (isPriorityIndex(a.symbol) ? 1 : 0)); // stable: priority indices float to top, order otherwise unchanged

  // The equity engine only scans during US market hours, so outside them the feed
  // is quiet by design — say so instead of leaving a bare "waiting" state. Futures
  // scan nearly around the clock (CME Globex), so they get their own session
  // status instead of inheriting the equity one — showing "MARKET CLOSED" here for
  // a funded-futures trader at 9PM would wrongly imply the bot stopped scanning.
  // (Recomputed on each 5s lifecycle tick above, so it stays current.)
  const market = assetClass === "futures" ? getFuturesSessionStatus() : getMarketStatus();
  const marketOpen = assetClass === "futures" ? market.label === "GLOBEX ACTIVE" : market.label === "MARKET OPEN";

  return (
    <div ref={ref} style={{
      background: surface, border: `1px solid ${border}`, borderRadius: 12, overflow: "hidden",
      display: "flex", flexDirection: "column", ...(fill ? { height: "100%", minHeight: 0 } : { marginTop: 10 }),
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 13px", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
        <div>
          <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, color: text, letterSpacing: 2 }}>SIGNAL FEED</span>
          <span style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1, marginLeft: 8 }}>
            {assetClass.toUpperCase()} · {effectiveThreshold}%+ · 2 SESSIONS · {tiers.length === 3 ? "ALL TIERS" : tiers.map((t) => t[0].toUpperCase()).join("")}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <span style={{ fontFamily: FM, fontSize: 7, color: state === "live" ? "#00e676" : dim, letterSpacing: 1 }}>
            {state === "live" ? "● LIVE" : state === "loading" ? "…" : state === "empty" ? "WAITING" : state === "unconfigured" ? "LOCAL MODE" : "OFFLINE"}
          </span>
          {state !== "unconfigured" && (
            <button onClick={refresh} disabled={refreshing}
              title="Re-run the engine on this mode's core instruments now, at your conviction threshold"
              style={{
                width: 20, height: 20, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, color: accent, background: `${accent}10`, border: `1px solid ${accent}25`,
                cursor: refreshing ? "default" : "pointer", opacity: refreshing ? 0.5 : 1,
                animation: refreshing ? "spin 0.7s linear infinite" : "none",
              }}>↻</button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {/* V13.6: market-instability stand-down. When the broad market is in
            whipsaw the bot halts new FIRE signals — this explains the quiet feed
            professionally rather than leaving the user guessing. */}
        {showChopBanner && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 9, padding: "10px 13px",
            borderBottom: `1px solid #f7c94833`, background: "#f7c9480e",
          }}>
            <span style={{ fontSize: 12, lineHeight: 1.2, flexShrink: 0 }}>⚠</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span style={{ fontFamily: FM, fontSize: 8.5, fontWeight: 800, letterSpacing: 1, color: "#f7c948" }}>
                  UNSTABLE CONDITIONS — SIGNALS ON HOLD
                </span>
                {devChopPreview && !chop?.choppy && (
                  <span style={{ fontFamily: FM, fontSize: 6.5, fontWeight: 800, letterSpacing: 1, color: dim, border: `1px solid ${dim}55`, borderRadius: 3, padding: "1px 4px" }}>DEV PREVIEW</span>
                )}
              </div>
              <div style={{ fontFamily: FC, fontSize: 10, color: dim, lineHeight: 1.45 }}>
                The broad market is choppy and directionless right now{chop?.ci != null ? ` (choppiness ${chop.ci})` : ""}. KRONOS has paused new actionable setups — these conditions whipsaw traders. It will resume firing as a clean trend re-establishes.
              </div>
              {devChopPreview && !chop?.choppy && (
                <button onClick={dismissChopPreview}
                  style={{ marginTop: 6, fontFamily: FM, fontSize: 8, fontWeight: 700, letterSpacing: 1, color: dim, background: "transparent", border: `1px solid ${border}`, borderRadius: 5, padding: "3px 8px", cursor: "pointer" }}>
                  ✕ DISMISS PREVIEW
                </button>
              )}
            </div>
          </div>
        )}
        {!marketOpen && state !== "unconfigured" && state !== "error" && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, padding: "9px 13px",
            borderBottom: `1px solid ${border}`, background: `${market.color}0c`,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: market.color, boxShadow: `0 0 7px ${market.color}`, flexShrink: 0 }} />
            <span style={{ fontFamily: FM, fontSize: 8.5, fontWeight: 800, letterSpacing: 1, color: market.color }}>{market.label}</span>
            <span style={{ fontFamily: FC, fontSize: 10, color: dim, lineHeight: 1.4 }}>
              {assetClass === "futures"
                ? (market.label === "DAILY BREAK"
                    ? "CME daily maintenance break — the engine resumes at the 6PM ET reopen."
                    : (market.sub || "Globex is closed."))
                : (market.label === "PRE-MARKET" || market.label === "AFTER-HOURS"
                    ? "Thin liquidity — the engine resumes full scanning at the 9:30 ET open."
                    : "The engine scans during US market hours. New signals resume next session.")}
            </span>
          </div>
        )}
        {state === "unconfigured" && (
          <div style={{ padding: "14px", fontFamily: FC, fontSize: 10.5, color: dim, lineHeight: 1.6 }}>
            Multi-user backend not configured — the scanner panel on the right analyzes live for you.
            Connect Supabase (SETUP_V9.md) to activate the server feed.
          </div>
        )}
        {state === "empty" && (
          <div style={{ padding: "14px", fontFamily: FC, fontSize: 10.5, color: dim, lineHeight: 1.6 }}>
            No {assetClass} setups at {effectiveThreshold}%+ conviction across the last two sessions. The engine writes new signals as setups change — nothing is
            shown here unless it's real.
          </div>
        )}
        {state === "error" && <div style={{ padding: 14, fontFamily: FM, fontSize: 9, color: "#ff3d57" }}>⚠ Could not load signal feed.</div>}
        {state === "live" && filtered.length === 0 && (
          <div style={{ padding: "14px", fontFamily: FC, fontSize: 10.5, color: dim, lineHeight: 1.6 }}>
            Signals exist but none match your cadence preference ({cadence.join(", ")}). Adjust it in
            the mode setup (⧉) or Settings.
          </div>
        )}
        {filtered.map((r) => <FeedRow key={r.id} r={r} T={T} accent={accent} highlight={highlightId === r.id} onDelete={dismissSignal} isDev={isDev} onDevGrade={devGrade} />)}
      </div>
    </div>
  );
});
export default SignalFeed;
