"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── COLOR HELPERS ────────────────────────────────────────────────────────────
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
const COLOR_PRESETS = [
  { label: "Terminal", bg: "#060910", text: "#c8d8e8" },
  { label: "Midnight", bg: "#020408", text: "#a8c0d0" },
  { label: "Slate",    bg: "#11141c", text: "#d4dce6" },
  { label: "Carbon",   bg: "#0d0d0d", text: "#dcdcdc" },
  { label: "Paper",    bg: "#f5f3ee", text: "#1a1a1a" },
  { label: "Arctic",   bg: "#eef2f7", text: "#0f1620" },
];
const ACCENTS = { teal: "#00d4aa", blue: "#7eb8f7", purple: "#a78bfa", orange: "#ff6b35", gold: "#f7c948", red: "#ff4d6d" };

// ─── TICKER UNIVERSE ──────────────────────────────────────────────────────────
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
  const m = {};
  DEFAULT_WATCHLIST.forEach(s => { m[s] = COMPANY_NAMES[s] || s; });
  return m;
}

const CONVICTION = {
  high:{label:"🔥 HIGH",color:"#ff6b35",bg:"rgba(255,107,53,0.12)",border:"rgba(255,107,53,0.35)"},
  medium:{label:"⚡ MED",color:"#f7c948",bg:"rgba(247,201,72,0.10)",border:"rgba(247,201,72,0.30)"},
  low:{label:"👀 WATCH",color:"#7eb8f7",bg:"rgba(126,184,247,0.08)",border:"rgba(126,184,247,0.25)"},
};
const DIR_CLR = { PUMP:"#00d4aa", DUMP:"#ff4d6d", WATCH:"#f7c948" };
const TRUMP_RE = /trump|truth social|tariff|executive order|maga|mar-a-lago|president trump|trade war/i;

const RADAR = [
  {ticker:"IONQ",dir:"PUMP",pct:"+18%",reason:"IBM partnership leak + short squeeze setup",conviction:"high",strike:"$14C Jul 18"},
  {ticker:"RKLB",dir:"PUMP",pct:"+22%",reason:"DoD contract rumor + low float breakout",conviction:"medium",strike:"$28C Jun 27"},
  {ticker:"SMCI",dir:"DUMP",pct:"-15%",reason:"SEC inquiry + insider selling $8M",conviction:"high",strike:"$35P Jun 27"},
  {ticker:"NVDA",dir:"PUMP",pct:"+8%", reason:"$420M dark pool accumulation, 3rd print",conviction:"high",strike:"$140C Jun 27"},
  {ticker:"AMD", dir:"DUMP",pct:"-7%", reason:"Dark pool bearish block ahead of earnings",conviction:"medium",strike:"$150P Jun 20"},
  {ticker:"MSTR",dir:"PUMP",pct:"+9%", reason:"BTC whale buy + ETF inflows accelerating",conviction:"medium",strike:"$420C Jul 18"},
];
const FLOW = [
  {time:"10:42",side:"BUY", size:"$2.4M",ticker:"NVDA",type:"SWEEP",venue:"CBOE"},
  {time:"10:38",side:"BUY", size:"$880K",ticker:"IONQ",type:"BLOCK",venue:"DARK"},
  {time:"10:31",side:"SELL",size:"$1.1M",ticker:"SMCI",type:"SWEEP",venue:"PHLX"},
  {time:"10:28",side:"BUY", size:"$540K",ticker:"PLTR",type:"BLOCK",venue:"DARK"},
  {time:"10:22",side:"BUY", size:"$3.2M",ticker:"META",type:"SWEEP",venue:"ISE"},
  {time:"10:18",side:"SELL",size:"$720K",ticker:"AMD", type:"BLOCK",venue:"DARK"},
];

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

// ─── COMPONENTS ───────────────────────────────────────────────────────────────
function TypingIndicator({ accent }) {
  return (
    <div style={{ display:"flex",alignItems:"center",gap:8,padding:"8px 14px" }}>
      <span style={{ color:accent,fontSize:10,fontFamily:"'JetBrains Mono',monospace",letterSpacing:2,fontWeight:700 }}>ANALYZING</span>
      {[0,1,2].map(i=>(<div key={i} style={{ width:4,height:4,borderRadius:"50%",background:accent,animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>))}
    </div>
  );
}

function ChatMessage({ msg, accent, T }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display:"flex",flexDirection:"column",alignItems:isUser?"flex-end":"flex-start",marginBottom:8 }}>
      <div style={{ display:"flex",alignItems:"center",gap:5,marginBottom:3 }}>
        {!isUser && <span style={{ color:msg.isAlertDive?"#a78bfa":accent,fontSize:9,fontFamily:"'JetBrains Mono',monospace",letterSpacing:2,fontWeight:700 }}>{msg.isAlertDive?"◆ INTEL":"◈ DESK"}</span>}
        {isUser && <span style={{ color:T.dim,fontSize:9,fontFamily:"'JetBrains Mono',monospace",letterSpacing:2,fontWeight:700 }}>YOU ◈</span>}
      </div>
      <div style={{ maxWidth:"91%",
        background:isUser?`${accent}10`:msg.isAlertDive?"rgba(167,139,250,0.08)":"rgba(127,127,127,0.06)",
        border:isUser?`1px solid ${accent}28`:msg.isAlertDive?"1px solid rgba(167,139,250,0.22)":`1px solid ${T.border}`,
        borderRadius:isUser?"12px 12px 3px 12px":"3px 12px 12px 12px",padding:"9px 13px" }}>
        <p style={{ color:isUser?T.text:T.textDim,fontSize:12.5,lineHeight:1.58,margin:0,fontFamily:"'Inter',sans-serif",whiteSpace:"pre-wrap" }}>{msg.content}</p>
      </div>
    </div>
  );
}

