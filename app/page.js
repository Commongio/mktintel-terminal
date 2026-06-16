"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONFIG ─────────────────────────────────────────────────────────────────

const WATCHLIST = [
  "NVDA", "TSLA", "META", "AAPL", "AMD", "PLTR",
  "MSTR", "RKLB", "SMCI", "GME", "IONQ", "SPY", "QQQ",
];

const TICKER_TAPE_SYMBOLS = ["NVDA","TSLA","META","AAPL","AMD","PLTR","MSTR","RKLB","SMCI","GME","IONQ","SPY","QQQ"];

const SCAN_CATEGORIES = [
  { id: "all", label: "ALL" },
  { id: "whale", label: "🐋 WHALE" },
  { id: "options", label: "⚡ FLOW" },
  { id: "news", label: "📰 NEWS" },
  { id: "trump", label: "🦅 TRUMP" },
  { id: "social", label: "💬 SOCIAL" },
  { id: "sec", label: "📋 SEC" },
  { id: "hidden", label: "💎 HIDDEN" },
];

const CONVICTION_CONFIG = {
  high: { label: "🔥 HIGH", color: "#ff6b35", bg: "rgba(255,107,53,0.12)", border: "rgba(255,107,53,0.35)" },
  medium: { label: "⚡ MED", color: "#f7c948", bg: "rgba(247,201,72,0.10)", border: "rgba(247,201,72,0.30)" },
  low: { label: "👀 WATCH", color: "#7eb8f7", bg: "rgba(126,184,247,0.08)", border: "rgba(126,184,247,0.25)" },
};
const SIGNAL_COLORS = { CALL: "#00d4aa", PUT: "#ff4d6d", WATCH: "#f7c948" };
const TYPE_COLORS = { whale: "#a78bfa", options: "#00d4aa", news: "#f7c948", trump: "#ff6b35", social: "#7eb8f7", sec: "#ff6b35", hidden: "#f472b6" };

const QUICK_ACTION_GROUPS = [
  { label: "📰 NEWS & POLITICS", color: "#f7c948", actions: [
    { label: "Breaking market news now", prompt: "Give me the most important breaking market news right now using the live news context provided. What happened recently? Flag anything that could significantly move stocks today. For each mover give: catalyst, direction, specific options play with exact strike/expiry, IV rank, entry zone, target, stop." },
    { label: "Trump tweets / Truth Social", prompt: "Search Trump's most recent Truth Social posts and tweets today. Which sectors and stocks are impacted — energy, defense, crypto, pharma, manufacturing, tariffs? Rank each by conviction with specific trade setups." },
    { label: "Fed & macro events today", prompt: "Latest Fed news, economic data releases, macro events today. CPI, jobs, rate decisions, Fed speakers — what matters most and how does it affect options trades right now?" },
    { label: "Earnings reports today", prompt: "What companies reported earnings today or after-hours? Major beats or misses? Which still have good options plays, and are there sympathy plays in the same sector?" },
  ]},
  { label: "💎 STOCK DISCOVERY", color: "#a78bfa", actions: [
    { label: "Undervalued stocks right now", prompt: "Scan for genuinely undervalued stocks right now with a real catalyst Wall Street hasn't priced in yet. Large caps below fair value AND small/micro cap hidden gems. P/E context, upcoming catalyst, and options play for each." },
    { label: "Hidden gems — high potential", prompt: "Find hidden gem stocks with explosive upside: low float squeeze candidates, micro-caps with upcoming catalysts, stocks under $20 with options, biotech near FDA decisions, rumored government contracts." },
    { label: "Small cap movers to watch", prompt: "What small cap and micro cap stocks show unusual activity right now? Volume spikes, unusual options flow, social momentum, insider buying. Give 5–8 names with specific setups." },
    { label: "Best short squeeze plays", prompt: "Top short squeeze candidates right now. High short float + a catalyst = explosive move. Short %, days to cover, recent news, and how to play it with exact options strikes." },
  ]},
  { label: "🐋 WHALE & FLOW", color: "#00d4aa", actions: [
    { label: "Whale buys happening now", prompt: "Full whale and dark pool activity report for today. Biggest block trades, institutional buys, unusual options sweeps. Large caps AND small caps." },
    { label: "Unusual options flow today", prompt: "Unusual options flow right now. Biggest call and put sweeps, dark pool prints, gamma plays, 0DTE activity. Specific setups with exact strikes." },
    { label: "Insider buying this week", prompt: "Insider buying via SEC Form 4 filings this week. Which executives are buying their own stock? Size, significance, and any options plays?" },
    { label: "Dark pool prints today", prompt: "Biggest dark pool and block trade prints today. Bullish vs bearish positioning? Any small/mid cap names that haven't reacted yet?" },
  ]},
  { label: "📊 MARKET ANALYSIS", color: "#7eb8f7", actions: [
    { label: "Run full market scan today", prompt: "Complete market scan for today using the live watchlist data provided. Give me: (1) Top CALL setups ranked by conviction with exact strikes/expiries, (2) Top PUT setups, (3) Hidden gem plays, (4) Whale activity summary, (5) Sector rotation, (6) Macro risks." },
    { label: "Best options plays this week", prompt: "Best options plays for this week (1–5 day holds). Rank by conviction. Include catalyst, specific strike and expiry, entry zone, target, stop, IV rank, risk level." },
    { label: "Sector rotation happening?", prompt: "Which sectors are seeing rotation today — where is money flowing IN and OUT? Specific ETFs, top tickers, and options plays." },
    { label: "Best LEAPS right now", prompt: "Best LEAPS trades for 3–12 month holds. Specific strikes, expiry, entry zone, and thesis for each." },
  ]},
  { label: "⚡ QUICK INTEL", color: "#ff6b35", actions: [
    { label: "Pre-market movers now", prompt: "What is moving in pre-market right now and why, based on the live data provided? Top gainers/losers with catalyst. Gap and go, or fade?" },
    { label: "Crypto affecting stocks?", prompt: "Is crypto moving today and affecting stocks? MSTR, COIN, RIOT, MARA, CLSK. Any options opportunities from crypto momentum?" },
    { label: "FDA / biotech catalysts", prompt: "Biotech or pharma FDA catalysts this week? PDUFA dates, clinical trial readouts, IV rank, risk/reward." },
    { label: "Govt contracts & defense", prompt: "Recent government contract awards, DoD spending, defense sector news. Any small/mid caps the market hasn't reacted to yet?" },
  ]},
];

