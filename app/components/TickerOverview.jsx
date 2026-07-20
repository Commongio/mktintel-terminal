"use client";
// TickerOverview.jsx — V12: dedicated per-ticker overview page.
//
// Reached by clicking a watchlist ticker. Deliberately a TALL, SCROLLING page —
// sections stack vertically and you scroll to reveal more, rather than cramming
// everything into one fixed viewport (explicit user requirement). Reuses the
// terminal's own building blocks: LightweightChart, /api/technicals, /api/news,
// the signals table, and the shared AI chat (messages/send passed in).
import { useState, useEffect, useCallback, useRef, Component } from "react";
import LightweightChart from "./LightweightChart";
import TickerLogo from "./TickerLogo";
import { getSupabase, supabaseConfigured } from "../../lib/supabase";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

// ROBUSTNESS FIRST (V12 priority): each section is isolated so if one throws —
// most likely the embedded chart on a bad symbol/data — it shows a small fallback
// instead of blanking the entire overview page. The page stays up no matter what.
class SectionBoundary extends Component {
  constructor(p) { super(p); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err) { try { console.warn(`[overview] section "${this.props.label}" failed:`, err?.message); } catch {} }
  render() {
    if (this.state.failed) {
      return (
        <div style={{ padding: 12, borderRadius: 10, border: "1px solid #1A2535", background: "#0A1018", fontFamily: FM, fontSize: 9, color: "#9DB4CC" }}>
          {this.props.label} unavailable right now.
        </div>
      );
    }
    return this.props.children;
  }
}

function Section({ title, T, accent, children, note }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, letterSpacing: 2, color: accent }}>{title}</span>
        {note && <span style={{ fontFamily: FM, fontSize: 7.5, color: T?.dim }}>{note}</span>}
      </div>
      <SectionBoundary label={title}>{children}</SectionBoundary>
    </div>
  );
}

// Same interval vocabulary as the main Chart page (our codes for /api/candles).
const OV_INTERVALS = [["1min","1m"],["5min","5m"],["15min","15m"],["1h","1H"],["4h","4H"],["1d","1D"],["1w","1W"],["1mo","1M"]];

// Static sector-peer map (no paid API). Falls back to none if a ticker isn't listed.
const SECTOR_PEERS = {
  META:["GOOGL","SNAP","PINS","RDDT"], GOOGL:["META","MSFT","AMZN"], AAPL:["MSFT","GOOGL","AMZN"],
  MSFT:["GOOGL","AAPL","ORCL"], AMZN:["GOOGL","MSFT","WMT"], NVDA:["AMD","AVGO","TSM","INTC"],
  AMD:["NVDA","INTC","AVGO"], AVGO:["NVDA","AMD","QCOM"], INTC:["AMD","NVDA","MU"],
  TSLA:["RIVN","LCID","NIO","F"], RIVN:["TSLA","LCID","NIO"], NFLX:["DIS","WBD","PARA"],
  JPM:["BAC","WFC","GS","MS"], BAC:["JPM","WFC","C"], GS:["MS","JPM","BAC"],
  SPY:["QQQ","DIA","IWM"], QQQ:["SPY","XLK","IWM"], COIN:["MSTR","HOOD","RIOT"],
  MSTR:["COIN","RIOT","MARA"], PLTR:["SNOW","CRWD","NET"], UNH:["CVS","CI","HUM"],
  XOM:["CVX","COP","OXY"], CVX:["XOM","COP","OXY"], DIS:["NFLX","WBD","CMCSA"],
};
const peersFor = (s) => SECTOR_PEERS[String(s || "").toUpperCase()] || [];

const fmtBig = (n) => {
  if (n == null) return "—";
  if (n >= 1e12) return "$" + (n / 1e12).toFixed(2) + "T";
  if (n >= 1e9)  return "$" + (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6)  return "$" + (n / 1e6).toFixed(1) + "M";
  return "$" + n;
};
const fmtVol = (n) => {
  if (n == null) return "—";
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
};