function QuickActions({ onAction, accent, T }) {
  const [open,setOpen] = useState(null);
  return (
    <div style={{ padding:"7px 16px 9px",borderTop:`1px solid ${T.border}`,background:T.panel }}>
      <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
        <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700 }}>QUICK ACTIONS</span>
        <div style={{ flex:1,height:1,background:T.border }}/>
      </div>
      <div style={{ display:"flex",gap:5,flexWrap:"wrap",marginBottom:open!==null?7:0 }}>
        {QA_GROUPS.map((g,gi)=>(
          <button key={gi} onClick={()=>setOpen(open===gi?null:gi)}
            style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,
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
              style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:QA_GROUPS[open].color,
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

function WatchlistRow({ symbol, quote, name, onClick, T }) {
  if (!quote) {
    return (
      <div style={{ padding:"8px 10px",borderRadius:7,marginBottom:5,background:T.surface,border:`1px solid ${T.border}` }}>
        <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:T.dim }}>{symbol} loading...</span>
      </div>
    );
  }
  if (quote.error) {
    return (
      <div style={{ padding:"8px 10px",borderRadius:7,marginBottom:5,background:T.surface,border:`1px solid ${T.border}` }}>
        <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:"#ff4d6d" }}>{symbol} — {quote.error}</span>
      </div>
    );
  }
  const up = (quote.changePercent ?? 0) >= 0;
  const clr = up ? "#00d4aa" : "#ff4d6d";
  return (
    <div onClick={()=>onClick({ symbol, name, ...quote })}
      style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 10px",borderRadius:7,marginBottom:5,
        background:T.surface,border:`1px solid ${T.border}`,cursor:"pointer",transition:"background 0.12s" }}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(127,127,127,0.08)"}
      onMouseLeave={e=>e.currentTarget.style.background=T.surface}
    >
      <div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:12.5,color:T.text,letterSpacing:1 }}>{symbol}</div>
        <div style={{ fontFamily:"'Inter',sans-serif",fontSize:10,color:T.dim,marginTop:1 }}>{(name||symbol).slice(0,20)}</div>
      </div>
      <div style={{ textAlign:"right" }}>
        <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:12.5,fontWeight:700,color:T.text }}>{quote.price!=null?`$${quote.price.toFixed(2)}`:"—"}</div>
        <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,color:clr }}>
          {quote.changePercent!=null?`${up?"▲":"▼"} ${Math.abs(quote.changePercent).toFixed(2)}%`:""}
        </div>
      </div>
    </div>
  );
}

function NewsCard({ item, onDiveDeep, T }) {
  const isTrump = TRUMP_RE.test((item.headline||"")+(item.summary||""));
  const age = item.datetime ? Math.round((Date.now()-item.datetime)/60000) : null;
  const ageLabel = age==null?"":age<1?"just now":age<60?`${age}m ago`:`${Math.round(age/60)}h ago`;
  const bc = isTrump ? "#ff6b35" : "#f7c948";
  return (
    <div onClick={()=>onDiveDeep(item)}
      style={{ background:`${bc}08`,border:`1px solid ${bc}1a`,borderLeft:`3px solid ${bc}`,borderRadius:7,padding:"9px 11px",marginBottom:6,cursor:"pointer",transition:"all 0.13s" }}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(127,127,127,0.08)"}
      onMouseLeave={e=>e.currentTarget.style.background=`${bc}08`}
    >
      <div style={{ display:"flex",justifyContent:"space-between",marginBottom:4 }}>
        <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:bc,letterSpacing:1,fontWeight:700 }}>{isTrump?"🦅 ":""}{item.source?.toUpperCase()}</span>
        <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.dim }}>{ageLabel}</span>
      </div>
      <p style={{ color:T.textDim,fontSize:11.5,lineHeight:1.42,margin:0,fontFamily:"'Inter',sans-serif",fontWeight:500 }}>{item.headline}</p>
    </div>
  );
}