// ─── COMPONENTS ────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 18px" }}>
      <span style={{ color: "#00d4aa", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 2, fontWeight: 700 }}>ANALYZING</span>
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#00d4aa", animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }} />
      ))}
    </div>
  );
}

function ChatMessage({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
        {!isUser && <span style={{ color: msg.isAlertDive ? "#a78bfa" : "#00d4aa", fontSize: 10, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 2, fontWeight: 700 }}>{msg.isAlertDive ? "◆ DEEP DIVE" : "◈ ANALYST"}</span>}
        {isUser && <span style={{ color: "#3a5060", fontSize: 10, fontFamily: "'JetBrains Mono',monospace", letterSpacing: 2, fontWeight: 700 }}>YOU ◈</span>}
      </div>
      <div style={{
        maxWidth: "88%",
        background: isUser ? "rgba(0,212,170,0.08)" : msg.isAlertDive ? "rgba(167,139,250,0.07)" : "rgba(255,255,255,0.035)",
        border: isUser ? "1px solid rgba(0,212,170,0.2)" : msg.isAlertDive ? "1px solid rgba(167,139,250,0.25)" : "1px solid rgba(255,255,255,0.07)",
        borderRadius: isUser ? "14px 14px 3px 14px" : "3px 14px 14px 14px",
        padding: "14px 18px",
      }}>
        <p style={{ color: isUser ? "#d0e4f0" : "#b0c8d8", fontSize: 13, lineHeight: 1.8, margin: 0, fontFamily: "'Inter',sans-serif", whiteSpace: "pre-wrap" }}>{msg.content}</p>
      </div>
    </div>
  );
}

