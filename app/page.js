"use client";
import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";

// ─── FONT ROLES ────────────────────────────────────────────────────────────
const FONT_SANS = "'Geist', sans-serif";          // Watchlist title
const FONT_SERIF = "'Source Serif 4', serif";      // News tab title + headlines
const FONT_DISPLAY = "'Fraunces', serif";           // Trading Terminal / Data titles
const FONT_CHAT = "'Inter', sans-serif";            // AI assistant + chat box
const FONT_MONO = "'JetBrains Mono', monospace";    // Data/labels/tickers

// ─── COLOR HELPERS ────────────────────────────────────────────────────────
function hexToRgb(hex) {
  let h = (hex || "#000000").replace("#", "");
  if (h.length === 3) h = h.split("").map(c => c + c).join("");
  const num = parseInt(h, 16) || 0;
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}
function rgbToHex(r, g, b) {
  const c = x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}
function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const d = Math.round(2.55 * amt);
  return rgbToHex(r + d, g + d, b + d);
}
function mix(hexA, hexB, weight) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  return rgbToHex(a.r * weight + b.r * (1 - weight), a.g * weight + b.g * (1 - weight), a.b * weight + b.b * (1 - weight));
}
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function deriveTheme(bg, text) {
  const light = luminance(bg) > 0.55;
  const dir = light ? -1 : 1;
  return {
    bg, panel: bg,
    surface: shade(bg, dir * 4),
    border: shade(bg, dir * 9),
    text,
    textDim: mix(text, bg, 0.6),
    dim: mix(text, bg, 0.32),
  };
}

const DEFAULT_BG = "#060910";
const DEFAULT_TEXT = "#c8d8e8";
const ACCENTS = { teal: "#00d4aa", blue: "#7eb8f7", purple: "#a78bfa", orange: "#ff6b35", gold: "#f7c948", red: "#ff4d6d" };
const WIDTH_PRESETS_LEFT = [{ label: "Narrow", val: 250 }, { label: "Standard", val: 290 }, { label: "Wide", val: 340 }];
const WIDTH_PRESETS_RIGHT = [{ label: "Narrow", val: 270 }, { label: "Standard", val: 310 }, { label: "Wide", val: 360 }];

const THEME_DEFAULTS = {
  mainBg: DEFAULT_BG, mainText: DEFAULT_TEXT,
  leftBg: DEFAULT_BG, leftText: DEFAULT_TEXT,
  rightBg: DEFAULT_BG, rightText: DEFAULT_TEXT,
  accent: "teal", density: "comfortable",
  leftWidth: 290, rightWidth: 310,
};

// ─── TICKER UNIVERSE ──────────────────────────────────────────────────────
const COMPANY_NAMES = {
  NVDA:"NVIDIA Corp", AAPL:"Apple Inc", MSFT:"Microsoft Corp", GOOGL:"Alphabet Inc",
  AMZN:"Amazon.com Inc", META:"Meta Platforms", TSLA:"Tesla Inc", AMD:"Advanced Micro Devices",
  JPM:"JPMorgan Chase", V:"Visa Inc", UNH:"UnitedHealth Group", LLY:"Eli Lilly",
  XOM:"Exxon Mobil", BA:"Boeing Co", WMT:"Walmart Inc", COST:"Costco Wholesale",
  NKE:"Nike Inc", DIS:"Walt Disney Co", PLTR:"Palantir Technologies", RKLB:"Rocket Lab",
  IONQ:"IonQ Inc", SMCI:"Super Micro Computer", GME:"GameStop Corp", MSTR:"MicroStrategy",
  SPY:"S&P 500 ETF", QQQ:"Nasdaq 100 ETF", IWM:"Russell 2000 ETF", DIA:"Dow Jones ETF",
  COIN:"Coinbase Global", RIOT:"Riot Platforms", MARA:"Marathon Digital", CLSK:"CleanSpark",
  ADBE:"Adobe Inc", CRM:"Salesforce Inc", ORCL:"Oracle Corp", INTC:"Intel Corp",
  QCOM:"Qualcomm Inc", PYPL:"PayPal Holdings", SQ:"Block Inc", SHOP:"Shopify Inc",
  UBER:"Uber Technologies", SBUX:"Starbucks Corp", MCD:"McDonald's Corp", TGT:"Target Corp",
  HD:"Home Depot", CAT:"Caterpillar Inc", GE:"General Electric", RTX:"RTX Corp",
  KO:"Coca-Cola Co", PEP:"PepsiCo Inc", PG:"Procter & Gamble", JNJ:"Johnson & Johnson",
  T:"AT&T Inc", VZ:"Verizon Communications", C:"Citigroup Inc", WFC:"Wells Fargo",
  GS:"Goldman Sachs", MS:"Morgan Stanley", BAC:"Bank of America", AVGO:"Broadcom Inc",
  NFLX:"Netflix Inc",
};
const DEFAULT_WATCHLIST = ["NVDA","AAPL","MSFT","GOOGL","AMZN","META","TSLA","AMD","JPM","V","UNH","LLY","XOM","BA","WMT","COST","NKE","DIS","PLTR","RKLB","IONQ","SMCI","GME","MSTR","SPY","QQQ"];
const POPULAR_PICKS = ["ADBE","CRM","ORCL","INTC","QCOM","PYPL","SQ","SHOP","UBER","SBUX","MCD","TGT","HD","CAT","GE","RTX","KO","PEP","PG","JNJ","T","VZ","C","WFC","GS","MS","BAC","AVGO","NFLX","COIN","RIOT","MARA","CLSK","IWM","DIA"];
function buildDefaultMeta() {
  const m = {}; DEFAULT_WATCHLIST.forEach(s => { m[s] = COMPANY_NAMES[s] || s; }); return m;
}
const TRUMP_RE = /trump|truth social|tariff|executive order|maga|mar-a-lago|president trump|trade war/i;