// ─── WATCHLIST MODAL ──────────────────────────────────────────────────────────
function WatchlistModal({ onClose, watchlist, watchlistMeta, onAdd, onRemove, onReset, accent, T }) {
  const [q,setQ] = useState("");
  const [results,setResults] = useState([]);
  const [searching,setSearching] = useState(false);

  const doSearch = useCallback(async(query)=>{
    if(!query.trim()){setResults([]);return;}
    setSearching(true);
    try{
      const r = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      const d = await r.json();
      setResults(d.data||[]);
    }catch{setResults([]);}finally{setSearching(false);}
  },[]);

  useEffect(()=>{const t=setTimeout(()=>doSearch(q),350);return()=>clearTimeout(t);},[q,doSearch]);

  const quickAdds = POPULAR_PICKS.filter(s=>!watchlist.includes(s)).slice(0,16);

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20 }}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ width:460,maxHeight:"86vh",overflowY:"auto",background:T.panel,border:`1px solid ${accent}35`,borderRadius:16,padding:24,boxShadow:`0 0 50px ${accent}18` }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700,color:accent,letterSpacing:2 }}>★ MANAGE WATCHLIST</span>
          <button onClick={onClose} style={{ color:T.dim,fontSize:17,cursor:"pointer" }}>✕</button>
        </div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="SEARCH ANY COMPANY OR TICKER..."
          style={{ width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",
            color:T.text,fontFamily:"'JetBrains Mono',monospace",fontSize:12,letterSpacing:1,marginBottom:10 }}/>

        {searching && <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:T.dim,marginBottom:8 }}>SEARCHING...</div>}

        {results.length>0 && (
          <div style={{ marginBottom:14,borderRadius:8,overflow:"hidden",border:`1px solid ${T.border}` }}>
            {results.map(r=>(
              <div key={r.symbol} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderBottom:`1px solid ${T.border}`,background:T.surface }}>
                <div style={{ minWidth:0,flex:1 }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:T.text,fontSize:13 }}>{r.symbol}</span>
                  <span style={{ fontFamily:"'Inter',sans-serif",fontSize:10,color:T.dim,marginLeft:8 }}>{(r.name||"").slice(0,28)}</span>
                </div>
                {watchlist.includes(r.symbol)
                  ? <button onClick={()=>onRemove(r.symbol)} style={{ background:"rgba(255,77,109,0.12)",border:"1px solid rgba(255,77,109,0.28)",color:"#ff4d6d",borderRadius:5,padding:"2px 9px",fontFamily:"'JetBrains Mono',monospace",fontSize:10,cursor:"pointer",fontWeight:700,flexShrink:0 }}>REMOVE</button>
                  : <button onClick={()=>{onAdd(r.symbol,r.name);}} style={{ background:`${accent}12`,border:`1px solid ${accent}28`,color:accent,borderRadius:5,padding:"2px 9px",fontFamily:"'JetBrains Mono',monospace",fontSize:10,cursor:"pointer",fontWeight:700,flexShrink:0 }}>+ ADD</button>
                }
              </div>
            ))}
          </div>
        )}

        {results.length===0 && !searching && (
          <div style={{ marginBottom:14 }}>
            <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:8 }}>QUICK ADD — POPULAR</div>
            <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
              {quickAdds.map(s=>(
                <button key={s} onClick={()=>onAdd(s,COMPANY_NAMES[s])}
                  style={{ display:"flex",alignItems:"center",gap:4,background:`${accent}0a`,border:`1px solid ${accent}20`,
                    borderRadius:6,padding:"4px 9px",cursor:"pointer" }}>
                  <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:T.text }}>{s}</span>
                  <span style={{ color:accent,fontSize:11,fontWeight:700 }}>+</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700 }}>CURRENT ({watchlist.length})</span>
          <button onClick={onReset} style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.dim,letterSpacing:1,cursor:"pointer",textDecoration:"underline" }}>RESET TO DEFAULT</button>
        </div>
        <div style={{ display:"flex",flexWrap:"wrap",gap:5 }}>
          {watchlist.map(s=>(
            <div key={s} style={{ display:"flex",alignItems:"center",gap:4,background:`${accent}0f`,border:`1px solid ${accent}22`,borderRadius:5,padding:"3px 9px" }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:accent,fontWeight:700 }}>{s}</span>
              <button onClick={()=>onRemove(s)} style={{ color:T.dim,fontSize:11,cursor:"pointer",lineHeight:1,paddingLeft:2 }}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────
function SettingsPanel({ onClose, bgColor, setBgColor, textColor, setTextColor, accentKey, setAccentKey, onResetColors, T, accent }) {
  const [bgDraft,setBgDraft] = useState(bgColor);
  const [textDraft,setTextDraft] = useState(textColor);
  useEffect(()=>setBgDraft(bgColor),[bgColor]);
  useEffect(()=>setTextDraft(textColor),[textColor]);

  const commitBg = v => { setBgDraft(v); if(/^#[0-9a-fA-F]{6}$/.test(v)) setBgColor(v); };
  const commitText = v => { setTextDraft(v); if(/^#[0-9a-fA-F]{6}$/.test(v)) setTextColor(v); };

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1000,display:"flex",justifyContent:"flex-end" }}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ width:300,height:"100vh",background:T.panel,borderLeft:`1px solid ${T.border}`,padding:26,overflowY:"auto",boxShadow:"-8px 0 40px rgba(0,0,0,0.6)" }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
          <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,color:accent,letterSpacing:3 }}>⚙ SETTINGS</span>
          <button onClick={onClose} style={{ color:T.dim,fontSize:17,cursor:"pointer" }}>✕</button>
        </div>

        {/* Live preview */}
        <div style={{ padding:"12px 14px",borderRadius:9,background:T.bg,border:`1px solid ${T.border}`,marginBottom:22 }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:13,fontWeight:700,color:T.text,marginBottom:4 }}>MKTINTEL <span style={{color:accent}}>●</span></div>
          <div style={{ fontFamily:"'Inter',sans-serif",fontSize:11,color:T.textDim }}>Preview of your current theme</div>
        </div>

        {/* Accent */}
        <div style={{ marginBottom:22 }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:10 }}>ACCENT COLOR</div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
            {Object.entries(ACCENTS).map(([k,c])=>(
              <button key={k} onClick={()=>setAccentKey(k)}
                style={{ width:32,height:32,borderRadius:8,background:c,cursor:"pointer",
                  border:accentKey===k?"3px solid #ffffff":"3px solid transparent",
                  boxShadow:accentKey===k?`0 0 14px ${c}`:"" }}/>
            ))}
          </div>
        </div>

        {/* Background */}
        <div style={{ marginBottom:22 }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:10 }}>BACKGROUND COLOR</div>
          <div style={{ display:"flex",gap:8,marginBottom:9 }}>
            <input type="color" value={bgColor} onChange={e=>setBgColor(e.target.value)}
              style={{ width:38,height:32,border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer",padding:0,background:"transparent" }}/>
            <input type="text" value={bgDraft} onChange={e=>commitBg(e.target.value)}
              style={{ flex:1,background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",
                color:T.text,fontFamily:"'JetBrains Mono',monospace",fontSize:11 }}/>
          </div>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
            {COLOR_PRESETS.map(p=>(
              <button key={p.label} title={p.label} onClick={()=>{setBgColor(p.bg);setTextColor(p.text);}}
                style={{ width:24,height:24,borderRadius:6,background:p.bg,cursor:"pointer",
                  border:`2px solid ${bgColor===p.bg?accent:T.border}` }}/>
            ))}
          </div>
        </div>

        {/* Text */}
        <div style={{ marginBottom:22 }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:10 }}>TEXT COLOR</div>
          <div style={{ display:"flex",gap:8 }}>
            <input type="color" value={textColor} onChange={e=>setTextColor(e.target.value)}
              style={{ width:38,height:32,border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer",padding:0,background:"transparent" }}/>
            <input type="text" value={textDraft} onChange={e=>commitText(e.target.value)}
              style={{ flex:1,background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,padding:"6px 10px",
                color:T.text,fontFamily:"'JetBrains Mono',monospace",fontSize:11 }}/>
          </div>
        </div>

        <button onClick={onResetColors}
          style={{ width:"100%",padding:"9px",borderRadius:7,background:"transparent",border:`1px solid ${T.border}`,
            color:T.dim,fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer",marginBottom:18 }}>
          RESET TO DEFAULT THEME
        </button>

        <div style={{ padding:"12px",borderRadius:8,background:T.surface,border:`1px solid ${T.border}` }}>
          <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.dim,letterSpacing:0.5,lineHeight:1.7 }}>
            This terminal is a proprietary research intelligence system.<br/>
            ⚠️ Not financial advice. All setups are probability-based analysis.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── RIGHT PANEL ──────────────────────────────────────────────────────────────
function RightPanel({ trumpNews, onDiveDeep, onTickerClick, accent, T }) {
  const [tab,setTab] = useState("trump");
  const [radar,setRadar] = useState(RADAR);
  const [pulse,setPulse] = useState(false);

  useEffect(()=>{
    const t=setInterval(()=>{ setPulse(true);setTimeout(()=>setPulse(false),500); setRadar(p=>[...p].sort(()=>Math.random()-0.5)); },9000);
    return()=>clearInterval(t);
  },[]);

  const TABS=[{id:"trump",label:"🦅 TRUMP"},{id:"radar",label:"📡 RADAR"},{id:"flow",label:"⚡ FLOW"}];
  return (
    <div style={{ width:310,minWidth:310,borderLeft:`1px solid ${T.border}`,display:"flex",flexDirection:"column",background:T.panel }}>
      <div style={{ display:"flex",borderBottom:`1px solid ${T.border}` }}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ flex:1,padding:"10px 3px",fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,letterSpacing:0.5,
              color:tab===t.id?accent:T.dim, background:tab===t.id?`${accent}07`:"transparent",
              borderBottom:tab===t.id?`2px solid ${accent}`:"2px solid transparent", border:"none",cursor:"pointer" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==="trump" && (
        <div style={{ display:"flex",flexDirection:"column",flex:1,overflow:"hidden" }}>
          <div style={{ padding:"9px 13px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:8 }}>
            <div style={{ width:7,height:7,borderRadius:"50%",background:"#ff6b35",boxShadow:"0 0 8px #ff6b35",animation:"pulse 1.8s ease-in-out infinite" }}/>
            <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:"#ff6b35",letterSpacing:2 }}>TRUMP / TRUTH SOCIAL</span>
          </div>
          <div style={{ flex:1,overflowY:"auto",padding:"7px 9px" }}>
            {trumpNews.length===0 && <div style={{ padding:14,textAlign:"center",fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:T.dim }}>NO TRUMP SIGNALS IN CURRENT NEWS FEED</div>}
            {trumpNews.map((item,i)=><NewsCard key={item.id||i} item={item} onDiveDeep={onDiveDeep} T={T}/>)}
            <button onClick={()=>onDiveDeep({ headline:"",source:"AI SEARCH",datetime:Date.now(),isTrumpSearch:true })}
              style={{ width:"100%",marginTop:8,padding:"9px",background:"rgba(255,107,53,0.09)",border:"1px solid rgba(255,107,53,0.28)",
                borderRadius:7,color:"#ff6b35",fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,cursor:"pointer",letterSpacing:1 }}>
              🦅 AI: SEARCH TRUTH SOCIAL NOW
            </button>
          </div>
        </div>
      )}

      {tab==="radar" && (
        <div style={{ display:"flex",flexDirection:"column",flex:1,overflow:"hidden" }}>
          <div style={{ padding:"9px 13px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between" }}>
            <div style={{ display:"flex",alignItems:"center",gap:7 }}>
              <div style={{ width:7,height:7,borderRadius:"50%",background:pulse?"#ff6b35":"#7a3012",boxShadow:pulse?"0 0 10px #ff6b35":"none" }}/>
              <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:"#ff6b35",letterSpacing:2 }}>PUMP / DUMP RADAR</span>
            </div>
            <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.dim }}>● LIVE</span>
          </div>
          <div style={{ flex:1,overflowY:"auto",padding:"7px 9px" }}>
            {radar.map((r,i)=>{
              const dc=DIR_CLR[r.dir]; const cv=CONVICTION[r.conviction];
              return (
                <div key={r.ticker+i} onClick={()=>onTickerClick(r.ticker,r)}
                  style={{ background:cv.bg,border:`1px solid ${cv.border}`,borderLeft:`3px solid ${dc}`,borderRadius:7,padding:"9px 11px",marginBottom:6,cursor:"pointer" }}
                  onMouseEnter={e=>{e.currentTarget.style.background="rgba(127,127,127,0.08)";}}
                  onMouseLeave={e=>{e.currentTarget.style.background=cv.bg;}}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:14,color:dc,letterSpacing:1 }}>{r.ticker}</span>
                      <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,fontWeight:700,color:dc,background:`${dc}16`,border:`1px solid ${dc}28`,padding:"1px 6px",borderRadius:4 }}>{r.dir}</span>
                    </div>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:14,fontWeight:700,color:dc }}>{r.pct}</span>
                  </div>
                  <p style={{ color:T.textDim,fontSize:11,lineHeight:1.38,margin:"0 0 5px",fontFamily:"'Inter',sans-serif" }}>{r.reason}</p>
                  <div style={{ display:"flex",justifyContent:"space-between" }}>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:dc,fontWeight:700 }}>{r.strike}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:cv.color }}>{cv.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab==="flow" && (
        <div style={{ display:"flex",flexDirection:"column",flex:1,overflow:"hidden" }}>
          <div style={{ padding:"9px 13px",borderBottom:`1px solid ${T.border}` }}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:"#7eb8f7",letterSpacing:2 }}>LIVE ORDER FLOW</span>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"46px 48px 60px 52px 56px 42px",padding:"7px 13px",borderBottom:`1px solid ${T.border}`,background:T.surface }}>
            {["TIME","SIDE","SIZE","TICKER","TYPE","VENUE"].map(h=>(<span key={h} style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.dim,letterSpacing:1,fontWeight:700 }}>{h}</span>))}
          </div>
          <div style={{ flex:1,overflowY:"auto" }}>
            {FLOW.map((f,i)=>(
              <div key={i} onClick={()=>onTickerClick(f.ticker,{ dir:f.side==="BUY"?"PUMP":"DUMP",pct:"",reason:`${f.type} ${f.side} ${f.size} at ${f.venue}`,conviction:"medium",strike:"" })}
                style={{ display:"grid",gridTemplateColumns:"46px 48px 60px 52px 56px 42px",padding:"9px 13px",borderBottom:`1px solid ${T.border}`,cursor:"pointer",alignItems:"center" }}
                onMouseEnter={e=>e.currentTarget.style.background="rgba(127,127,127,0.05)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:T.dim }}>{f.time}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,color:f.side==="BUY"?"#00d4aa":"#ff4d6d" }}>{f.side}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:T.textDim,fontWeight:600 }}>{f.size}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700,color:T.text }}>{f.ticker}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,fontWeight:700,color:f.type==="SWEEP"?"#f7c948":"#a78bfa",
                  background:f.type==="SWEEP"?"rgba(247,201,72,0.1)":"rgba(167,139,250,0.1)",padding:"2px 5px",borderRadius:3 }}>{f.type}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:T.dim }}>{f.venue}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