function QuickActions({ onAction }) {
  const [open, setOpen] = useState(null);
  return (
    <div style={{ padding: "8px 18px 10px", borderTop: "1px solid #111a25", background: "#04080f" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#2a4055", letterSpacing: 2, fontWeight: 700 }}>QUICK ACTIONS</span>
        <div style={{ flex: 1, height: 1, background: "#111a25" }} />
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: open !== null ? 8 : 0 }}>
        {QUICK_ACTION_GROUPS.map((g, gi) => (
          <button key={gi} onClick={() => setOpen(open === gi ? null : gi)}
            style={{
              fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700,
              color: open === gi ? g.color : "#2a4055",
              background: open === gi ? `${g.color}15` : "transparent",
              border: `1px solid ${open === gi ? `${g.color}40` : "#111a25"}`,
              padding: "5px 12px", borderRadius: 6, letterSpacing: 0.5,
            }}>
            {g.label}
          </button>
        ))}
      </div>
      {open !== null && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", borderTop: "1px solid #111a25", paddingTop: 8 }}>
          {QUICK_ACTION_GROUPS[open].actions.map((a, ai) => (
            <button key={ai} onClick={() => { onAction(a.prompt, a.label); setOpen(null); }}
              style={{
                fontFamily: "'JetBrains Mono',monospace", fontSize: 10,
                color: QUICK_ACTION_GROUPS[open].color,
                background: `${QUICK_ACTION_GROUPS[open].color}10`,
                border: `1px solid ${QUICK_ACTION_GROUPS[open].color}30`,
                padding: "6px 14px", borderRadius: 20, letterSpacing: 0.3,
              }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WatchlistRow({ q, onClick }) {
  if (!q || q.error) {
    return (
      <div style={{ padding: "11px 13px", borderRadius: 8, marginBottom: 8, background: "rgba(255,255,255,0.02)", border: "1px solid #111a25" }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#3a5060" }}>{q?.symbol || "—"} unavailable</span>
      </div>
    );
  }
  const up = (q.changePercent ?? 0) >= 0;
  const color = up ? "#00d4aa" : "#ff4d6d";
  return (
    <div onClick={() => onClick(q)}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 13px", borderRadius: 8, marginBottom: 8, background: "rgba(255,255,255,0.02)", border: "1px solid #111a25", cursor: "pointer", transition: "background 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.02)")}
    >
      <div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, fontSize: 14, color: "#c0d8e8", letterSpacing: 1 }}>{q.symbol}</div>
        <div style={{ fontFamily: "'Inter',sans-serif", fontSize: 10, color: "#3a5060", marginTop: 2 }}>{q.name?.slice(0, 24)}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: "#c0d8e8" }}>
          {q.price != null ? `$${q.price.toFixed(2)}` : "—"}
        </div>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 700, color }}>
          {q.changePercent != null ? `${up ? "▲" : "▼"} ${q.changePercent.toFixed(2)}%` : ""}
        </div>
      </div>
    </div>
  );
}

function NewsCard({ item, onDiveDeep }) {
  const age = item.datetime ? Math.round((Date.now() - item.datetime) / 60000) : null;
  const ageLabel = age == null ? "" : age < 1 ? "just now" : age < 60 ? `${age}m ago` : `${Math.round(age / 60)}h ago`;
  return (
    <div onClick={() => onDiveDeep(item)}
      style={{ background: "rgba(247,201,72,0.05)", border: "1px solid rgba(247,201,72,0.15)", borderLeft: "4px solid #f7c948", borderRadius: 8, padding: "12px 14px", marginBottom: 8, cursor: "pointer", transition: "all 0.15s" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(247,201,72,0.05)")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#f7c948", letterSpacing: 1, fontWeight: 700 }}>{item.source?.toUpperCase()}</span>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#2a3d50" }}>{ageLabel}</span>
      </div>
      <p style={{ color: "#c0d4e0", fontSize: 12, lineHeight: 1.5, margin: 0, fontFamily: "'Inter',sans-serif", fontWeight: 600 }}>{item.headline}</p>
    </div>
  );
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

export default function MarketTerminal() {
  const [quotes, setQuotes] = useState({});
  const [news, setNews] = useState([]);
  const [tapeQuotes, setTapeQuotes] = useState({});
  const [activeFilter, setActiveFilter] = useState("all");
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Terminal online. Live data connected via Finnhub.\n\n🔴 LEFT — Watchlist (live prices) + Market News\n🟢 CENTER — Your AI analyst, powered by Claude with live web search\n\nAsk anything, or tap Quick Actions below. Data auto-refreshes every 30s." },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [dataError, setDataError] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);

  // Fetch live quotes + news on load and every 30s
  const fetchLiveData = useCallback(async () => {
    try {
      const [quoteRes, newsRes] = await Promise.all([
        fetch(`/api/quote?symbols=${WATCHLIST.join(",")}`),
        fetch(`/api/news?limit=12`),
      ]);

      if (quoteRes.ok) {
        const qd = await quoteRes.json();
        const map = {};
        (qd.data || []).forEach((q) => { map[q.symbol] = q; });
        setQuotes(map);
        setTapeQuotes(map);
        setDataError(null);
      } else {
        const err = await quoteRes.json();
        setDataError(err.error || "Quote fetch failed");
      }

      if (newsRes.ok) {
        const nd = await newsRes.json();
        setNews(nd.data || []);
      }

      setLastUpdate(Date.now());
    } catch (e) {
      setDataError("Network error fetching live data");
    }
  }, []);

  useEffect(() => {
    fetchLiveData();
    const t = setInterval(fetchLiveData, 30000);
    return () => clearInterval(t);
  }, [fetchLiveData]);

  // Build a compact market context object to send to the AI
  const buildMarketContext = useCallback(() => {
    return {
      watchlist: Object.values(quotes).map((q) => ({
        symbol: q.symbol, price: q.price, changePercent: q.changePercent,
        high: q.high, low: q.low, name: q.name,
      })),
      news: news.slice(0, 8).map((n) => ({ headline: n.headline, source: n.source, datetime: n.datetime })),
      fetchedAt: lastUpdate,
    };
  }, [quotes, news, lastUpdate]);

  const callAPI = useCallback(async (prompt, isAlert = false, currentMessages, includeContext = true) => {
    setIsLoading(true);
    try {
      const history = (currentMessages || messages).map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          prompt,
          marketContext: includeContext ? buildMarketContext() : undefined,
        }),
      });
      const data = await res.json();
      const text = data.text || data.error || "Analysis complete.";
      setMessages((prev) => [...prev, { role: "assistant", content: text, isAlertDive: isAlert }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "⚠️ Connection error. Please retry." }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, buildMarketContext]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput("");
    const newMsgs = [...messages, { role: "user", content: msg }];
    setMessages(newMsgs);
    await callAPI(msg, false, newMsgs);
  }, [input, isLoading, callAPI, messages]);

  const handleQuickAction = useCallback(async (prompt, label) => {
    if (isLoading) return;
    const newMsgs = [...messages, { role: "user", content: label }];
    setMessages(newMsgs);
    await callAPI(prompt, false, newMsgs);
  }, [isLoading, callAPI, messages]);

  const handleWatchlistClick = useCallback(async (q) => {
    if (isLoading) return;
    const prompt = `DEEP DIVE on ${q.symbol} using the live price data provided (current price $${q.price}, ${q.changePercent}% change today). Run the full 8-part deep dive format: (1) catalyst story, (2) key support/resistance, (3) options landscape + IV rank, (4) CALL or PUT, (5) entry/target/stop, (6) timeframe, (7) sympathy plays, (8) final verdict.`;
    const newMsgs = [...messages, { role: "user", content: `🔍 Deep dive: ${q.symbol} ($${q.price?.toFixed(2)}, ${q.changePercent?.toFixed(2)}%)` }];
    setMessages(newMsgs);
    await callAPI(prompt, true, newMsgs);
  }, [isLoading, callAPI, messages]);

  const handleNewsClick = useCallback(async (item) => {
    if (isLoading) return;
    const prompt = `Analyze this news headline and its market impact: "${item.headline}" (source: ${item.source}). Which tickers are affected? Give specific trade setups — direction, exact strike/expiry, IV rank, entry/target/stop, timeframe.`;
    const newMsgs = [...messages, { role: "user", content: `📰 ${item.headline.slice(0, 70)}...` }];
    setMessages(newMsgs);
    await callAPI(prompt, true, newMsgs);
  }, [isLoading, callAPI, messages]);

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const filteredNews = activeFilter === "all" ? news : news; // category filtering on news requires keyword logic; kept simple here

  return (
    <div style={{ display: "flex", height: "100vh", background: "#060910", fontFamily: "'Inter',sans-serif", overflow: "hidden" }}>

      {/* ── LEFT: WATCHLIST + NEWS ── */}
      <div style={{ width: 360, minWidth: 360, borderRight: "1px solid #111a25", display: "flex", flexDirection: "column", background: "#060910" }}>
        <div style={{ padding: "13px 14px 10px", borderBottom: "1px solid #111a25" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: dataError ? "#ff4d6d" : "#00d4aa", boxShadow: dataError ? "none" : "0 0 10px #00d4aa" }} />
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 700, color: "#00d4aa", letterSpacing: 3 }}>LIVE FEED</span>
            </div>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#1a3040" }}>
              {lastUpdate ? `UPD ${new Date(lastUpdate).toLocaleTimeString()}` : "LOADING..."}
            </span>
          </div>
          {dataError && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#ff4d6d", background: "rgba(255,77,109,0.08)", border: "1px solid rgba(255,77,109,0.2)", borderRadius: 6, padding: "6px 10px" }}>
              ⚠ {dataError}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px" }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#2a4055", letterSpacing: 2, fontWeight: 700, marginBottom: 8, padding: "0 4px" }}>WATCHLIST · CLICK FOR DEEP DIVE</div>
          {WATCHLIST.map((sym) => (
            <WatchlistRow key={sym} q={quotes[sym] || { symbol: sym }} onClick={handleWatchlistClick} />
          ))}

          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#2a4055", letterSpacing: 2, fontWeight: 700, margin: "16px 0 8px", padding: "0 4px" }}>MARKET NEWS · CLICK FOR ANALYSIS</div>
          {news.length === 0 && <div style={{ textAlign: "center", color: "#1a2d3a", fontFamily: "'JetBrains Mono',monospace", fontSize: 11, paddingTop: 20 }}>LOADING NEWS...</div>}
          {news.map((item) => <NewsCard key={item.id} item={item} onDiveDeep={handleNewsClick} />)}
        </div>

        <div style={{ padding: "7px 14px", borderTop: "1px solid #111a25", display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#1a2d3a", letterSpacing: 1 }}>{WATCHLIST.length} TICKERS · {news.length} HEADLINES</span>
          <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: "#1a2d3a", animation: "scanLine 3s infinite" }}>AUTO-REFRESH 30S</span>
        </div>
      </div>

      {/* ── CENTER: CHAT TERMINAL ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        <div style={{ padding: "11px 20px", borderBottom: "1px solid #111a25", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#060910" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: "#e8f2fa", letterSpacing: 3 }}>MKTINTEL</span>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#00d4aa", background: "rgba(0,212,170,0.1)", border: "1px solid rgba(0,212,170,0.25)", padding: "2px 7px", borderRadius: 4, letterSpacing: 2, fontWeight: 700 }}>LIVE</span>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#1a2d3a", letterSpacing: 1, marginTop: 2 }}>TRADING INTELLIGENCE · ROBINHOOD · WEBULL · TRADINGVIEW</div>
          </div>
        </div>

        {/* Ticker tape */}
        <div style={{ borderBottom: "1px solid #111a25", background: "#030608", overflow: "hidden", height: 46, display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", animation: "tickerScroll 40s linear infinite", whiteSpace: "nowrap" }}>
            {[...TICKER_TAPE_SYMBOLS, ...TICKER_TAPE_SYMBOLS].map((sym, i) => {
              const q = tapeQuotes[sym];
              const up = q && (q.changePercent ?? 0) >= 0;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 24px", borderRight: "1px solid #0c1420" }}>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: "#7a96a8", letterSpacing: 1.5 }}>{sym}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: "#c0d4e0", fontWeight: 500 }}>{q?.price != null ? `$${q.price.toFixed(2)}` : "—"}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: up ? "#00d4aa" : "#ff4d6d" }}>
                    {q?.changePercent != null ? `${up ? "▲" : "▼"} ${q.changePercent.toFixed(2)}%` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px" }}>
          {messages.map((msg, i) => <ChatMessage key={i} msg={msg} />)}
          {isLoading && <TypingIndicator />}
          <div ref={chatEndRef} />
        </div>

        <QuickActions onAction={handleQuickAction} />

        {/* Input */}
        <div style={{ padding: "8px 20px 16px", borderTop: "1px solid #111a25" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 9, background: "#090d14", border: "1px solid #111a25", borderRadius: 10, padding: "10px 14px" }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, color: "#00d4aa", paddingBottom: 2, animation: "blink 1.2s infinite" }}>▸</span>
            <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKey}
              placeholder="Ask anything — or use Quick Actions above..."
              rows={1} style={{ flex: 1, background: "transparent", border: "none", color: "#c8d8e8", fontFamily: "'Inter',sans-serif", fontSize: 13, lineHeight: 1.6, maxHeight: 100, overflowY: "auto" }}
              onInput={(e) => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px"; }}
            />
            <button onClick={sendMessage} disabled={!input.trim() || isLoading}
              style={{ width: 30, height: 30, borderRadius: 7, flexShrink: 0,
                background: input.trim() && !isLoading ? "rgba(0,212,170,0.15)" : "transparent",
                border: `1px solid ${input.trim() && !isLoading ? "rgba(0,212,170,0.3)" : "#111a25"}`,
                color: input.trim() && !isLoading ? "#00d4aa" : "#1a2d3a",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>▸</button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, padding: "0 2px" }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#0e1a24", letterSpacing: 1 }}>SHIFT+ENTER FOR NEW LINE</span>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 8, color: "#0e1a24", letterSpacing: 1 }}>NOT FINANCIAL ADVICE</span>
          </div>
        </div>
      </div>
    </div>
  );
}