const QA_GROUPS = [
  {label:"📰 NEWS",color:"#f7c948",actions:[
    {label:"Breaking market news now",prompt:"Give me the most important breaking market news RIGHT NOW using live context provided. For each catalyst: direction, exact options play with strike/expiry, IV rank, entry/target/stop. Compact. 🔥/⚡/👀 every setup."},
    {label:"Trump / Truth Social now",prompt:"Search Trump's latest Truth Social posts, tweets, and public statements RIGHT NOW. Sectors impacted? For each: specific tickers, exact options play, IV rank, entry/target/stop. Rank conviction 🔥/⚡/👀."},
    {label:"Fed & macro today",prompt:"Latest Fed news, CPI, jobs, rate decisions, Fed speakers. What matters most right now and how does it affect options? IV rank on every setup."},
    {label:"Earnings today",prompt:"Companies reporting today or after-hours? Beats or misses? Best remaining options plays and sympathy trades. IV rank for each."},
  ]},
  {label:"💎 DISCOVERY",color:"#a78bfa",actions:[
    {label:"Undervalued stocks now",prompt:"Undervalued stocks with catalysts Wall Street hasn't priced in. Large AND small/micro caps. P/E context, catalyst, options play, IV rank."},
    {label:"Hidden gems",prompt:"Hidden gems with explosive upside: low float squeeze candidates, micro-caps with catalysts, biotech near FDA, DoD contracts. Wide scan."},
    {label:"Short squeeze plays",prompt:"Top short squeeze candidates now. High short float + catalyst. Short %, days to cover, exact options strikes, IV rank."},
    {label:"Small cap movers",prompt:"Small and micro caps with unusual activity. 5-8 names with specific setups and IV rank."},
  ]},
  {label:"🐋 WHALE",color:"#00d4aa",actions:[
    {label:"Whale buys now",prompt:"Full whale and dark pool activity today. Block trades above $500K, institutional buys, unusual sweeps. Named whale moves?"},
    {label:"Unusual options flow",prompt:"Unusual options flow now. Biggest sweeps, dark pool prints, 0DTE spikes. Exact setups with exact strikes and IV rank."},
    {label:"Insider buys this week",prompt:"Insider buying via SEC Form 4 this week. Size, significance, options plays with IV rank."},
    {label:"Dark pool prints",prompt:"Biggest dark pool prints today. Bullish vs bearish? Small/mid caps that haven't reacted yet."},
  ]},
  {label:"📊 ANALYSIS",color:"#7eb8f7",actions:[
    {label:"Full market scan",prompt:"Complete market scan using live watchlist data. Top CALLs, Top PUTs, hidden gems, whale summary, sector rotation, macro risks. IV rank on everything. 🔥/⚡/👀."},
    {label:"Best options this week",prompt:"Best options plays for this week. Conviction ranked. Catalyst, exact strike/expiry, entry, target, stop, IV rank, risk level."},
    {label:"Sector rotation",prompt:"Which sectors seeing rotation today? Money flowing IN and OUT. Specific ETFs, tickers, options plays both directions."},
    {label:"Best LEAPS now",prompt:"Best LEAPS for 3-12 month holds. Specific strikes, expiry, entry zone, thesis for each."},
  ]},
  {label:"⚡ INTEL",color:"#ff6b35",actions:[
    {label:"Pre-market movers",prompt:"What's moving pre-market right now and why? Gainers/losers with catalyst. Options plays with IV rank."},
    {label:"Crypto vs stocks",prompt:"Crypto moving today affecting stocks? BTC, ETH, MSTR, COIN, RIOT, MARA, CLSK. Options opportunities? IV rank."},
    {label:"FDA/biotech catalysts",prompt:"Biotech or pharma FDA catalysts this week. PDUFA dates, trial readouts. Options, IV rank, risk/reward."},
    {label:"DoD contracts",prompt:"Recent government contract awards, DoD spending. Winners, especially small/mid caps the market hasn't reacted to."},
  ]},
];

// ─── SHARED SMALL COMPONENTS ───────────────────────────────────────────────
function TypingIndicator({ accent }) {
  return (
    <div style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 14px" }}>
      <span style={{ color:accent,fontSize:10,fontFamily:FONT_MONO,letterSpacing:2,fontWeight:700 }}>ANALYZING</span>
      {[0,1,2].map(i=>(<div key={i} style={{ width:4,height:4,borderRadius:"50%",background:accent,animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>))}
    </div>
  );
}

const ChatMessage = memo(function ChatMessage({ msg, accent, T }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:isUser?"flex-end":"flex-start",marginBottom:9 }}>
      <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:3 }}>
        {!isUser && <span style={{ color:msg.isAlertDive?"#a78bfa":accent,fontSize:9,fontFamily:FONT_MONO,letterSpacing:2,fontWeight:700 }}>{msg.isAlertDive?"◆ INTEL":"◈ DESK"}</span>}
        {isUser && <span style={{ color:T.dim,fontSize:9,fontFamily:FONT_MONO,letterSpacing:2,fontWeight:700 }}>YOU ◈</span>}
      </div>
      <div style={{ maxWidth:"91%",
        background:isUser?`${accent}10`:msg.isAlertDive?"rgba(167,139,250,0.08)":"rgba(127,127,127,0.06)",
        border:isUser?`1px solid ${accent}28`:msg.isAlertDive?"1px solid rgba(167,139,250,0.22)":`1px solid ${T.border}`,
        borderRadius:isUser?"12px 12px 3px 12px":"3px 12px 12px 12px",padding:"10px 14px" }}>
        <p style={{ color:isUser?T.text:T.textDim,fontSize:14,lineHeight:1.62,margin:0,fontFamily:FONT_CHAT,whiteSpace:"pre-wrap" }}>{msg.content}</p>
      </div>
    </div>
  );
});