export default function MarketTerminal() {
  const [bgColor,setBgColor] = useState(DEFAULT_BG);
  const [textColor,setTextColor] = useState(DEFAULT_TEXT);
  const [accentKey,setAccentKey] = useState("teal");
  const [watchlist,setWatchlist] = useState(DEFAULT_WATCHLIST);
  const [watchlistMeta,setWatchlistMeta] = useState(buildDefaultMeta());
  const [showWL,setShowWL] = useState(false);
  const [showSettings,setShowSettings] = useState(false);
  const [quotes,setQuotes] = useState({});
  const [news,setNews] = useState([]);
  const [trumpNews,setTrumpNews] = useState([]);
  const [messages,setMessages] = useState([
    { role:"assistant",content:"MKTINTEL DESK ONLINE.\n\nYou have full access to a proprietary hedge fund intelligence system. This desk identifies edge, timing, and high-probability setups with precision.\n\nThis is not financial advice — this is your asymmetric edge.\n\nLive data connected via Finnhub. Customize your watchlist with the ★ button, and your theme with the ⚙ button.\n\nClick any ticker, news headline, Trump feed item, or radar signal for instant deep dive." }
  ]);
  const [input,setInput] = useState("");
  const [loading,setLoading] = useState(false);
  const [lastUpd,setLastUpd] = useState(null);
  const [dataErr,setDataErr] = useState(null);
  const [leftTab,setLeftTab] = useState("watchlist");
  const chatEndRef = useRef(null);

  const T = useMemo(()=>deriveTheme(bgColor,textColor),[bgColor,textColor]);
  const accent = ACCENTS[accentKey] || ACCENTS.teal;

  useEffect(()=>{
    try{
      const s = localStorage.getItem("mktintel_s");
      if(s){ const p=JSON.parse(s); setBgColor(p.bg||DEFAULT_BG); setTextColor(p.text||DEFAULT_TEXT); setAccentKey(p.accent||"teal"); }
      const w = localStorage.getItem("mktintel_w");
      if(w) setWatchlist(JSON.parse(w));
      const wm = localStorage.getItem("mktintel_wm");
      if(wm) setWatchlistMeta(JSON.parse(wm));
    }catch{}
  },[]);
  useEffect(()=>{try{localStorage.setItem("mktintel_s",JSON.stringify({bg:bgColor,text:textColor,accent:accentKey}));}catch{}},[bgColor,textColor,accentKey]);
  useEffect(()=>{try{localStorage.setItem("mktintel_w",JSON.stringify(watchlist));}catch{}},[watchlist]);
  useEffect(()=>{try{localStorage.setItem("mktintel_wm",JSON.stringify(watchlistMeta));}catch{}},[watchlistMeta]);

  useEffect(()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);

  const fetchData = useCallback(async()=>{
    if(watchlist.length===0) return;
    try{
      // Fetch quotes in small batches with delays to respect Finnhub's
      // 60 calls/minute free-tier limit, instead of firing all at once.
      const BATCH_SIZE = 8;
      const merged = {};
      for(let i=0;i<watchlist.length;i+=BATCH_SIZE){
        const batch = watchlist.slice(i,i+BATCH_SIZE);
        try{
          const qr = await fetch(`/api/quote?symbols=${batch.join(",")}`);
          if(qr.ok){
            const d = await qr.json();
            (d.data||[]).forEach(q=>{merged[q.symbol]=q;});
            setDataErr(null);
          }else{
            const e = await qr.json();
            setDataErr(e.error||"Quote error (rate limited — retrying next cycle)");
          }
        }catch{ setDataErr("Network error"); }
        if(i+BATCH_SIZE<watchlist.length) await new Promise(r=>setTimeout(r,1100));
      }
      setQuotes(prev=>({...prev,...merged}));

      const nr = await fetch(`/api/news?limit=25`);
      if(nr.ok){
        const d = await nr.json();
        const all = d.data||[];
        setNews(all);
        setTrumpNews(all.filter(n=>TRUMP_RE.test((n.headline||"")+(n.summary||""))));
      }
      setLastUpd(Date.now());
    }catch{ setDataErr("Network error"); }
  },[watchlist]);

  useEffect(()=>{ fetchData(); const t=setInterval(fetchData,60000); return()=>clearInterval(t); },[fetchData]);

  const ctx = useCallback(()=>({
    watchlist: watchlist.map(s=>({ symbol:s, name:watchlistMeta[s]||s, ...(quotes[s]||{}) })),
    news: news.slice(0,8).map(n=>({ headline:n.headline, source:n.source, datetime:n.datetime })),
    fetchedAt: lastUpd,
  }),[watchlist,watchlistMeta,quotes,news,lastUpd]);

  const callAPI = useCallback(async(prompt,isAlert,curMsgs)=>{
    setLoading(true);
    try{
      const history = (curMsgs||messages).map(m=>({ role:m.role, content:m.content }));
      const r = await fetch("/api/scan", {
        method:"POST", headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ messages:history, prompt, marketContext:ctx() }),
      });
      const d = await r.json();
      setMessages(p=>[...p,{ role:"assistant", content:d.text||d.error||"Analysis complete.", isAlertDive:isAlert }]);
    }catch{
      setMessages(p=>[...p,{ role:"assistant", content:"⚠️ Connection error. Please retry." }]);
    }finally{ setLoading(false); }
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
    const prompt = `DEEP DIVE — ${q.symbol} (${q.name||q.symbol})\nLive: $${q.price?.toFixed(2)}, ${q.changePercent?.toFixed(2)}% today, H$${q.high?.toFixed(2)} L$${q.low?.toFixed(2)}\n\nFull deep dive:\n▸ CATALYST — what is driving this right now\n▸ LEVELS — exact support and resistance\n▸ OPTIONS LANDSCAPE — IV rank, unusual flow, OI walls\n▸ DIRECTION — CALL or PUT and exactly why\n▸ PLAY — exact strike and expiry\n▸ ENTRY / TARGET / STOP\n▸ TIMEFRAME — intraday/weekly/monthly\n▸ SYMPATHY PLAYS\n▸ RISK — what invalidates this thesis\n▸ VERDICT — 🔥/⚡/👀 final conviction`;
    const nm = [...messages,{ role:"user", content:`🔍 Deep dive: ${q.symbol} — $${q.price?.toFixed(2)} (${q.changePercent?.toFixed(2)}%)` }];
    setMessages(nm); await callAPI(prompt,true,nm);
  },[loading,callAPI,messages]);

  const handleNews = useCallback(async(item)=>{
    if(loading) return;
    const isTrumpSearch = item.isTrumpSearch;
    const prompt = isTrumpSearch
      ? `Search Trump's latest Truth Social posts, tweets, X posts, and public statements RIGHT NOW — last 24 hours. Which sectors and tickers impacted? For each: exact tickers, direction, options play with exact strike/expiry, IV rank, entry/target/stop. Rank conviction 🔥/⚡/👀.`
      : `Analyze this news and its market impact:\n"${item.headline}"\nSource: ${item.source}\n\nDirectly affected tickers? Sympathy plays? Priced in or still edge? Exact options plays with strike/expiry, IV rank, entry/target/stop.`;
    const label = isTrumpSearch ? "🦅 AI: Search Trump Truth Social now" : `📰 ${item.headline?.slice(0,65)}...`;
    const nm = [...messages,{ role:"user", content:label }];
    setMessages(nm); await callAPI(prompt,true,nm);
  },[loading,callAPI,messages]);

  const handleTicker = useCallback(async(ticker,r)=>{
    if(loading) return;
    const prompt = `RADAR DEEP DIVE — ${ticker}\nDirection: ${r.dir} | Move: ${r.pct} | Reason: "${r.reason}" | Play: ${r.strike}\n\n▸ CATALYST — full story\n▸ CREDIBILITY — real or noise?\n▸ LEVELS\n▸ IV RANK\n▸ PLAY — exact strike and expiry\n▸ ENTRY / TARGET / STOP\n▸ TIMEFRAME\n▸ RISK\n▸ SYMPATHY PLAYS\n▸ VERDICT — 🔥/⚡/👀. Search latest news on ${ticker}.`;
    const nm = [...messages,{ role:"user", content:`📡 Radar deep dive: ${ticker} ${r.dir} ${r.pct}` }];
    setMessages(nm); await callAPI(prompt,true,nm);
  },[loading,callAPI,messages]);

  const addWL = (symbol,name) => {
    setWatchlist(p => p.includes(symbol) ? p : [...p,symbol]);
    setWatchlistMeta(p => ({ ...p,[symbol]: name || COMPANY_NAMES[symbol] || symbol }));
  };
  const rmWL = (symbol) => setWatchlist(p => p.filter(x=>x!==symbol));
  const resetWL = () => { setWatchlist(DEFAULT_WATCHLIST); setWatchlistMeta(buildDefaultMeta()); };
  const resetColors = () => { setBgColor(DEFAULT_BG); setTextColor(DEFAULT_TEXT); setAccentKey("teal"); };
  const handleKey = (e) => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); } };

  const tapeDuration = Math.max(35, watchlist.length * 2.2);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:#5557;border-radius:3px;}
        @keyframes tickerScroll{from{transform:translateX(0);}to{transform:translateX(-50%);}}
        @keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.85);}50%{opacity:1;transform:scale(1.1);}}
        @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
        @keyframes scanLine{0%,100%{opacity:0.3;}50%{opacity:1;}}
        textarea:focus,input:focus{outline:none;}textarea{resize:none;}button{cursor:pointer;border:none;background:none;}
      `}</style>
      <div style={{ display:"flex",height:"100vh",background:T.bg,fontFamily:"'Inter',sans-serif",overflow:"hidden" }}>

        {showWL && <WatchlistModal onClose={()=>setShowWL(false)} watchlist={watchlist} watchlistMeta={watchlistMeta} onAdd={addWL} onRemove={rmWL} onReset={resetWL} accent={accent} T={T}/>}
        {showSettings && <SettingsPanel onClose={()=>setShowSettings(false)} bgColor={bgColor} setBgColor={setBgColor} textColor={textColor} setTextColor={setTextColor} accentKey={accentKey} setAccentKey={setAccentKey} onResetColors={resetColors} T={T} accent={accent}/>}

        {/* LEFT */}
        <div style={{ width:290,minWidth:290,borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",background:T.panel }}>
          <div style={{ padding:"11px 12px 9px",borderBottom:`1px solid ${T.border}` }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
              <div style={{ display:"flex",alignItems:"center",gap:7 }}>
                <div style={{ width:7,height:7,borderRadius:"50%",background:dataErr?"#ff4d6d":accent,boxShadow:dataErr?"none":`0 0 8px ${accent}` }}/>
                <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:10,fontWeight:700,color:accent,letterSpacing:3 }}>LIVE FEED</span>
              </div>
              <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.dim }}>{lastUpd?new Date(lastUpd).toLocaleTimeString():"—"}</span>
            </div>
            {dataErr && <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:"#ff4d6d",background:"rgba(255,77,109,0.07)",border:"1px solid rgba(255,77,109,0.18)",borderRadius:5,padding:"4px 8px",marginBottom:7 }}>⚠ {dataErr}</div>}
            <div style={{ display:"flex",gap:5 }}>
              {[{id:"watchlist",label:"WATCHLIST"},{id:"news",label:"NEWS"}].map(t=>(
                <button key={t.id} onClick={()=>setLeftTab(t.id)}
                  style={{ flex:1,padding:"5px",fontFamily:"'JetBrains Mono',monospace",fontSize:9,fontWeight:700,letterSpacing:1,
                    color:leftTab===t.id?accent:T.dim, background:leftTab===t.id?`${accent}10`:"transparent",
                    border:`1px solid ${leftTab===t.id?`${accent}28`:T.border}`, borderRadius:5,cursor:"pointer" }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {leftTab==="watchlist" && (
            <div style={{ display:"flex",flexDirection:"column",flex:1,overflow:"hidden" }}>
              <div style={{ padding:"5px 12px",borderBottom:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.dim,letterSpacing:2,fontWeight:700 }}>{watchlist.length} TICKERS</span>
                <button onClick={()=>setShowWL(true)}
                  style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:9,color:accent,background:`${accent}0e`,border:`1px solid ${accent}22`,borderRadius:5,padding:"3px 9px",fontWeight:700,cursor:"pointer" }}>
                  ★ EDIT
                </button>
              </div>
              <div style={{ flex:1,overflowY:"auto",padding:"7px 9px" }}>
                {watchlist.map(s=>(
                  <WatchlistRow key={s} symbol={s} quote={quotes[s]} name={watchlistMeta[s]} onClick={handleWLClick} T={T}/>
                ))}
              </div>
            </div>
          )}

          {leftTab==="news" && (
            <div style={{ flex:1,overflowY:"auto",padding:"7px 9px" }}>
              {news.length===0 && <div style={{ textAlign:"center",color:T.dim,fontFamily:"'JetBrains Mono',monospace",fontSize:10,paddingTop:20 }}>LOADING NEWS...</div>}
              {news.map((item,i)=><NewsCard key={item.id||i} item={item} onDiveDeep={handleNews} T={T}/>)}
            </div>
          )}

          <div style={{ padding:"5px 12px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between" }}>
            <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.dim,letterSpacing:1 }}>{news.length} HEADLINES</span>
            <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:T.dim,animation:"scanLine 3s infinite" }}>AUTO 45S</span>
          </div>
        </div>

        {/* CENTER */}
        <div style={{ flex:1,display:"flex",flexDirection:"column",overflow:"hidden" }}>
          <div style={{ padding:"10px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:T.panel }}>
            <div>
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:14,fontWeight:800,color:T.text,letterSpacing:3 }}>MKTINTEL</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:8,color:accent,background:`${accent}10`,border:`1px solid ${accent}22`,padding:"2px 6px",borderRadius:4,letterSpacing:2,fontWeight:700 }}>LIVE</span>
              </div>
              <div style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,color:T.dim,letterSpacing:1,marginTop:1 }}>HEDGE FUND INTELLIGENCE DESK · ROBINHOOD · WEBULL · TRADINGVIEW</div>
            </div>
            <button onClick={()=>setShowSettings(true)}
              style={{ width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:T.dim,background:T.surface,border:`1px solid ${T.border}`,cursor:"pointer" }}>⚙</button>
          </div>

          <div style={{ borderBottom:`1px solid ${T.border}`,background:T.surface,overflow:"hidden",height:46,display:"flex",alignItems:"center" }}>
            <div style={{ display:"flex",alignItems:"center",animation:`tickerScroll ${tapeDuration}s linear infinite`,whiteSpace:"nowrap" }}>
              {[...watchlist,...watchlist].map((sym,i)=>{
                const q = quotes[sym]; const up = q && (q.changePercent??0)>=0;
                return (
                  <div key={i} style={{ display:"flex",alignItems:"center",gap:8,padding:"0 22px",borderRight:`1px solid ${T.border}` }}>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:14,fontWeight:700,color:T.textDim,letterSpacing:1.5 }}>{sym}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:13,color:T.text,fontWeight:500 }}>{q?.price!=null?`$${q.price.toFixed(2)}`:"—"}</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:12,fontWeight:700,color:up?"#00d4aa":"#ff4d6d" }}>
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
              <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:accent,paddingBottom:1,animation:"blink 1.2s infinite" }}>▸</span>
              <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
                placeholder="Ask the desk anything..." rows={1}
                style={{ flex:1,background:"transparent",border:"none",color:T.text,fontFamily:"'Inter',sans-serif",fontSize:13,lineHeight:1.5,maxHeight:100,overflowY:"auto" }}
                onInput={e=>{ e.target.style.height="auto"; e.target.style.height=Math.min(e.target.scrollHeight,100)+"px"; }}/>
              <button onClick={send} disabled={!input.trim()||loading}
                style={{ width:28,height:28,borderRadius:6,flexShrink:0,
                  background:input.trim()&&!loading?`${accent}12`:"transparent",
                  border:`1px solid ${input.trim()&&!loading?`${accent}28`:T.border}`,
                  color:input.trim()&&!loading?accent:T.dim, display:"flex",alignItems:"center",justifyContent:"center",fontSize:13 }}>▸</button>
            </div>
            <div style={{ display:"flex",justifyContent:"space-between",marginTop:3,padding:"0 2px" }}>
              <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,color:T.dim,letterSpacing:1 }}>SHIFT+ENTER FOR NEW LINE</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace",fontSize:7.5,color:T.dim,letterSpacing:1 }}>NOT FINANCIAL ADVICE</span>
            </div>
          </div>
        </div>

        <RightPanel trumpNews={trumpNews} onDiveDeep={handleNews} onTickerClick={handleTicker} accent={accent} T={T}/>
      </div>
    </>
  );
}