export default function TickerOverview({ symbol, T, accent, messages, input, setInput, send, loading, onBack, onSymbolChange, fontSize = 14 }) {
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#9DB4CC";
  const border = T?.border ?? "#1A2535";
  const surface = T?.surface ?? "#0A1018";

  const [quote, setQuote] = useState(null);
  const [tech, setTech] = useState(null);
  const [news, setNews] = useState([]);
  const [signals, setSignals] = useState([]);
  const [tf, setTf] = useState("1d");   // Overview chart timeframe (avoid shadowing global setInterval)
  const [symInput, setSymInput] = useState("");       // search box
  const chatEndRef = useRef(null);

  useEffect(() => { setSymInput(""); }, [symbol]);
  const submitSearch = () => { const s = symInput.trim().toUpperCase(); if (s && onSymbolChange) onSymbolChange(s); };

  // ── data loads (all scoped to THIS ticker) ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const r = await fetch(`/api/yf-quotes?symbols=${symbol}`); const d = await r.json(); if (!cancelled) setQuote((d.data || [])[0] || null); } catch {}
      try { const r = await fetch(`/api/technicals?symbol=${symbol}`); const d = await r.json(); if (!cancelled) setTech(d); } catch {}
      try { const r = await fetch(`/api/news?symbol=${symbol}&limit=8`); const d = await r.json(); if (!cancelled) setNews(d.data || []); } catch {}
    })();
    return () => { cancelled = true; };
  }, [symbol]);

  // Active signals for this ticker from the shared feed.
  useEffect(() => {
    if (!supabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabase();
        const cols = "id,symbol,interval,status,direction,conviction,plan,created_at";
        let { data, error } = await sb.from("signals").select(`${cols},state`).eq("symbol", symbol).in("state", ["active", "won"]).order("created_at", { ascending: false }).limit(10);
        if (error?.code === "42703") ({ data } = await sb.from("signals").select(cols).eq("symbol", symbol).order("created_at", { ascending: false }).limit(10));
        if (!cancelled) setSignals(data || []);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [symbol]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  const askAboutTicker = useCallback(() => {
    setInput(`Full breakdown on ${symbol}: catalyst, key levels, options play, entry/target/stop, verdict.`);
  }, [symbol, setInput]);

  const up = (quote?.changePercent ?? 0) >= 0;
  const clr = up ? "#00e676" : "#ff3d57";
  const card = { background: surface, border: `1px solid ${border}`, borderRadius: 10, padding: 12 };

  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "14px 16px 40px" }}>
      {/* ── HEADER — wraps on narrow screens so the search bar can't cover the
          ticker name. Identity + price stay on line 1 (symbol never shrinks);
          the search bar drops to its own full-width line when space is tight. ── */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px 10px", marginBottom: 16 }}>
        {/* identity + price — one group, holds the first line, symbol never cut */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "1 1 240px", minWidth: 0 }}>
          <button onClick={onBack} title="Back" style={{ flexShrink: 0, fontFamily: FM, fontSize: 11, color: dim, background: surface, border: `1px solid ${border}`, borderRadius: 7, padding: "6px 10px", cursor: "pointer" }}>← BACK</button>
          <div style={{ flexShrink: 0, display: "flex" }}><TickerLogo symbol={symbol} size={34} /></div>
          <div style={{ flexShrink: 0, minWidth: 0 }}>
            <div style={{ fontFamily: FM, fontSize: 20, fontWeight: 900, color: text, letterSpacing: 1, lineHeight: 1, whiteSpace: "nowrap" }}>{symbol}</div>
            <div style={{ fontFamily: FC, fontSize: 11, color: dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{quote?.name || quote?.shortName || ""}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right", flexShrink: 0, paddingLeft: 8 }}>
            <div style={{ fontFamily: FM, fontSize: 20, fontWeight: 800, color: text }}>{quote?.price != null ? `$${Number(quote.price).toFixed(2)}` : "—"}</div>
            {quote?.changePercent != null && (
              <div style={{ fontFamily: FM, fontSize: 12, fontWeight: 800, color: clr }}>{up ? "▲" : "▼"} {Math.abs(quote.changePercent).toFixed(2)}%</div>
            )}
          </div>
        </div>
        {/* Search — pull up ANY ticker. Wraps to its own line under the identity. */}
        <div style={{ flex: "1 1 200px", display: "flex", alignItems: "center", gap: 6, background: surface, border: `1px solid ${border}`, borderRadius: 8, padding: "5px 8px" }}>
          <span style={{ fontSize: 11, color: dim, flexShrink: 0 }}>⌕</span>
          <input value={symInput} onChange={(e) => setSymInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === "Enter") submitSearch(); }}
            placeholder="Search any ticker…" spellCheck={false}
            style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", color: text, fontFamily: FM, fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }} />
          <button onClick={submitSearch} style={{ flexShrink: 0, fontFamily: FM, fontSize: 10, fontWeight: 800, color: accent, background: `${accent}14`, border: `1px solid ${accent}30`, borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>GO</button>
        </div>
      </div>

      {/* ── CHART — taller, with timeframe switching (same ladder as Chart page) ── */}
      <Section title="CHART" T={T} accent={accent}>
        <div style={{ ...card, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: 3, padding: "7px 9px", borderBottom: `1px solid ${border}`, overflowX: "auto" }}>
            {OV_INTERVALS.map(([code, label]) => (
              <button key={code} onClick={() => setTf(code)}
                style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, padding: "4px 8px", borderRadius: 5, cursor: "pointer", flexShrink: 0,
                  color: tf === code ? accent : dim, background: tf === code ? `${accent}14` : "transparent",
                  border: `1px solid ${tf === code ? `${accent}30` : border}` }}>{label}</button>
            ))}
          </div>
          <div style={{ height: 460 }}>
            <LightweightChart symbol={symbol} interval={tf} T={T} accent={accent} annotations={[]} />
          </div>
        </div>
      </Section>

      {/* ── TECHNICALS — expanded (RSI/MACD + EMA stack, Bollinger, ATR, StochRSI, VWAP, RelVol) ── */}
      <Section title="TECHNICALS" T={T} accent={accent} note={tech?.source ? `via ${tech.source}` : ""}>
        <div style={{ ...card, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: "14px 18px" }}>
          <Stat label="RSI (14)" value={fmt(tech?.rsi, 1)} T={T}
            color={tech?.rsi == null ? dim : tech.rsi >= 70 ? "#ff3d57" : tech.rsi <= 30 ? "#00e676" : text} />
          <Stat label="STOCH RSI" value={fmt(tech?.stochRsi, 0)} T={T}
            color={tech?.stochRsi == null ? dim : tech.stochRsi >= 80 ? "#ff3d57" : tech.stochRsi <= 20 ? "#00e676" : text} />
          <Stat label="MACD HIST" value={fmt(tech?.macd?.hist, 3)} T={T}
            color={tech?.macd ? (tech.macd.hist >= 0 ? "#00e676" : "#ff3d57") : dim} />
          <Stat label="EMA 20" value={fmt(tech?.ema?.e20)} T={T} color={emaColor(tech?.price, tech?.ema?.e20, text, dim)} />
          <Stat label="EMA 50" value={fmt(tech?.ema?.e50)} T={T} color={emaColor(tech?.price, tech?.ema?.e50, text, dim)} />
          <Stat label="EMA 200" value={fmt(tech?.ema?.e200)} T={T} color={emaColor(tech?.price, tech?.ema?.e200, text, dim)} />
          <Stat label="BOLL %B" value={tech?.bollinger?.pctB != null ? tech.bollinger.pctB + "%" : "—"} T={T}
            color={tech?.bollinger?.pctB == null ? dim : tech.bollinger.pctB >= 100 ? "#ff3d57" : tech.bollinger.pctB <= 0 ? "#00e676" : text} />
          <Stat label="ATR (14)" value={fmt(tech?.atr)} T={T} color={text} />
          <Stat label="VWAP 20d" value={fmt(tech?.vwap)} T={T} color={emaColor(tech?.price, tech?.vwap, text, dim)} />
          <Stat label="REL VOL" value={tech?.relVolume != null ? tech.relVolume.toFixed(2) + "×" : "—"} T={T}
            color={tech?.relVolume == null ? dim : tech.relVolume >= 1.5 ? "#f7c948" : text} />
        </div>
      </Section>

      {/* ── KEY STATS + FUNDAMENTALS (half-width row) ── */}
      <Row>
        <Section title="KEY STATS" T={T} accent={accent}>
          <div style={{ ...card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
            <KV label="52-WK RANGE" value={quote?.week52Low != null && quote?.week52High != null ? `$${Number(quote.week52Low).toFixed(0)}–$${Number(quote.week52High).toFixed(0)}` : "—"} T={T} text={text} />
            <KV label="DAY RANGE" value={quote?.low != null && quote?.high != null ? `$${Number(quote.low).toFixed(2)}–$${Number(quote.high).toFixed(2)}` : "—"} T={T} text={text} />
            <KV label="PREV CLOSE" value={quote?.prevClose != null ? `$${Number(quote.prevClose).toFixed(2)}` : "—"} T={T} text={text} />
            <KV label="OPEN" value={quote?.open != null ? `$${Number(quote.open).toFixed(2)}` : "—"} T={T} text={text} />
            <KV label="VOLUME" value={fmtVol(quote?.volume)} T={T} text={text} />
            <KV label="AVG VOL" value={fmtVol(quote?.avgVolume ?? tech?.keyStats?.avgVolume)} T={T} text={text} />
          </div>
        </Section>
        <Section title="FUNDAMENTALS" T={T} accent={accent}>
          <div style={{ ...card, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 16px" }}>
            <KV label="MARKET CAP" value={fmtBig(quote?.marketCap)} T={T} text={text} />
            <KV label="P/E (TTM)" value={quote?.peRatio != null ? Number(quote.peRatio).toFixed(1) : "—"} T={T} text={text} />
            <KV label="EPS (TTM)" value={quote?.eps != null ? `$${Number(quote.eps).toFixed(2)}` : "—"} T={T} text={text} />
            <KV label="RANGE (6MO)" value={tech?.keyStats ? `$${tech.keyStats.rangeLow}–$${tech.keyStats.rangeHigh}` : "—"} T={T} text={text} />
            <div style={{ gridColumn: "1 / -1", fontFamily: FM, fontSize: 7, color: dim, opacity: 0.7 }}>
              Fundamentals via Yahoo quote — some fields may be blank for ETFs/futures.
            </div>
          </div>
        </Section>
      </Row>

      {/* ── ACTIVE SIGNALS + NEWS & CATALYSTS (half-width row) ── */}
      <Row>
        <Section title="ACTIVE SIGNALS" T={T} accent={accent}>
          <div style={{ ...card, minHeight: 90 }}>
            {signals.length === 0 ? (
              <div style={{ fontFamily: FC, fontSize: 11, color: dim }}>No active engine signals for {symbol} right now.</div>
            ) : signals.map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: `1px solid ${border}55` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, color: s.direction === "LONG" ? "#00e676" : s.direction === "SHORT" ? "#ff3d57" : dim }}>{s.direction} {s.interval}</span>
                  {s.state === "won" && <span style={{ fontFamily: FM, fontSize: 7.5, fontWeight: 800, color: "#00e676" }}>✓ WON</span>}
                </div>
                <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 800, color: accent }}>{s.conviction}%</span>
              </div>
            ))}
          </div>
        </Section>
        <Section title="NEWS & CATALYSTS" T={T} accent={accent} note="order-flow proxy">
          <div style={{ ...card, minHeight: 90 }}>
            {news.length === 0 ? (
              <div style={{ fontFamily: FC, fontSize: 11, color: dim }}>No recent headlines for {symbol}.</div>
            ) : news.slice(0, 6).map((n, i) => {
              const sc = n.impact?.score;
              const scClr = sc == null ? dim : sc >= 70 ? "#ff3d57" : sc >= 45 ? "#f7c948" : dim;
              return (
                <a key={n.id || i} href={n.url || undefined} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", padding: "7px 0", borderBottom: `1px solid ${border}55`, textDecoration: "none" }}>
                  <div style={{ fontFamily: FC, fontSize: 11, color: text, lineHeight: 1.4 }}>{n.headline}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 3 }}>
                    <span style={{ fontFamily: FM, fontSize: 8, color: dim }}>{n.source || ""}</span>
                    {sc != null && <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 800, color: scClr }}>IMPACT {sc}{n.impact?.label ? ` · ${n.impact.label}` : ""}</span>}
                  </div>
                </a>
              );
            })}
            <div style={{ fontFamily: FM, fontSize: 7, color: dim, marginTop: 8, opacity: 0.7 }}>
              True dark-pool / options-sweep flow needs a paid real-time feed.
            </div>
          </div>
        </Section>
      </Row>

      {/* ── SECTOR PEERS (clickable → that ticker's overview) ── */}
      <Section title="SECTOR PEERS" T={T} accent={accent}>
        <div style={{ ...card, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {peersFor(symbol).length === 0 ? (
            <div style={{ fontFamily: FC, fontSize: 11, color: dim }}>No peer map for {symbol} yet.</div>
          ) : peersFor(symbol).map((p) => (
            <button key={p} onClick={() => onSymbolChange?.(p)}
              style={{ fontFamily: FM, fontSize: 11, fontWeight: 800, color: text, background: surface, border: `1px solid ${border}`, borderRadius: 7, padding: "6px 12px", cursor: "pointer" }}>
              {p}
            </button>
          ))}
        </div>
      </Section>

      {/* ── EMBEDDED AI CHAT ── */}
      <Section title="ASK THE DESK" T={T} accent={accent}>
        <div style={{ ...card, display: "flex", flexDirection: "column", height: 300, padding: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            {messages.slice(-14).map((m, i) => {
              const u = m.role === "user";
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: u ? "flex-end" : "flex-start", marginBottom: 6 }}>
                  <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: u ? dim : accent, marginBottom: 3 }}>{u ? "YOU ◈" : "◈ DESK"}</span>
                  <div style={{ maxWidth: "91%", background: u ? `${accent}10` : "rgba(127,127,127,0.06)", border: `1px solid ${u ? `${accent}28` : border}`, borderRadius: u ? "12px 12px 3px 12px" : "3px 12px 12px 12px", padding: "9px 13px" }}>
                    <p style={{ color: text, fontSize: fontSize || 13, lineHeight: 1.5, margin: 0, fontFamily: FC, whiteSpace: "pre-wrap" }}>{(m.content || "").replace(/\n{3,}/g, "\n\n")}</p>
                  </div>
                </div>
              );
            })}
            {loading && <div style={{ fontFamily: FM, fontSize: 9, color: dim, padding: 6 }}>Kronos analyzing…</div>}
            <div ref={chatEndRef} />
          </div>
          <div style={{ borderTop: `1px solid ${border}`, padding: 8, display: "flex", gap: 6, flexShrink: 0 }}>
            <button onClick={askAboutTicker} title={`Prefill a breakdown request for ${symbol}`}
              style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: accent, background: `${accent}12`, border: `1px solid ${accent}30`, borderRadius: 7, padding: "0 10px", cursor: "pointer", flexShrink: 0 }}>⚡ {symbol}</button>
            <textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder={`Ask about ${symbol}…`} rows={1}
              style={{ flex: 1, background: "#05080f", border: `1px solid ${border}`, borderRadius: 7, color: text, fontFamily: FC, fontSize: 12, padding: "8px 10px", resize: "none", outline: "none" }} />
            <button onClick={send} disabled={loading}
              style={{ fontFamily: FM, fontSize: 11, fontWeight: 800, color: accent, background: `${accent}12`, border: `1px solid ${accent}30`, borderRadius: 7, padding: "0 12px", cursor: loading ? "default" : "pointer" }}>▸</button>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Stat({ label, value, color, T }) {
  return (
    <div>
      <div style={{ fontFamily: FM, fontSize: 7.5, color: T?.dim, letterSpacing: 1, marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: FM, fontSize: 15, fontWeight: 800, color, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// A compact key/value pair for the Key Stats + Fundamentals grids.
function KV({ label, value, T, text }) {
  return (
    <div>
      <div style={{ fontFamily: FM, fontSize: 7, color: T?.dim, letterSpacing: 1, marginBottom: 2 }}>{label}</div>
      <div style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, color: text, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// Two sections side-by-side on desktop; they wrap to stacked on narrow screens.
function Row({ children }) {
  return <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "stretch" }}>
    {[].concat(children).map((c, i) => <div key={i} style={{ flex: "1 1 300px", minWidth: 0 }}>{c}</div>)}
  </div>;
}

const fmt = (v, p = 2) => (v == null || Number.isNaN(v) ? "—" : Number(v).toFixed(p));
const emaColor = (price, ema, text, dim) => (ema == null || price == null ? dim : price >= ema ? "#00e676" : "#ff3d57");