function QuickActions({ onAction, accent, T }) {
  const [open,setOpen] = useState(null);
  return (
    <div style={{ padding:"7px 16px 9px",borderTop:`1px solid ${T.border}`,background:T.panel }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
        <span style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700 }}>QUICK ACTIONS</span>
        <div style={{ flex:1,height:1,background:T.border }}/>
      </div>
      <div style={{ display:"flex",gap:5,flexWrap:"wrap",marginBottom:open!==null?7:0 }}>
        {QA_GROUPS.map((g,gi)=>(
          <button key={gi} onClick={()=>setOpen(open===gi?null:gi)}
            style={{ fontFamily:FONT_MONO,fontSize:10,fontWeight:700,
              color:open===gi?g.color:T.dim, background:open===gi?`${g.color}14`:"transparent",
              border:`1px solid ${open===gi?`${g.color}38`:T.border}`, padding:"4px 11px",borderRadius:5,letterSpacing:0.5,cursor:"pointer" }}>
            {g.label}
          </button>
        ))}
      </div>
      {open!==null && (
        <div style={{ display:"flex",gap:5,flexWrap:"wrap",borderTop:`1px solid ${T.border}`,paddingTop:7 }}>
          {QA_GROUPS[open].actions.map((a,ai)=>(
            <button key={ai} onClick={()=>{onAction(a.prompt,a.label);setOpen(null);}}
              style={{ fontFamily:FONT_MONO,fontSize:10,color:QA_GROUPS[open].color,
                background:`${QA_GROUPS[open].color}0f`, border:`1px solid ${QA_GROUPS[open].color}2a`,
                padding:"5px 12px",borderRadius:18,letterSpacing:0.3,cursor:"pointer" }}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const WatchlistRow = memo(function WatchlistRow({ symbol, quote, name, onClick, T, density }) {
  const pad = density==="compact" ? "6px 9px" : "8px 10px";
  if (!quote) return (
    <div style={{ padding:pad,borderRadius:7,marginBottom:5,background:T.surface,border:`1px solid ${T.border}` }}>
      <span style={{ fontFamily:FONT_MONO,fontSize:10,color:T.dim }}>{symbol} loading...</span>
    </div>
  );
  if (quote.error) return (
    <div style={{ padding:pad,borderRadius:7,marginBottom:5,background:T.surface,border:`1px solid ${T.border}` }}>
      <span style={{ fontFamily:FONT_MONO,fontSize:10,color:"#ff4d6d" }}>{symbol} — {quote.error}</span>
    </div>
  );
  const up = (quote.changePercent ?? 0) >= 0;
  const clr = up ? "#00d4aa" : "#ff4d6d";
  return (
    <div onClick={()=>onClick({ symbol, name, ...quote })}
      style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:pad,borderRadius:7,marginBottom:5,
        background:T.surface,border:`1px solid ${T.border}`,cursor:"pointer",transition:"background 0.12s" }}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(127,127,127,0.08)"}
      onMouseLeave={e=>e.currentTarget.style.background=T.surface}>
      <div>
        <div style={{ fontFamily:FONT_MONO,fontWeight:700,fontSize:12.5,color:T.text,letterSpacing:1 }}>{symbol}</div>
        <div style={{ fontFamily:FONT_CHAT,fontSize:10,color:T.dim,marginTop:1 }}>{(name||symbol).slice(0,20)}</div>
      </div>
      <div style={{ textAlign:"right" }}>
        <div style={{ fontFamily:FONT_MONO,fontSize:12.5,fontWeight:700,color:T.text }}>{quote.price!=null?`$${quote.price.toFixed(2)}`:"—"}</div>
        <div style={{ fontFamily:FONT_MONO,fontSize:11,fontWeight:700,color:clr }}>{quote.changePercent!=null?`${up?"▲":"▼"} ${Math.abs(quote.changePercent).toFixed(2)}%`:""}</div>
      </div>
    </div>
  );
});

const NewsCard = memo(function NewsCard({ item, onDiveDeep, T, density }) {
  const isTrump = TRUMP_RE.test((item.headline||"")+(item.summary||""));
  const age = item.datetime ? Math.round((Date.now()-item.datetime)/60000) : null;
  const ageLabel = age==null?"":age<1?"just now":age<60?`${age}m ago`:`${Math.round(age/60)}h ago`;
  const bc = isTrump ? "#ff6b35" : "#f7c948";
  const pad = density==="compact" ? "7px 10px" : "9px 11px";
  return (
    <div onClick={()=>onDiveDeep(item)}
      style={{ background:`${bc}08`,border:`1px solid ${bc}1a`,borderLeft:`3px solid ${bc}`,borderRadius:7,padding:pad,marginBottom:6,cursor:"pointer",transition:"all 0.13s" }}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(127,127,127,0.08)"}
      onMouseLeave={e=>e.currentTarget.style.background=`${bc}08`}>
      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
        <span style={{ fontFamily:FONT_MONO,fontSize:9,color:bc,letterSpacing:1,fontWeight:700 }}>{isTrump?"🦅 ":""}{item.source?.toUpperCase()}</span>
        <span style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim }}>{ageLabel}</span>
      </div>
      <p style={{ color:T.textDim,fontSize:12,lineHeight:1.45,margin:0,fontFamily:FONT_SERIF,fontWeight:500 }}>{item.headline}</p>
    </div>
  );
});

// ─── WATCHLIST MODAL ───────────────────────────────────────────────────────
function WatchlistModal({ onClose, watchlist, onAdd, onRemove, onReset, accent, T }) {
  const [q,setQ] = useState("");
  const [results,setResults] = useState([]);
  const [searching,setSearching] = useState(false);

  const doSearch = useCallback(async(query)=>{
    if(!query.trim()){setResults([]);return;}
    setSearching(true);
    try{ const r = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`); const d = await r.json(); setResults(d.data||[]); }
    catch{setResults([]);}finally{setSearching(false);}
  },[]);
  useEffect(()=>{const t=setTimeout(()=>doSearch(q),350);return()=>clearTimeout(t);},[q,doSearch]);

  const quickAdds = POPULAR_PICKS.filter(s=>!watchlist.includes(s)).slice(0,16);

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ width:460,maxHeight:"86vh",overflowY:"auto",background:T.panel,border:`1px solid ${accent}35`,borderRadius:16,padding:24,boxShadow:`0 0 50px ${accent}18` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
          <span style={{ fontFamily:FONT_SANS,fontSize:13,fontWeight:700,color:accent,letterSpacing:1 }}>★ Manage Watchlist</span>
          <button onClick={onClose} style={{ color:T.dim,fontSize:17,cursor:"pointer" }}>✕</button>
        </div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="SEARCH ANY COMPANY OR TICKER..."
          style={{ width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",
            color:T.text,fontFamily:FONT_MONO,fontSize:12,letterSpacing:1,marginBottom:10 }}/>
        {searching && <div style={{ fontFamily:FONT_MONO,fontSize:10,color:T.dim,marginBottom:8 }}>SEARCHING...</div>}
        {results.length>0 && (
          <div style={{ marginBottom:14,borderRadius:8,overflow:"hidden",border:`1px solid ${T.border}` }}>
            {results.map(r=>(
              <div key={r.symbol} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderBottom:`1px solid ${T.border}`,background:T.surface }}>
                <div style={{ minWidth:0,flex:1 }}>
                  <span style={{ fontFamily:FONT_MONO,fontWeight:700,color:T.text,fontSize:13 }}>{r.symbol}</span>
                  <span style={{ fontFamily:FONT_CHAT,fontSize:10,color:T.dim,marginLeft:8 }}>{(r.name||"").slice(0,28)}</span>
                </div>
                {watchlist.includes(r.symbol)
                  ? <button onClick={()=>onRemove(r.symbol)} style={{ background:"rgba(255,77,109,0.12)",border:"1px solid rgba(255,77,109,0.28)",color:"#ff4d6d",borderRadius:5,padding:"2px 9px",fontFamily:FONT_MONO,fontSize:10,cursor:"pointer",fontWeight:700,flexShrink:0 }}>REMOVE</button>
                  : <button onClick={()=>onAdd(r.symbol,r.name)} style={{ background:`${accent}12`,border:`1px solid ${accent}28`,color:accent,borderRadius:5,padding:"2px 9px",fontFamily:FONT_MONO,fontSize:10,cursor:"pointer",fontWeight:700,flexShrink:0 }}>+ ADD</button>}
              </div>
            ))}
          </div>
        )}
        {results.length===0 && !searching && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:8 }}>QUICK ADD — POPULAR</div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
              {quickAdds.map(s=>(
                <button key={s} onClick={()=>onAdd(s,COMPANY_NAMES[s])}
                  style={{ display:"flex",alignItems:"center",gap:4,background:`${accent}0a`,border:`1px solid ${accent}20`,borderRadius:6,padding:"4px 9px",cursor:"pointer" }}>
                  <span style={{ fontFamily:FONT_MONO,fontSize:10,fontWeight:700,color:T.text }}>{s}</span>
                  <span style={{ color:accent,fontSize:11,fontWeight:700 }}>+</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
          <span style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700 }}>CURRENT ({watchlist.length})</span>
          <button onClick={onReset} style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:1,cursor:"pointer",textDecoration:"underline" }}>RESET TO DEFAULT</button>
        </div>
        <div style={{ display:"flex",flexWrap:"wrap",gap:5 }}>
          {watchlist.map(s=>(
            <div key={s} style={{ display:"flex",alignItems:"center",gap:4,background:`${accent}0f`,border:`1px solid ${accent}22`,borderRadius:5,padding:"3px 9px" }}>
              <span style={{ fontFamily:FONT_MONO,fontSize:11,color:accent,fontWeight:700 }}>{s}</span>
              <button onClick={()=>onRemove(s)} style={{ color:T.dim,fontSize:11,cursor:"pointer",lineHeight:1,paddingLeft:2 }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS PANEL ────────────────────────────────────────────────────────
function ColorPairSection({ title, bg, setBg, text, setText, T, accent }) {
  const [bgDraft,setBgDraft] = useState(bg);
  const [textDraft,setTextDraft] = useState(text);
  useEffect(()=>setBgDraft(bg),[bg]);
  useEffect(()=>setTextDraft(text),[text]);
  const commitBg = v => { setBgDraft(v); if(/^#[0-9a-fA-F]{6}$/.test(v)) setBg(v); };
  const commitText = v => { setTextDraft(v); if(/^#[0-9a-fA-F]{6}$/.test(v)) setText(v); };
  return (
    <div style={{ marginBottom:18,padding:"12px",borderRadius:9,background:T.surface,border:`1px solid ${T.border}` }}>
      <div style={{ fontFamily:FONT_MONO,fontSize:9,color:accent,letterSpacing:2,fontWeight:700,marginBottom:10 }}>{title}</div>
      <div style={{ display:"flex",gap:7,alignItems:"center",marginBottom:7 }}>
        <span style={{ fontFamily:FONT_MONO,fontSize:8,color:T.dim,width:34 }}>BG</span>
        <input type="color" value={bg} onChange={e=>setBg(e.target.value)} style={{ width:30,height:26,border:`1px solid ${T.border}`,borderRadius:5,cursor:"pointer",padding:0,background:"transparent" }}/>
        <input type="text" value={bgDraft} onChange={e=>commitBg(e.target.value)} style={{ flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 8px",color:T.text,fontFamily:FONT_MONO,fontSize:10 }}/>
      </div>
      <div style={{ display:"flex",gap:7,alignItems:"center" }}>
        <span style={{ fontFamily:FONT_MONO,fontSize:8,color:T.dim,width:34 }}>TEXT</span>
        <input type="color" value={text} onChange={e=>setText(e.target.value)} style={{ width:30,height:26,border:`1px solid ${T.border}`,borderRadius:5,cursor:"pointer",padding:0,background:"transparent" }}/>
        <input type="text" value={textDraft} onChange={e=>commitText(e.target.value)} style={{ flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 8px",color:T.text,fontFamily:FONT_MONO,fontSize:10 }}/>
      </div>
    </div>
  );
}

function SettingsPanel(props) {
  const { onClose, mainBg,setMainBg,mainText,setMainText, leftBg,setLeftBg,leftText,setLeftText,
    rightBg,setRightBg,rightText,setRightText, accentKey,setAccentKey,
    density,setDensity, leftWidth,setLeftWidth, rightWidth,setRightWidth, onResetAll, T, accent } = props;
  const [tab,setTab] = useState("colors");

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1000,display:"flex",justifyContent:"flex-end" }}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ width:320,height:"100vh",background:T.panel,borderLeft:`1px solid ${T.border}`,padding:22,overflowY:"auto",boxShadow:"-8px 0 40px rgba(0,0,0,0.6)" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
          <span style={{ fontFamily:FONT_MONO,fontSize:11,fontWeight:700,color:accent,letterSpacing:3 }}>⚙ SETTINGS</span>
          <button onClick={onClose} style={{ color:T.dim,fontSize:17,cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"flex",gap:5,marginBottom:16 }}>
          {[{id:"colors",label:"COLORS"},{id:"layout",label:"LAYOUT"}].map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{ flex:1,padding:"7px",fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:1,
                color:tab===t.id?accent:T.dim, background:tab===t.id?`${accent}10`:"transparent",
                border:`1px solid ${tab===t.id?`${accent}28`:T.border}`, borderRadius:6,cursor:"pointer" }}>{t.label}</button>
          ))}
        </div>

        {tab==="colors" && (
          <>
            <div style={{ marginBottom:18 }}>
              <div style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:10 }}>ACCENT COLOR</div>
              <div style={{ display:"flex",gap:7,flexWrap:"wrap" }}>
                {Object.entries(ACCENTS).map(([k,c])=>(
                  <button key={k} onClick={()=>setAccentKey(k)}
                    style={{ width:30,height:30,borderRadius:7,background:c,cursor:"pointer",
                      border:accentKey===k?"3px solid #ffffff":"3px solid transparent",
                      boxShadow:accentKey===k?`0 0 12px ${c}`:"" }}/>
                ))}
              </div>
            </div>
            <ColorPairSection title="MAIN / CHAT AREA" bg={mainBg} setBg={setMainBg} text={mainText} setText={setMainText} T={T} accent={accent}/>
            <ColorPairSection title="LEFT PANEL (WATCHLIST)" bg={leftBg} setBg={setLeftBg} text={leftText} setText={setLeftText} T={T} accent={accent}/>
            <ColorPairSection title="RIGHT PANEL (NEWS)" bg={rightBg} setBg={setRightBg} text={rightText} setText={setRightText} T={T} accent={accent}/>
          </>
        )}

        {tab==="layout" && (
          <>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:10 }}>DENSITY</div>
              <div style={{ display:"flex",gap:7 }}>
                {["comfortable","compact"].map(d=>(
                  <button key={d} onClick={()=>setDensity(d)}
                    style={{ flex:1,padding:"8px",borderRadius:7,fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",
                      color:density===d?accent:T.dim, background:density===d?`${accent}10`:"transparent",
                      border:`1px solid ${density===d?`${accent}28`:T.border}`,cursor:"pointer" }}>{d}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:10 }}>LEFT PANEL WIDTH</div>
              <div style={{ display:"flex",gap:7 }}>
                {WIDTH_PRESETS_LEFT.map(p=>(
                  <button key={p.label} onClick={()=>setLeftWidth(p.val)}
                    style={{ flex:1,padding:"8px",borderRadius:7,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,
                      color:leftWidth===p.val?accent:T.dim, background:leftWidth===p.val?`${accent}10`:"transparent",
                      border:`1px solid ${leftWidth===p.val?`${accent}28`:T.border}`,cursor:"pointer" }}>{p.label}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:10 }}>RIGHT PANEL WIDTH</div>
              <div style={{ display:"flex",gap:7 }}>
                {WIDTH_PRESETS_RIGHT.map(p=>(
                  <button key={p.label} onClick={()=>setRightWidth(p.val)}
                    style={{ flex:1,padding:"8px",borderRadius:7,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,
                      color:rightWidth===p.val?accent:T.dim, background:rightWidth===p.val?`${accent}10`:"transparent",
                      border:`1px solid ${rightWidth===p.val?`${accent}28`:T.border}`,cursor:"pointer" }}>{p.label}</button>
                ))}
              </div>
            </div>
          </>
        )}

        <button onClick={onResetAll}
          style={{ width:"100%",padding:"9px",borderRadius:7,background:"transparent",border:`1px solid ${T.border}`,
            color:T.dim,fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer",marginTop:6,marginBottom:16 }}>
          RESET ALL TO DEFAULT
        </button>

        <div style={{ padding:"12px",borderRadius:8,background:T.surface,border:`1px solid ${T.border}` }}>
          <div style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:0.5,lineHeight:1.7 }}>
            This terminal is a proprietary research intelligence system.<br/>
            ⚠️ Not financial advice. All setups are probability-based analysis.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── RIGHT PANEL — MERGED NEWS ──────────────────────────────────────────────
function RightPanel({ news, onDiveDeep, onRefresh, refreshing, lastUpd, accent, T, density }) {
  return (
    <div style={{ width:"100%",display:"flex",flexDirection:"column",background:T.panel,height:"100%" }}>
      <div style={{ padding:"11px 14px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <div style={{ width:7,height:7,borderRadius:"50%",background:accent,boxShadow:`0 0 8px ${accent}` }}/>
          <span style={{ fontFamily:FONT_SERIF,fontSize:15,fontWeight:700,color:T.text,letterSpacing:0.3 }}>News</span>
        </div>
        <div style={{ display:"flex",alignItems:"center",gap:8 }}>
          <span style={{ fontFamily:FONT_MONO,fontSize:8,color:T.dim }}>{lastUpd?new Date(lastUpd).toLocaleTimeString():""}</span>
          <button onClick={onRefresh} title="Refresh news"
            style={{ width:24,height:24,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:13,color:accent,background:`${accent}10`,border:`1px solid ${accent}22`,cursor:"pointer",
              animation:refreshing?"spin 0.7s linear infinite":"none" }}>↻</button>
        </div>
      </div>
      <div style={{ padding:"5px 14px",borderBottom:`1px solid ${T.border}`,background:"rgba(255,107,53,0.03)" }}>
        <span style={{ fontFamily:FONT_MONO,fontSize:8,color:T.dim,letterSpacing:1 }}>🦅 TRUMP / TRUTH SOCIAL FLAGGED INLINE · CLICK ANY ITEM TO ANALYZE</span>
      </div>
      <div style={{ flex:1,overflowY:"auto",padding:"9px 10px" }}>
        {news.length===0 && <div style={{ padding:18,textAlign:"center",fontFamily:FONT_MONO,fontSize:10,color:T.dim }}>LOADING NEWS...</div>}
        {news.map((item,i)=><NewsCard key={item.id||i} item={item} onDiveDeep={onDiveDeep} T={T} density={density}/>)}
      </div>
    </div>
  );
}

// ─── DATA PAGE ──────────────────────────────────────────────────────────────
function DataPage({ news, secData, secLoading, onRefreshAll, onDiveNews, onDiveFiling, onDiveInsider,
  messages, input, setInput, send, loading, onOpenChat, accent, T }) {

  const lastMsg = [...messages].reverse().find(m=>m.role==="assistant");
  const breaking = news.slice(0,8);
  const handleKey = (e) => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } };

  return (
    <div style={{ flex:1,overflowY:"auto",background:T.bg,padding:"20px 24px" }}>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:18 }}>
        <div>
          <div style={{ fontFamily:FONT_DISPLAY,fontSize:26,fontWeight:600,color:T.text,letterSpacing:0.2 }}>Data</div>
          <div style={{ fontFamily:FONT_CHAT,fontSize:11.5,color:T.dim,marginTop:2 }}>Live market intelligence — news, filings, insider activity</div>
        </div>
        <button onClick={onRefreshAll}
          style={{ display:"flex",alignItems:"center",gap:6,padding:"7px 13px",borderRadius:8,
            background:`${accent}10`,border:`1px solid ${accent}28`,color:accent,
            fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer" }}>
          <span style={{ animation:secLoading?"spin 0.7s linear infinite":"none" }}>↻</span> REFRESH ALL
        </button>
      </div>

      <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(300px, 1fr))",gap:14,marginBottom:18 }}>

        {/* Breaking News */}
        <div style={{ background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:14,maxHeight:380,display:"flex",flexDirection:"column" }}>
          <div style={{ fontFamily:FONT_MONO,fontSize:9,color:"#f7c948",letterSpacing:2,fontWeight:700,marginBottom:10 }}>📰 BREAKING / LIVE NEWS</div>
          <div style={{ overflowY:"auto",flex:1 }}>
            {breaking.length===0 && <div style={{ fontFamily:FONT_MONO,fontSize:10,color:T.dim,padding:8 }}>Loading...</div>}
            {breaking.map((item,i)=><NewsCard key={item.id||i} item={item} onDiveDeep={onDiveNews} T={T} density="compact"/>)}
          </div>
        </div>

        {/* SEC Filings */}
        <div style={{ background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:14,maxHeight:380,display:"flex",flexDirection:"column" }}>
          <div style={{ fontFamily:FONT_MONO,fontSize:9,color:"#7eb8f7",letterSpacing:2,fontWeight:700,marginBottom:10 }}>📋 SEC FILINGS</div>
          <div style={{ overflowY:"auto",flex:1 }}>
            {secLoading && <div style={{ fontFamily:FONT_MONO,fontSize:10,color:T.dim,padding:8 }}>Loading from SEC EDGAR...</div>}
            {!secLoading && (secData?.filings||[]).length===0 && <div style={{ fontFamily:FONT_MONO,fontSize:10,color:T.dim,padding:8 }}>No recent filings for your watchlist.</div>}
            {(secData?.filings||[]).map((f,i)=>(
              <div key={i} onClick={()=>onDiveFiling(f)}
                style={{ background:"rgba(126,184,247,0.06)",border:"1px solid rgba(126,184,247,0.18)",borderLeft:"3px solid #7eb8f7",
                  borderRadius:7,padding:"8px 10px",marginBottom:6,cursor:"pointer" }}>
                <div style={{ display:"flex",justifyContent:"space-between",marginBottom:3 }}>
                  <span style={{ fontFamily:FONT_MONO,fontSize:11,fontWeight:700,color:"#7eb8f7" }}>{f.symbol} · {f.form}</span>
                  <span style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim }}>{f.date}</span>
                </div>
                <span style={{ fontFamily:FONT_CHAT,fontSize:10.5,color:T.textDim }}>{f.formName||f.form}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Insider Trades */}
        <div style={{ background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:14,maxHeight:380,display:"flex",flexDirection:"column" }}>
          <div style={{ fontFamily:FONT_MONO,fontSize:9,color:"#a78bfa",letterSpacing:2,fontWeight:700,marginBottom:10 }}>👤 INSIDER TRADES (FORM 4)</div>
          <div style={{ overflowY:"auto",flex:1 }}>
            {secLoading && <div style={{ fontFamily:FONT_MONO,fontSize:10,color:T.dim,padding:8 }}>Loading from SEC EDGAR...</div>}
            {!secLoading && (secData?.insiderTrades||[]).length===0 && <div style={{ fontFamily:FONT_MONO,fontSize:10,color:T.dim,padding:8 }}>No recent Form 4s for your watchlist.</div>}
            {(secData?.insiderTrades||[]).map((t,i)=>(
              <div key={i} onClick={()=>onDiveInsider(t)}
                style={{ background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.18)",borderLeft:"3px solid #a78bfa",
                  borderRadius:7,padding:"8px 10px",marginBottom:6,cursor:"pointer" }}>
                <div style={{ display:"flex",justifyContent:"space-between" }}>
                  <span style={{ fontFamily:FONT_MONO,fontSize:11,fontWeight:700,color:"#a78bfa" }}>{t.symbol} · Form 4</span>
                  <span style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim }}>{t.date}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gamma Exposure — Coming Soon */}
        <div style={{ background:T.surface,border:`1px dashed ${T.border}`,borderRadius:10,padding:14,maxHeight:380,opacity:0.65 }}>
          <div style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:10 }}>◈ GAMMA EXPOSURE</div>
          <div style={{ fontFamily:FONT_CHAT,fontSize:11.5,color:T.dim,lineHeight:1.6 }}>
            Coming soon. Live gamma exposure requires a paid options-data provider. Let me know when you're ready to connect one and I'll wire it in.
          </div>
        </div>
      </div>

      {/* Mini AI box */}
      <div style={{ background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:14 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9 }}>
          <span style={{ fontFamily:FONT_MONO,fontSize:9,color:accent,letterSpacing:2,fontWeight:700 }}>◈ ASK THE DESK</span>
          <button onClick={onOpenChat} style={{ fontFamily:FONT_MONO,fontSize:9,color:T.dim,cursor:"pointer",textDecoration:"underline" }}>Open full chat →</button>
        </div>
        {lastMsg && (
          <div style={{ background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",marginBottom:9,maxHeight:90,overflowY:"auto" }}>
            <p style={{ fontFamily:FONT_CHAT,fontSize:12.5,color:T.textDim,lineHeight:1.5,margin:0,whiteSpace:"pre-wrap" }}>{lastMsg.content.slice(0,300)}{lastMsg.content.length>300?"...":""}</p>
          </div>
        )}
        <div style={{ display:"flex",gap:8 }}>
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
            placeholder="Quick question for the desk..." rows={1}
            style={{ flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",
              color:T.text,fontFamily:FONT_CHAT,fontSize:13,resize:"none" }}/>
          <button onClick={send} disabled={!input.trim()||loading}
            style={{ padding:"0 16px",borderRadius:8,background:input.trim()&&!loading?`${accent}15`:"transparent",
              border:`1px solid ${input.trim()&&!loading?`${accent}30`:T.border}`,
              color:input.trim()&&!loading?accent:T.dim,fontFamily:FONT_MONO,fontSize:12,fontWeight:700,cursor:"pointer" }}>
            {loading?"...":"ASK"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
export default function MarketTerminal() {
  const [view,setView] = useState("terminal");

  const [mainBg,setMainBg] = useState(THEME_DEFAULTS.mainBg);
  const [mainText,setMainText] = useState(THEME_DEFAULTS.mainText);
  const [leftBg,setLeftBg] = useState(THEME_DEFAULTS.leftBg);
  const [leftText,setLeftText] = useState(THEME_DEFAULTS.leftText);
  const [rightBg,setRightBg] = useState(THEME_DEFAULTS.rightBg);
  const [rightText,setRightText] = useState(THEME_DEFAULTS.rightText);
  const [accentKey,setAccentKey] = useState(THEME_DEFAULTS.accent);
  const [density,setDensity] = useState(THEME_DEFAULTS.density);
  const [leftWidth,setLeftWidth] = useState(THEME_DEFAULTS.leftWidth);
  const [rightWidth,setRightWidth] = useState(THEME_DEFAULTS.rightWidth);

  const [watchlist,setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [watchlistMeta,setWatchlistMeta] = useState(buildDefaultMeta());
  const [showWL,setShowWL] = useState(false);
  const [showSettings,setShowSettings] = useState(false);
  const [quotes,setQuotes] = useState({});
  const [news,setNews] = useState([]);
  const [newsRefreshing,setNewsRefreshing] = useState(false);
  const [newsLastUpd,setNewsLastUpd] = useState(null);
  const [secData,setSecData] = useState(null);
  const [secLoading,setSecLoading] = useState(false);

  const [messages,setMessages] = useState([
    { role:"assistant",content:"TRADING TERMINAL DESK ONLINE.\n\nYou have full access to a proprietary hedge fund intelligence system. This desk identifies edge, timing, and high-probability setups with precision.\n\nThis is not financial advice — this is your asymmetric edge.\n\nClick \"Data\" up top for the full intelligence dashboard, or stay here and ask anything." }
  ]);
  const [input,setInput] = useState("");
  const [loading,setLoading] = useState(false);
  const [lastUpd,setLastUpd] = useState(null);
  const [dataErr,setDataErr] = useState(null);
  const chatEndRef = useRef(null);

  const T = useMemo(()=>deriveTheme(mainBg,mainText),[mainBg,mainText]);
  const TL = useMemo(()=>deriveTheme(leftBg,leftText),[leftBg,leftText]);
  const TR = useMemo(()=>deriveTheme(rightBg,rightText),[rightBg,rightText]);
  const accent = ACCENTS[accentKey] || ACCENTS.teal;

  // Persist
  useEffect(()=>{
    try{
      const s = localStorage.getItem("mktintel_theme_v4");
      if(s){ const p=JSON.parse(s);
        setMainBg(p.mainBg||THEME_DEFAULTS.mainBg); setMainText(p.mainText||THEME_DEFAULTS.mainText);
        setLeftBg(p.leftBg||THEME_DEFAULTS.leftBg); setLeftText(p.leftText||THEME_DEFAULTS.leftText);
        setRightBg(p.rightBg||THEME_DEFAULTS.rightBg); setRightText(p.rightText||THEME_DEFAULTS.rightText);
        setAccentKey(p.accent||THEME_DEFAULTS.accent); setDensity(p.density||THEME_DEFAULTS.density);
        setLeftWidth(p.leftWidth||THEME_DEFAULTS.leftWidth); setRightWidth(p.rightWidth||THEME_DEFAULTS.rightWidth);
      }
      const w = localStorage.getItem("mktintel_w"); if(w) setWatchlist(JSON.parse(w));
      const wm = localStorage.getItem("mktintel_wm"); if(wm) setWatchlistMeta(JSON.parse(wm));
    }catch{}
  },[]);
  useEffect(()=>{
    try{ localStorage.setItem("mktintel_theme_v4", JSON.stringify({
      mainBg,mainText,leftBg,leftText,rightBg,rightText,accent:accentKey,density,leftWidth,rightWidth
    })); }catch{}
  },[mainBg,mainText,leftBg,leftText,rightBg,rightText,accentKey,density,leftWidth,rightWidth]);
  useEffect(()=>{try{localStorage.setItem("mktintel_w",JSON.stringify(watchlist));}catch{}},[watchlist]);
  useEffect(()=>{try{localStorage.setItem("mktintel_wm",JSON.stringify(watchlistMeta));}catch{}},[watchlistMeta]);

  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);

  // Quotes (batched) + news
  const fetchQuotes = useCallback(async()=>{
    if(watchlist.length===0) return;
    const BATCH_SIZE = 8;
    const merged = {};
    for(let i=0;i<watchlist.length;i+=BATCH_SIZE){
      const batch = watchlist.slice(i,i+BATCH_SIZE);
      try{
        const qr = await fetch(`/api/quote?symbols=${batch.join(",")}`);
        if(qr.ok){ const d = await qr.json(); (d.data||[]).forEach(q=>{merged[q.symbol]=q;}); setDataErr(null); }
        else { const e = await qr.json(); setDataErr(e.error||"Quote error"); }
      }catch{ setDataErr("Network error"); }
      if(i+BATCH_SIZE<watchlist.length) await new Promise(r=>setTimeout(r,1100));
    }
    setQuotes(prev=>({...prev,...merged}));
    setLastUpd(Date.now());
  },[watchlist]);

  const fetchNews = useCallback(async()=>{
    try{
      const nr = await fetch(`/api/news?limit=25`);
      if(nr.ok){ const d = await nr.json(); setNews(d.data||[]); }
      setNewsLastUpd(Date.now());
    }catch{}
  },[]);

  const manualRefreshNews = useCallback(async()=>{
    setNewsRefreshing(true); await fetchNews(); setNewsRefreshing(false);
  },[fetchNews]);

  useEffect(()=>{ fetchQuotes(); fetchNews(); const t=setInterval(()=>{fetchQuotes();fetchNews();},60000); return()=>clearInterval(t); },[fetchQuotes,fetchNews]);

  // SEC data — lazy loaded when Data page first opened
  const loadSecData = useCallback(async()=>{
    setSecLoading(true);
    try{
      const syms = watchlist.slice(0,12).join(",");
      const r = await fetch(`/api/sec-filings?symbols=${syms}`);
      const d = await r.json();
      setSecData({ filings:d.filings||[], insiderTrades:d.insiderTrades||[] });
    }catch{ setSecData({ filings:[], insiderTrades:[] }); }
    finally{ setSecLoading(false); }
  },[watchlist]);

  useEffect(()=>{ if(view==="data" && !secData){ loadSecData(); } },[view,secData,loadSecData]);

  const ctx = useCallback(()=>({
    watchlist: watchlist.map(s=>({ symbol:s, name:watchlistMeta[s]||s, ...(quotes[s]||{}) })),
    news: news.slice(0,8).map(n=>({ headline:n.headline, source:n.source, datetime:n.datetime })),
    fetchedAt: lastUpd,
  }),[watchlist,watchlistMeta,quotes,news,lastUpd]);

  const callAPI = useCallback(async(prompt,isAlert,curMsgs)=>{
    setLoading(true);
    try{
      const history = (curMsgs||messages).map(m=>({ role:m.role, content:m.content }));
      const r = await fetch("/api/scan", { method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ messages:history, prompt, marketContext:ctx() }) });
      const d = await r.json();
      setMessages(p=>[...p,{ role:"assistant", content:d.text||d.error||"Analysis complete.", isAlertDive:isAlert }]);
    }catch{ setMessages(p=>[...p,{ role:"assistant", content:"⚠️ Connection error. Please retry." }]); }
    finally{ setLoading(false); }
  },[messages,ctx]);

  const send = useCallback(async()=>{
    if(!input.trim()||loading) return;
    const msg = input.trim(); setInput("");
    const nm = [...messages,{ role:"user", content:msg }];
    setMessages(nm); await callAPI(msg,false,nm);
  },[input,loading,callAPI,messages]);

  const handleQuick = useCallback(async(prompt,label)=>{
    if(loading) return;
    const nm = [...messages,{ role:"user", content:label }];
    setMessages(nm); await callAPI(prompt,false,nm);
  },[loading,callAPI,messages]);

  const handleWLClick = useCallback(async(q)=>{
    if(loading) return;
    const prompt = `DEEP DIVE — ${q.symbol} (${q.name||q.symbol})\nLive: $${q.price?.toFixed(2)}, ${q.changePercent?.toFixed(2)}% today, H$${q.high?.toFixed(2)} L$${q.low?.toFixed(2)}\n\nFull deep dive:\n▸ CATALYST\n▸ LEVELS\n▸ OPTIONS LANDSCAPE — IV rank\n▸ DIRECTION — CALL or PUT\n▸ PLAY — exact strike and expiry\n▸ ENTRY / TARGET / STOP\n▸ TIMEFRAME\n▸ SYMPATHY PLAYS\n▸ RISK\n▸ VERDICT — 🔥/⚡/👀`;
    const nm = [...messages,{ role:"user", content:`🔍 Deep dive: ${q.symbol} — $${q.price?.toFixed(2)} (${q.changePercent?.toFixed(2)}%)` }];
    setMessages(nm); await callAPI(prompt,true,nm);
  },[loading,callAPI,messages]);

  const handleNews = useCallback(async(item)=>{
    if(loading) return;
    const prompt = `Analyze this news and its market impact:\n"${item.headline}"\nSource: ${item.source}\n\nDirectly affected tickers? Sympathy plays? Priced in or still edge? Exact options plays with strike/expiry, IV rank, entry/target/stop.`;
    const nm = [...messages,{ role:"user", content:`📰 ${item.headline?.slice(0,65)}...` }];
    setMessages(nm); await callAPI(prompt,true,nm);
  },[loading,callAPI,messages]);

  const handleFiling = useCallback(async(f)=>{
    if(loading) return;
    const prompt = `SEC filing alert: ${f.symbol} filed a ${f.form} on ${f.date}. ${f.formName?`(${f.formName})`:""}\n\nWhat does this filing type typically signal? Bullish, bearish, or neutral read for ${f.symbol} right now? Quick, no fluff.`;
    const nm = [...messages,{ role:"user", content:`📋 ${f.symbol} filed ${f.form} on ${f.date}` }];
    setMessages(nm); await callAPI(prompt,true,nm);
  },[loading,callAPI,messages]);

  const handleInsider = useCallback(async(t)=>{
    if(loading) return;
    const prompt = `Insider Form 4 filed for ${t.symbol} on ${t.date}.\n\nWhat's the typical read on insider Form 4 activity here? Worth a closer look — bullish or bearish signal? Quick take.`;
    const nm = [...messages,{ role:"user", content:`👤 ${t.symbol} insider Form 4 — ${t.date}` }];
    setMessages(nm); await callAPI(prompt,true,nm);
  },[loading,callAPI,messages]);

  const addWL = (symbol,name) => {
    setWatchlist(p => p.includes(symbol) ? p : [...p,symbol]);
    setWatchlistMeta(p => ({ ...p,[symbol]: name || COMPANY_NAMES[symbol] || symbol }));
  };
  const rmWL = (symbol) => setWatchlist(p => p.filter(x=>x!==symbol));
  const resetWL = () => { setWatchlist(DEFAULT_WATCHLIST); setWatchlistMeta(buildDefaultMeta()); };
  const resetAll = () => {
    setMainBg(THEME_DEFAULTS.mainBg); setMainText(THEME_DEFAULTS.mainText);
    setLeftBg(THEME_DEFAULTS.leftBg); setLeftText(THEME_DEFAULTS.leftText);
    setRightBg(THEME_DEFAULTS.rightBg); setRightText(THEME_DEFAULTS.rightText);
    setAccentKey(THEME_DEFAULTS.accent); setDensity(THEME_DEFAULTS.density);
    setLeftWidth(THEME_DEFAULTS.leftWidth); setRightWidth(THEME_DEFAULTS.rightWidth);
  };
  const handleKey = (e) => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } };
  const tapeDuration = Math.max(35, watchlist.length * 2.2);
  const rowPad = density==="compact" ? 6 : 9;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Source+Serif+4:wght@400;500;600;700&family=Fraunces:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#5557;border-radius:3px;}
        @keyframes tickerScroll{from{transform:translateX(0);}to{transform:translateX(-50%);}}
        @keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.85);}50%{opacity:1;transform:scale(1.1);}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
        @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
        @keyframes scanLine{0%,100%{opacity:0.3;}50%{opacity:1;}}
        textarea:focus,input:focus{outline:none;}textarea{resize:none;}button{cursor:pointer;border:none;background:none;}
      `}</style>
      <div style={{ display:"flex",flexDirection:"column",height:"100vh",background:T.bg,fontFamily:FONT_CHAT,overflow:"hidden" }}>

        {showWL && <WatchlistModal onClose={()=>setShowWL(false)} watchlist={watchlist} onAdd={addWL} onRemove={rmWL} onReset={resetWL} accent={accent} T={TL}/>}
        {showSettings && <SettingsPanel onClose={()=>setShowSettings(false)}
          mainBg={mainBg} setMainBg={setMainBg} mainText={mainText} setMainText={setMainText}
          leftBg={leftBg} setLeftBg={setLeftBg} leftText={leftText} setLeftText={setLeftText}
          rightBg={rightBg} setRightBg={setRightBg} rightText={rightText} setRightText={setRightText}
          accentKey={accentKey} setAccentKey={setAccentKey}
          density={density} setDensity={setDensity}
          leftWidth={leftWidth} setLeftWidth={setLeftWidth} rightWidth={rightWidth} setRightWidth={setRightWidth}
          onResetAll={resetAll} T={T} accent={accent}/>}

        {/* TOP HEADER — persistent across both pages */}
        <div style={{ padding:"10px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:T.panel,flexShrink:0 }}>
          <div style={{ display:"flex",alignItems:"baseline",gap:16 }}>
            <button onClick={()=>setView("terminal")} style={{ cursor:"pointer" }}>
              <span style={{ fontFamily:FONT_DISPLAY,fontSize:19,fontWeight:700,letterSpacing:0.3,
                color:view==="terminal"?T.text:T.dim, transition:"color 0.15s" }}>Trading Terminal</span>
            </button>
            <button onClick={()=>setView("data")} style={{ cursor:"pointer" }}>
              <span style={{ fontFamily:FONT_DISPLAY,fontSize:19,fontWeight:700,letterSpacing:0.3,
                color:view==="data"?accent:T.dim, transition:"color 0.15s" }}>Data</span>
            </button>
            <span style={{ fontFamily:FONT_MONO,fontSize:8,color:accent,background:`${accent}10`,border:`1px solid ${accent}22`,padding:"2px 6px",borderRadius:4,letterSpacing:2,fontWeight:700 }}>LIVE</span>
          </div>
          <button onClick={()=>setShowSettings(true)}
            style={{ width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:T.dim,background:T.surface,border:`1px solid ${T.border}`,cursor:"pointer" }}>⚙</button>
        </div>

        <div style={{ display:"flex",flex:1,overflow:"hidden" }}>

          {/* LEFT — Watchlist only, always visible */}
          <div style={{ width:leftWidth,minWidth:leftWidth,borderRight:`1px solid ${TL.border}`,display:"flex",flexDirection:"column",background:TL.panel }}>
            <div style={{ padding:"11px 12px 9px",borderBottom:`1px solid ${TL.border}` }}>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
                <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                  <div style={{ width:7,height:7,borderRadius:"50%",background:dataErr?"#ff4d6d":accent,boxShadow:dataErr?"none":`0 0 8px ${accent}` }}/>
                  <span style={{ fontFamily:FONT_SANS,fontSize:14,fontWeight:700,color:TL.text,letterSpacing:0.2 }}>Watchlist</span>
                </div>
                <span style={{ fontFamily:FONT_MONO,fontSize:8,color:TL.dim }}>{lastUpd?new Date(lastUpd).toLocaleTimeString():"—"}</span>
              </div>
              {dataErr && <div style={{ fontFamily:FONT_MONO,fontSize:9,color:"#ff4d6d",background:"rgba(255,77,109,0.07)",border:"1px solid rgba(255,77,109,0.18)",borderRadius:5,padding:"4px 8px",marginBottom:7 }}>⚠ {dataErr}</div>}
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <span style={{ fontFamily:FONT_MONO,fontSize:8,color:TL.dim,letterSpacing:2,fontWeight:700 }}>{watchlist.length} TICKERS</span>
                <button onClick={()=>setShowWL(true)}
                  style={{ fontFamily:FONT_MONO,fontSize:9,color:accent,background:`${accent}0e`,border:`1px solid ${accent}22`,borderRadius:5,padding:"3px 9px",fontWeight:700,cursor:"pointer" }}>★ EDIT</button>
              </div>
            </div>
            <div style={{ flex:1,overflowY:"auto",padding:"7px 9px" }}>
              {watchlist.map(s=>(
                <WatchlistRow key={s} symbol={s} quote={quotes[s]} name={watchlistMeta[s]} onClick={handleWLClick} T={TL} density={density}/>
              ))}
            </div>
            <div style={{ padding:"5px 12px",borderTop:`1px solid ${TL.border}`,display:"flex",justifyContent:"space-between" }}>
              <span style={{ fontFamily:FONT_MONO,fontSize:8,color:TL.dim,letterSpacing:1 }}>AUTO 60S</span>
              <span style={{ fontFamily:FONT_MONO,fontSize:8,color:TL.dim,animation:"scanLine 3s infinite" }}>● LIVE</span>
            </div>
          </div>

          {/* MAIN AREA — switches between Terminal and Data */}
          {view==="terminal" ? (
            <>
              <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
                <div style={{ borderBottom:`1px solid ${T.border}`,background:T.surface,overflow:"hidden",height:46,display:"flex",alignItems:"center" }}>
                  <div style={{ display:"flex",alignItems:"center",animation:`tickerScroll ${tapeDuration}s linear infinite`,whiteSpace:"nowrap" }}>
                    {[...watchlist,...watchlist].map((sym,i)=>{
                      const q = quotes[sym]; const up = q && (q.changePercent??0)>=0;
                      return (
                        <div key={i} style={{ display:"flex",alignItems:"center",gap:8,padding:"0 22px",borderRight:`1px solid ${T.border}` }}>
                          <span style={{ fontFamily:FONT_MONO,fontSize:14,fontWeight:700,color:T.textDim,letterSpacing:1.5 }}>{sym}</span>
                          <span style={{ fontFamily:FONT_MONO,fontSize:13,color:T.text,fontWeight:500 }}>{q?.price!=null?`$${q.price.toFixed(2)}`:"—"}</span>
                          <span style={{ fontFamily:FONT_MONO,fontSize:12,fontWeight:700,color:up?"#00d4aa":"#ff4d6d" }}>
                            {q?.changePercent!=null?`${up?"▲":"▼"} ${Math.abs(q.changePercent).toFixed(2)}%`:""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ flex:1,overflowY:"auto",padding:"14px 18px" }}>
                  {messages.map((msg,i)=><ChatMessage key={i} msg={msg} accent={accent} T={T}/>)}
                  {loading && <TypingIndicator accent={accent}/>}
                  <div ref={chatEndRef}/>
                </div>

                <QuickActions onAction={handleQuick} accent={accent} T={T}/>

                <div style={{ padding:"7px 18px 13px",borderTop:`1px solid ${T.border}` }}>
                  <div style={{ display:"flex",alignItems:"flex-end",gap:8,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 12px" }}
                    onFocusCapture={e=>e.currentTarget.style.borderColor=`${accent}32`}
                    onBlurCapture={e=>e.currentTarget.style.borderColor=T.border}>
                    <span style={{ fontFamily:FONT_MONO,fontSize:12,color:accent,paddingBottom:1,animation:"blink 1.2s infinite" }}>▸</span>
                    <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
                      placeholder="Ask the desk anything..." rows={1}
                      style={{ flex:1,background:"transparent",border:"none",color:T.text,fontFamily:FONT_CHAT,fontSize:14,lineHeight:1.5,maxHeight:100,overflowY:"auto" }}
                      onInput={e=>{ e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,100)+"px"; }}/>
                    <button onClick={send} disabled={!input.trim()||loading}
                      style={{ width:28,height:28,borderRadius:6,flexShrink:0,
                        background:input.trim()&&!loading?`${accent}12`:"transparent",
                        border:`1px solid ${input.trim()&&!loading?`${accent}28`:T.border}`,
                        color:input.trim()&&!loading?accent:T.dim, display:"flex",alignItems:"center",justifyContent:"center",fontSize:13 }}>▸</button>
                  </div>
                  <div style={{ display:"flex",justifyContent:"space-between",marginTop:3,padding:"0 2px" }}>
                    <span style={{ fontFamily:FONT_MONO,fontSize:7.5,color:T.dim,letterSpacing:1 }}>SHIFT+ENTER FOR NEW LINE</span>
                    <span style={{ fontFamily:FONT_MONO,fontSize:7.5,color:T.dim,letterSpacing:1 }}>NOT FINANCIAL ADVICE</span>
                  </div>
                </div>
              </div>

              <div style={{ width:rightWidth,minWidth:rightWidth,borderLeft:`1px solid ${TR.border}` }}>
                <RightPanel news={news} onDiveDeep={handleNews} onRefresh={manualRefreshNews} refreshing={newsRefreshing} lastUpd={newsLastUpd} accent={accent} T={TR} density={density}/>
              </div>
            </>
          ) : (
            <DataPage
              news={news} secData={secData} secLoading={secLoading}
              onRefreshAll={()=>{fetchNews();loadSecData();}}
              onDiveNews={handleNews} onDiveFiling={handleFiling} onDiveInsider={handleInsider}
              messages={messages} input={input} setInput={setInput} send={send} loading={loading}
              onOpenChat={()=>setView("terminal")} accent={accent} T={T}/>
          )}
        </div>
      </div>
    </>
  );
}