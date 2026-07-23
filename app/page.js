"use client";import BotDashboard from "./components/BotDashboard";
import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import LightweightChart from "./components/LightweightChart";
import { loadAnnotations, saveAnnotations, makeLevel, makeTrendline, makeMarker, num } from "../lib/chartAnnotations";
import { useIsMobile } from "../lib/useIsMobile";
import PushAlerts from "./components/PushAlerts";
import MoversPanel from "./components/MoversPanel";
import CalendarPanel from "./components/CalendarPanel";
import TickerOverview from "./components/TickerOverview";
import MarketStatusBadge from "./components/MarketStatusBadge";
import PropFirmPanel from "./components/PropFirmPanel";
import TerminalChart from "./components/TerminalChart";


import AuthGate, { DevBypassBadge } from "./components/AuthGate";
import BotSettings from "./components/BotSettings";
import FOMCOverlay from "./components/FOMCOverlay";
import GridDock, { DEFAULT_TERMINAL_LAYOUT } from "./components/GridDock";
import ThemeBackdrop, { THEME_LIST, isVideoTheme } from "./components/ThemeBackdrop";
import { saveBgVideo, loadBgVideo, clearBgVideo } from "../lib/mediaStore";
import TickerLogo from "./components/TickerLogo";
import TourGuide from "./components/TourGuide";
import KronosMentor from "./components/KronosMentor";
import { CollapsedRail } from "./components/CollapseRail";
import V13Popup from "./components/V13Popup";
import { COMPANY_NAMES } from "../lib/companyNames";
import { vixFilter } from "../lib/vixColor";
import { getSupabase, supabaseConfigured, getAccessToken } from "../lib/supabase";

// V10: user-selectable chat/body font (all faces already loaded via Google import)
const FONT_CHOICES=[
  {id:"inter",label:"Inter (default)",stack:"'Inter',sans-serif"},
  {id:"geist",label:"Geist",stack:"'Geist',sans-serif"},
  {id:"serif",label:"Source Serif",stack:"'Source Serif 4',serif"},
  {id:"fraunces",label:"Fraunces",stack:"'Fraunces',serif"},
  {id:"mono",label:"JetBrains Mono",stack:"'JetBrains Mono',monospace"},
  {id:"system",label:"System",stack:"system-ui,sans-serif"},
];
import TickerTape from "./components/TickerTape";
// KronosOnboarding is used inside BotDashboard.jsx directly

const FONT_SANS = "'Geist',sans-serif", FONT_SERIF = "'Source Serif 4',serif";
const FONT_DISPLAY = "'Fraunces',serif", FONT_CHAT = "'Inter',sans-serif", FONT_MONO = "'JetBrains Mono',monospace";

// ─── COLOR HELPERS ────────────────────────────────────────────────────────────
function hexToRgb(h) {
  h = (h||"#000").replace("#",""); if(h.length===3) h=h.split("").map(c=>c+c).join("");
  const n=parseInt(h,16)||0; return{r:(n>>16)&255,g:(n>>8)&255,b:n&255};
}
function rgbToHex(r,g,b){const c=x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,"0");return`#${c(r)}${c(g)}${c(b)}`;}
function shade(hex,amt){const{r,g,b}=hexToRgb(hex),d=Math.round(2.55*amt);return rgbToHex(r+d,g+d,b+d);}
function mix(a,b,w){const A=hexToRgb(a),B=hexToRgb(b);return rgbToHex(A.r*w+B.r*(1-w),A.g*w+B.g*(1-w),A.b*w+B.b*(1-w));}
function luminance(hex){const{r,g,b}=hexToRgb(hex);return(0.299*r+0.587*g+0.114*b)/255;}
function deriveTheme(bg,text){
  const d=luminance(bg)>0.55?-1:1;
  const s=shade(bg,d*5);
  const b=shade(bg,d*11);
  return{
    bg,
    panel:shade(bg,d*2),
    surface:s,
    surface2:shade(bg,d*8),
    border:b,
    border2:shade(bg,d*16),
    text,
    // V12 readability pass: secondary/muted text was too dark to read (reported
    // hard even with glasses). Weights are the fraction of TEXT vs bg — raised
    // across the board so muted copy has real contrast. Erring toward brighter.
    textDim:mix(text,bg,0.88), // was 0.62
    dim:mix(text,bg,0.68),     // was 0.30 — the widely-used secondary; biggest win
    ghost:mix(text,bg,0.42),   // was 0.14 — faint labels/hints
  };
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DEFAULT_BG="#05080F",DEFAULT_TEXT="#E2EDF8";
const ACCENTS={teal:"#00d4aa",blue:"#7eb8f7",purple:"#a78bfa",orange:"#ff6b35",gold:"#f7c948",red:"#ff4d6d"};
const THEME_DEFAULTS={mainBg:DEFAULT_BG,mainText:DEFAULT_TEXT,leftBg:DEFAULT_BG,leftText:DEFAULT_TEXT,rightBg:DEFAULT_BG,rightText:DEFAULT_TEXT,accent:"teal",density:"comfortable",leftWidth:290,rightWidth:310,chartRightWidth:340};
const TRUMP_RE=/trump|truth social|tariff|executive order|maga|mar-a-lago|president trump|trade war/i;
const QUICK_CHART_SYMS=["SPY","QQQ","NVDA","AAPL","TSLA","META","AMD","MSFT","PLTR","MSTR","AMZN","GOOGL"];
const DEFAULT_WATCHLIST=["NVDA","AAPL","MSFT","GOOGL","AMZN","META","TSLA","AMD","JPM","V","UNH","LLY","XOM","BA","WMT","COST","NKE","DIS","PLTR","RKLB","IONQ","SMCI","GME","MSTR","SPY","QQQ"];
const POPULAR_PICKS=["ADBE","CRM","ORCL","INTC","QCOM","PYPL","SQ","SHOP","UBER","SBUX","MCD","TGT","HD","CAT","GE","RTX","KO","PEP","PG","JNJ","T","VZ","C","WFC","GS","MS","BAC","AVGO","NFLX","COIN","RIOT","MARA","CLSK","IWM","DIA"];
function buildDefaultMeta(){const m={};DEFAULT_WATCHLIST.forEach(s=>{m[s]=COMPANY_NAMES[s]||s;});return m;}

// V10.4 theme set = Classic + lightweight canvas themes + looping-video themes.
// (Spline was removed; its scene themes are now video themes with the same ids.)
//
// migrateTheme resolves a persisted theme id against what's ACTUALLY available.
// THEME_LIST only contains video themes whose asset file exists, so a user sitting
// on e.g. "galaxy" before the galaxy.mp4 is installed would otherwise get a black
// backdrop. Anything unresolvable falls back to `aurora` — a real, always-present
// canvas theme. Never default to a video id: that's the black-screen case.
const FALLBACK_THEME="aurora";
const RETIRED_THEMES={
  globe:"orb", newsglobe:"orb",         // renamed
  worldmap:FALLBACK_THEME, candles:FALLBACK_THEME, // removed in V10.3
  sphere:FALLBACK_THEME, flux:FALLBACK_THEME,      // Spline-only scenes, dropped in V10.4
};
function migrateTheme(t){
  const valid=THEME_LIST.map(x=>x.id);
  const raw=t?.id;
  const mapped=RETIRED_THEMES[raw]??raw;
  const id=valid.includes(mapped)?mapped:FALLBACK_THEME;
  // tint: a hex color blended over the theme; tintStrength 0..1 its intensity.
  return { id, hue:t?.hue??0, sat:t?.sat??1, bri:t?.bri??1, tint:t?.tint??"", tintStrength:t?.tintStrength??0.5 };
}

// The AI picks colors by NAME (an enum in the tool schema) rather than emitting
// hex — a free-text hex field invites invalid values and lets the model pick
// something illegible against the theme.
const AI_DRAW_COLORS={teal:"#00d4aa",blue:"#7eb8f7",purple:"#a78bfa",green:"#00e676",red:"#ff3d57",gold:"#f7c948"};

// ─── V11 MOBILE (M1) ──────────────────────────────────────────────────────────
// Phone layout is one full-screen panel at a time behind a bottom tab bar. The
// desktop three-column terminal (290px watchlist + chat + 310px news) is simply
// not survivable at 375px, and shrinking it produces something unusable rather
// than something small.
//
// `view` stays the single source of truth so the AI's set_view tool and every
// existing code path keep working untouched; `mobilePanel` only picks WHICH
// piece of the terminal view a phone is showing. That's why the tab id is
// derived from (view, mobilePanel) rather than being separate state that could
// silently drift out of sync with `view`.
const MOBILE_TABS=[
  {id:"chat",     icon:"◈",  label:"Desk"},
  {id:"chart",    icon:"📈", label:"Chart"},
  {id:"overview", icon:"🔎", label:"Overview"},
  {id:"bot",      icon:"🤖", label:"Kronos"},
  {id:"watchlist",icon:"★",  label:"List"},
  {id:"news",     icon:"📰", label:"News"},
  {id:"data",     icon:"⚡", label:"Data"},
];
function mobileTabFor(view,mobilePanel){
  if(view==="chart")return "chart";
  if(view==="bot")return "bot";
  if(view==="data")return "data";
  if(view==="overview")return "overview"; // per-ticker drill-down (no tab highlighted)
  return mobilePanel||"chat"; // terminal view splits into chat/watchlist/news
}
function MobileTabBar({active,onSelect,accent,T,alertCount=0}){
  return(
    <div style={{
      display:"flex",flexShrink:0,background:T.panel,
      borderTop:`1px solid ${T.border}`,position:"relative",zIndex:5,
      // Keeps the bar above the iPhone home indicator instead of under it.
      paddingBottom:"env(safe-area-inset-bottom, 0px)",
    }}>
      {MOBILE_TABS.map(t=>{
        const on=active===t.id;
        return(
          <button key={t.id} onClick={()=>onSelect(t.id)} aria-label={t.label} aria-current={on?"page":undefined}
            style={{
              flex:1,minWidth:0,minHeight:52,   // ≥44px — an actual thumb target
              display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,
              background:on?`${accent}0e`:"transparent",
              border:"none",borderTop:`2px solid ${on?accent:"transparent"}`,
              cursor:"pointer",padding:"6px 2px",position:"relative",
            }}>
            <span style={{fontSize:15,lineHeight:1,opacity:on?1:0.55,filter:on?"none":"grayscale(1)"}}>{t.icon}</span>
            <span style={{fontFamily:FONT_MONO,fontSize:7.5,letterSpacing:0.4,fontWeight:700,color:on?accent:T.dim,whiteSpace:"nowrap"}}>{t.label}</span>
            {/* Breaking-news dot must reach you from any tab — same rule as desktop. */}
            {t.id==="data"&&alertCount>0&&(
              <span style={{position:"absolute",top:6,right:"50%",marginRight:-16,width:6,height:6,borderRadius:"50%",background:"#ff3d57",animation:"news-pulse 1.1s ease-in-out infinite"}}/>
            )}
          </button>
        );
      })}
    </div>
  );
}

const QA_GROUPS=[
  {label:"📰 NEWS",color:"#f7c948",actions:[
    {label:"Breaking market news now",prompt:"Give me the most important breaking market news RIGHT NOW using live context. For each catalyst: direction, exact options play with strike/expiry, IV rank, entry/target/stop. Grade every setup A/B/C."},
    {label:"Trump / Truth Social now",prompt:"Search Trump's latest Truth Social posts and statements RIGHT NOW. Sectors impacted? For each: tickers, exact options play, IV rank, entry/target/stop."},
    {label:"Fed & macro today",prompt:"Latest Fed news, CPI, jobs, rate decisions. What matters most right now? IV rank on every setup."},
    {label:"Earnings today",prompt:"Companies reporting today or after-hours? Beats or misses? Best remaining options plays. IV rank for each."},
  ]},
  {label:"💎 DISCOVERY",color:"#a78bfa",actions:[
    {label:"Undervalued stocks now",prompt:"Undervalued stocks with catalysts Wall Street hasn't priced in. Large AND small/micro caps. Options play, IV rank."},
    {label:"Hidden gems",prompt:"Hidden gems with explosive upside: low float squeeze, micro-caps, biotech near FDA, DoD contracts. Wide scan."},
    {label:"Short squeeze plays",prompt:"Top short squeeze candidates now. High short float + catalyst. Short %, days to cover, exact options strikes, IV rank."},
    {label:"Small cap movers",prompt:"Small and micro caps with unusual activity. 5-8 names with specific setups and IV rank."},
  ]},
  {label:"🐋 WHALE",color:"#00d4aa",actions:[
    {label:"Whale buys now",prompt:"Full whale and dark pool activity today. Block trades above $500K, institutional buys, unusual sweeps."},
    {label:"Unusual options flow",prompt:"Unusual options flow now. Biggest sweeps, dark pool prints, 0DTE spikes. Exact setups with strikes and IV rank."},
    {label:"Insider buys this week",prompt:"Insider buying via SEC Form 4 this week. Size, significance, options plays with IV rank."},
    {label:"Dark pool prints",prompt:"Biggest dark pool prints today. Bullish vs bearish? Small/mid caps that haven't reacted yet."},
  ]},
  {label:"📊 ANALYSIS",color:"#7eb8f7",actions:[
    {label:"Full market scan",prompt:"Complete market scan. Top CALLs, Top PUTs, hidden gems, whale summary, sector rotation, macro risks. IV rank."},
    {label:"Best options this week",prompt:"Best options plays for this week. Conviction ranked. Catalyst, exact strike/expiry, entry, target, stop, IV rank."},
    {label:"Sector rotation",prompt:"Which sectors seeing rotation today? Money flowing IN and OUT. Specific ETFs, tickers, options plays both directions."},
    {label:"Best LEAPS now",prompt:"Best LEAPS for 3-12 month holds. Specific strikes, expiry, entry zone, thesis for each."},
  ]},
  {label:"⚡ INTEL",color:"#ff6b35",actions:[
    {label:"Pre-market movers",prompt:"What's moving pre-market right now? Gainers/losers with catalyst from live context. Options plays with IV rank."},
    {label:"Crypto vs stocks",prompt:"Crypto moving today affecting stocks? BTC, ETH, MSTR, COIN, RIOT, MARA, CLSK. Options opportunities? IV rank."},
    {label:"FDA/biotech catalysts",prompt:"Biotech or pharma FDA catalysts this week. PDUFA dates, trial readouts. Options, IV rank, risk/reward."},
    {label:"DoD contracts",prompt:"Recent government contract awards, DoD spending. Small/mid cap winners the market hasn't reacted to yet."},
  ]},
];

// ─── RESIZE DIVIDER ───────────────────────────────────────────────────────────
function ResizeDivider({onMouseDown,accent}){
  const[hov,setHov]=useState(false);
  return(
    <div onMouseDown={onMouseDown} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{width:5,flexShrink:0,cursor:"col-resize",background:hov?`${accent}45`:"transparent",transition:"background 0.15s",zIndex:10,position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
      {hov&&<div style={{width:2,height:48,borderRadius:2,background:accent,position:"absolute"}}/>}
    </div>
  );
}

// ─── WELCOME POPUP ────────────────────────────────────────────────────────────
function WelcomePopup({onClose,onTour,accent,T}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:3000,background:"rgba(0,0,0,0.92)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{width:"100%",maxWidth:520,background:T.panel,border:`1px solid ${accent}45`,borderRadius:20,overflow:"hidden",boxShadow:`0 0 100px ${accent}25,0 0 200px rgba(0,0,0,0.8)`}}>
        <div style={{position:"relative",width:"100%",height:240,overflow:"hidden",background:"#000"}}>
          <img src="/welcome.png" alt="Traders Terminal"
            style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"center",display:"block",opacity:0.92}}/>
          <div style={{position:"absolute",inset:0,background:`linear-gradient(to bottom, transparent 60%, ${T.panel})`}}/>
        </div>
        <div style={{padding:"22px 30px 28px"}}>
          <p style={{fontFamily:FONT_DISPLAY,fontSize:20,fontWeight:700,color:T.text,marginBottom:10,letterSpacing:0.2}}>
            Welcome to the Traders Terminal!
          </p>
          <p style={{fontFamily:FONT_CHAT,fontSize:14,lineHeight:1.72,color:T.textDim,marginBottom:6}}>
            This is a project by me that I hope you can find useful and efficient. I appreciate any feedback and tips for future builds.
          </p>
          <p style={{fontFamily:FONT_DISPLAY,fontSize:16,fontWeight:600,color:accent,marginBottom:24,fontStyle:"italic"}}>— Gio</p>
          <div style={{display:"flex",gap:10}}>
            <button onClick={onClose}
              style={{flex:1.4,padding:"13px 0",background:`linear-gradient(135deg,${accent}28,${accent}12)`,border:`1px solid ${accent}50`,borderRadius:10,color:accent,fontFamily:FONT_MONO,fontSize:12,fontWeight:700,letterSpacing:2,cursor:"pointer",transition:"all 0.2s"}}
              onMouseEnter={e=>{e.currentTarget.style.background=`${accent}30`;e.currentTarget.style.borderColor=`${accent}70`;e.currentTarget.style.boxShadow=`0 0 20px ${accent}30`;}}
              onMouseLeave={e=>{e.currentTarget.style.background=`linear-gradient(135deg,${accent}28,${accent}12)`;e.currentTarget.style.borderColor=`${accent}50`;e.currentTarget.style.boxShadow="none";}}>
              LAUNCH TERMINAL
            </button>
            {/* V10: guided onboarding */}
            <button onClick={onTour}
              style={{flex:1,padding:"13px 0",background:"transparent",border:`1px solid ${T.border}`,borderRadius:10,color:T.textDim,fontFamily:FONT_MONO,fontSize:12,fontWeight:700,letterSpacing:2,cursor:"pointer",transition:"all 0.2s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=`${accent}45`;e.currentTarget.style.color=accent;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.textDim;}}>
              🧭 TAKE A TOUR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
function TypingIndicator({accent}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 14px"}}>
      <span style={{color:accent,fontSize:10,fontFamily:FONT_MONO,letterSpacing:2,fontWeight:700}}>ANALYZING</span>
      {[0,1,2].map(i=><div key={i} style={{width:4,height:4,borderRadius:"50%",background:accent,animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite`}}/>)}
    </div>
  );
}

const ChatMessage=memo(function ChatMessage({msg,accent,T,fontSize,onButton}){
  const u=msg.role==="user";
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:u?"flex-end":"flex-start",marginBottom:5}}>
      <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:3}}>
        {!u&&<span style={{color:msg.isAlertDive?"#a78bfa":accent,fontSize:9,fontFamily:FONT_MONO,letterSpacing:2,fontWeight:700}}>{msg.isAlertDive?"◆ INTEL":"◈ DESK"}</span>}
        {u&&<span style={{color:T.dim,fontSize:9,fontFamily:FONT_MONO,letterSpacing:2,fontWeight:700}}>YOU ◈</span>}
      </div>
      <div style={{maxWidth:"91%",background:u?`${accent}10`:msg.isAlertDive?"rgba(167,139,250,0.08)":"rgba(127,127,127,0.06)",border:u?`1px solid ${accent}28`:msg.isAlertDive?"1px solid rgba(167,139,250,0.22)":`1px solid ${T.border}`,borderRadius:u?"12px 12px 3px 12px":"3px 12px 12px 12px",padding:"10px 14px"}}>
        <p style={{
  color:u?T.text:T.textDim,
  fontSize:fontSize||14,
  lineHeight:1.5,
  margin:0,
  fontFamily:FONT_CHAT,
  whiteSpace:"pre-wrap",
  textRendering:"geometricPrecision",
  WebkitFontSmoothing:"antialiased",
}}>
  {(msg.content||"").replace(/\n{3,}/g,"\n\n")}
</p>
      </div>
      {/* V12: inline action buttons the desk attaches to a reply — auto-setup re-show
          (kind:action → runs a chart tool) or a choice like short/long (kind:prompt
          → sends that prompt back to the desk). Keeps the user from having to type. */}
      {!u&&Array.isArray(msg.buttons)&&msg.buttons.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:7,maxWidth:"91%"}}>
          {msg.buttons.map((b,bi)=>(
            <button key={bi} onClick={()=>onButton?.(b)}
              style={{fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:0.4,color:accent,background:`${accent}12`,border:`1px solid ${accent}38`,padding:"6px 12px",borderRadius:7,cursor:"pointer"}}>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

function QuickActions({onAction,accent,T}){
  const[open,setOpen]=useState(null);
  return(
    <div style={{padding:"7px 16px 9px",borderTop:`1px solid ${T.border}`,background:T.panel}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
        <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700}}>QUICK ACTIONS</span>
        <div style={{flex:1,height:1,background:T.border}}/>
      </div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:open!==null?7:0}}>
        {QA_GROUPS.map((g,gi)=>(
          <button key={gi} onClick={()=>setOpen(open===gi?null:gi)}
            style={{fontFamily:FONT_MONO,fontSize:10,fontWeight:700,color:open===gi?g.color:T.dim,background:open===gi?`${g.color}14`:"transparent",border:`1px solid ${open===gi?`${g.color}38`:T.border}`,padding:"4px 11px",borderRadius:5,letterSpacing:0.5,cursor:"pointer"}}>
            {g.label}
          </button>
        ))}
      </div>
      {open!==null&&(
        <div style={{display:"flex",gap:5,flexWrap:"wrap",borderTop:`1px solid ${T.border}`,paddingTop:7}}>
          {QA_GROUPS[open].actions.map((a,ai)=>(
            <button key={ai} onClick={()=>{onAction(a.prompt,a.label);setOpen(null);}}
              style={{fontFamily:FONT_MONO,fontSize:10,color:QA_GROUPS[open].color,background:`${QA_GROUPS[open].color}0f`,border:`1px solid ${QA_GROUPS[open].color}2a`,padding:"5px 12px",borderRadius:18,letterSpacing:0.3,cursor:"pointer"}}>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// V13.5 perf: technicals are fetched per watchlist row, but the same symbol
// recurs across the watchlist, ticker tape and quick-chart AND every row
// remounts on a view switch — so without a cache the app re-fetches the same
// RSI/MACD dozens of times. A tiny module-level TTL cache (and in-flight promise
// dedupe) collapses those into one request per symbol per 60s.
const _techCache=new Map(); // symbol -> { at, data }
const _techInflight=new Map(); // symbol -> Promise
const TECH_TTL=60_000;
async function getTechnicals(symbol){
  const hit=_techCache.get(symbol);
  if(hit&&Date.now()-hit.at<TECH_TTL)return hit.data;
  if(_techInflight.has(symbol))return _techInflight.get(symbol);
  const p=(async()=>{
    try{
      const r=await fetch(`/api/technicals?symbol=${symbol}`);
      const d=await r.json();
      _techCache.set(symbol,{at:Date.now(),data:d});
      return d;
    }catch{return null;}
    finally{_techInflight.delete(symbol);}
  })();
  _techInflight.set(symbol,p);
  return p;
}

const WatchlistRow=memo(function WatchlistRow({symbol,quote,name,onClick,T,density}){
  const [techData,setTechData]=useState({});
  const pad=density==="compact"?"6px 9px":"8px 10px";

  useEffect(()=>{
    let live=true;
    getTechnicals(symbol).then(d=>{if(live&&d)setTechData(prev=>({...prev,[symbol]:d}));});
    return()=>{live=false;};
  },[symbol]);
  if(!quote) return <div style={{padding:pad,borderRadius:7,marginBottom:5,background:T.surface,border:`1px solid ${T.border}`}}><span style={{fontFamily:FONT_MONO,fontSize:10,color:T.dim}}>{symbol} loading...</span></div>;
  if(quote.error) return <div style={{padding:pad,borderRadius:7,marginBottom:5,background:T.surface,border:`1px solid ${T.border}`}}><span style={{fontFamily:FONT_MONO,fontSize:10,color:"#ff4d6d"}}>{symbol} — unavailable</span></div>;
  const up=(quote.changePercent??0)>=0,clr=up?"#00d4aa":"#ff4d6d";
  return(
    <div onClick={()=>onClick({symbol,name,...quote})}
      style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:pad,borderRadius:7,marginBottom:5,background:T.surface,border:`1px solid ${T.border}`,cursor:"pointer",transition:"background 0.12s"}}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(127,127,127,0.08)"}
      onMouseLeave={e=>e.currentTarget.style.background=T.surface}>
      <div style={{display:"flex",alignItems:"center",gap:8,minWidth:0}}>
        <TickerLogo symbol={symbol} size={22}/>
        <div style={{minWidth:0}}>
          <div style={{fontFamily:FONT_MONO,fontWeight:700,fontSize:12.5,color:T.text,letterSpacing:1}}>{symbol}</div>
          <div style={{fontFamily:FONT_CHAT,fontSize:10,color:T.dim,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(name||symbol).slice(0,20)}</div>
        </div>
      </div>
      <div style={{textAlign:"right"}}>
        <div style={{fontFamily:FONT_MONO,fontSize:12.5,fontWeight:700,color:T.text}}>{quote.price!=null?`$${quote.price.toFixed(2)}`:"—"}</div>
        <div style={{fontFamily:FONT_MONO,fontSize:11,fontWeight:700,color:clr}}>{quote.changePercent!=null?`${up?"▲":"▼"} ${Math.abs(quote.changePercent).toFixed(2)}%`:""}</div>
        {techData[symbol] && (
          <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,marginTop:2,display:"flex",flexDirection:"column",alignItems:"flex-end"}}>
            {techData[symbol].rsi!=null&&(
              <span style={{
                color: Number(techData[symbol].rsi)>70?"#ff3d57":Number(techData[symbol].rsi)<30?"#00e676":"#9DB4CC",
                fontWeight:700
              }}>
                RSI {Number(techData[symbol].rsi).toFixed(0)}
              </span>
            )}
            {techData[symbol].macd?.macd!=null&&(
              <span style={{color:Number(techData[symbol].macd.macd)>=0?"#00e676":"#ff3d57",fontWeight:700}}>
                MACD {Number(techData[symbol].macd.macd).toFixed(2)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

// ─── V10: GRADIENT IMPACT RATING BAR ──────────────────────────────────────────
// Red→green bar scoring likely market impact; hover explains the rating.
function ImpactBar({item,T,compact=false}){
  const[hov,setHov]=useState(false);
  const imp=item?.impact;
  if(!imp)return null;
  const{score,label,explanation}=imp;
  return(
    <div style={{position:"relative",marginTop:compact?4:7}}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <div style={{display:"flex",alignItems:"center",gap:7}}>
        <div style={{flex:1,height:compact?3:4,borderRadius:2,background:"rgba(127,127,127,0.14)",overflow:"hidden"}}>
          <div style={{
            width:`${score}%`,height:"100%",borderRadius:2,
            background:"linear-gradient(90deg,#ef4444,#f59e0b 45%,#facc15 65%,#22c55e)",
            backgroundSize:`${Math.max(1,10000/score)}% 100%`,backgroundPosition:"left",
            transition:"width 0.5s ease",
          }}/>
        </div>
        <span style={{fontFamily:FONT_MONO,fontSize:7.5,fontWeight:800,letterSpacing:1,color:score>=70?"#22c55e":score>=45?"#facc15":"#8896a8",flexShrink:0}}>
          {score}
        </span>
      </div>
      {hov&&(
        <div style={{
          position:"absolute",bottom:"calc(100% + 6px)",left:0,zIndex:50,width:230,
          background:"rgba(8,14,24,0.97)",border:`1px solid ${score>=70?"rgba(34,197,94,0.4)":T.border}`,
          borderRadius:8,padding:"9px 11px",boxShadow:"0 8px 22px rgba(0,0,0,0.5)",pointerEvents:"none",
        }}>
          <div style={{fontFamily:FONT_MONO,fontSize:8,fontWeight:800,letterSpacing:1.5,marginBottom:4,
            color:score>=70?"#22c55e":score>=45?"#facc15":"#8896a8"}}>
            {label} · {score}/100
          </div>
          <div style={{fontFamily:FONT_CHAT,fontSize:10,color:"#aebccc",lineHeight:1.5}}>{explanation}</div>
        </div>
      )}
    </div>
  );
}

// ─── V10: BEGINNER INDICATOR GUIDE (watchlist ⓘ) ─────────────────────────────
function IndicatorInfoModal({onClose,accent,T}){
  const ROWS=[
    ["RSI (Relative Strength Index)","A 0–100 speedometer for price. Above 70 = stock may have run up too fast (could pull back). Below 30 = may have dropped too fast (could bounce). Between 30–70 = normal territory."],
    ["MACD","Momentum tracker. A positive number means upward momentum is building; negative means downward. Watch the sign flip — that's often when trends change."],
    ["Conviction % (Kronos)","How strongly the bot's agents agree on a setup, 0–100%. Under 60% = no trade. 78%+ = strong agreement. 90%+ = rare, highest-confidence setups (these launch comets 🌠)."],
    ["Impact bar (news)","Red→green bar under each headline scoring how likely that story is to move the market. Green/high = act fast; gray/low = background noise."],
    ["VIX","The market's 'fear gauge.' Under 15 = calm. 15–20 = normal. 20–30 = nervous. 30+ = fear — big swings likely. The Kronos galaxy orb changes color with it."],
  ];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{width:"100%",maxWidth:480,maxHeight:"84vh",overflowY:"auto",background:T.panel,border:`1px solid ${accent}35`,borderRadius:16,padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontFamily:FONT_MONO,fontSize:11,fontWeight:700,color:accent,letterSpacing:2}}>ⓘ WHAT THE NUMBERS MEAN</span>
          <button onClick={onClose} style={{color:T.dim,fontSize:17,cursor:"pointer"}}>✕</button>
        </div>
        {ROWS.map(([t,d])=>(
          <div key={t} style={{marginBottom:14,paddingBottom:14,borderBottom:`1px solid ${T.border}`}}>
            <div style={{fontFamily:FONT_MONO,fontSize:11,fontWeight:700,color:T.text,marginBottom:5}}>{t}</div>
            <div style={{fontFamily:FONT_CHAT,fontSize:12,color:T.textDim,lineHeight:1.65}}>{d}</div>
          </div>
        ))}
        <div style={{fontFamily:FONT_MONO,fontSize:8,color:T.dim,lineHeight:1.6}}>None of these are guarantees — they're probability tools. Not financial advice.</div>
      </div>
    </div>
  );
}

const NewsCard=memo(function NewsCard({item,onDiveDeep,T}){
  const isTrump=TRUMP_RE.test((item.headline||"")+(item.summary||""));
  const age=item.datetime?Math.round((Date.now()-item.datetime)/60000):null;
  const ageLabel=age==null?"":age<1?"just now":age<60?`${age}m ago`:`${Math.round(age/60)}h ago`;
  const bc=isTrump?"#ff6b35":"#f7c948";
  return(
    <div onClick={()=>onDiveDeep(item)}
      style={{background:`${bc}08`,border:`1px solid ${bc}1a`,borderLeft:`3px solid ${bc}`,borderRadius:7,padding:"9px 11px",marginBottom:6,cursor:"pointer",transition:"all 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.background="rgba(127,127,127,0.08)"}
      onMouseLeave={e=>e.currentTarget.style.background=`${bc}08`}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
        <span style={{fontFamily:FONT_MONO,fontSize:9,color:bc,letterSpacing:1,fontWeight:700,display:"flex",alignItems:"center",gap:5}}>
          {/* V10: Trump/TruthSocial marker is a "T" monogram (was 🦅) */}
          {isTrump&&<span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:13,height:13,borderRadius:3,background:"#ff6b3522",border:"1px solid #ff6b3555",fontFamily:FONT_SERIF,fontSize:9.5,fontWeight:800,color:"#ff6b35",lineHeight:1}}>T</span>}
          {item.source?.toUpperCase()}
        </span>
        <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim}}>{ageLabel}</span>
      </div>
      <p style={{color:T.textDim,fontSize:12,lineHeight:1.45,margin:0,fontFamily:FONT_SERIF,fontWeight:500}}>{item.headline}</p>
      <ImpactBar item={item} T={T}/>
    </div>
  );
});

// ─── WATCHLIST MODAL ──────────────────────────────────────────────────────────
function WatchlistModal({onClose,watchlist,onAdd,onRemove,onReset,accent,T}){
  const[q,setQ]=useState(""),[ results,setResults]=useState([]),[searching,setSearching]=useState(false);
  const doSearch=useCallback(async(query)=>{
    if(!query.trim()){setResults([]);return;}
    setSearching(true);
    try{const r=await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);const d=await r.json();setResults(d.data||[]);}
    catch{setResults([]);}finally{setSearching(false);}
  },[]);

  useEffect(()=>{const t=setTimeout(()=>doSearch(q),350);return()=>clearTimeout(t);},[q,doSearch]);
  const quickAdds=POPULAR_PICKS.filter(s=>!watchlist.includes(s)).slice(0,14);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{width:460,maxHeight:"86vh",overflowY:"auto",background:T.panel,border:`1px solid ${accent}35`,borderRadius:16,padding:24,boxShadow:`0 0 50px ${accent}18`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <span style={{fontFamily:FONT_SANS,fontSize:13,fontWeight:700,color:accent}}>★ Manage Watchlist</span>
          <button onClick={onClose} style={{color:T.dim,fontSize:17,cursor:"pointer"}}>✕</button>
        </div>
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="SEARCH ANY COMPANY OR TICKER..."
          style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontFamily:FONT_MONO,fontSize:12,letterSpacing:1,marginBottom:10}}/>
        {searching&&<div style={{fontFamily:FONT_MONO,fontSize:10,color:T.dim,marginBottom:8}}>SEARCHING...</div>}
        {results.length>0&&(
          <div style={{marginBottom:14,borderRadius:8,overflow:"hidden",border:`1px solid ${T.border}`}}>
            {results.map(r=>(
              <div key={r.symbol} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderBottom:`1px solid ${T.border}`,background:T.surface}}>
                <div style={{minWidth:0,flex:1}}>
                  <span style={{fontFamily:FONT_MONO,fontWeight:700,color:T.text,fontSize:13}}>{r.symbol}</span>
                  <span style={{fontFamily:FONT_CHAT,fontSize:10,color:T.dim,marginLeft:8}}>{(r.name||"").slice(0,26)}</span>
                </div>
                {watchlist.includes(r.symbol)
                  ?<button onClick={()=>onRemove(r.symbol)} style={{background:"rgba(255,77,109,0.12)",border:"1px solid rgba(255,77,109,0.28)",color:"#ff4d6d",borderRadius:5,padding:"2px 9px",fontFamily:FONT_MONO,fontSize:10,cursor:"pointer",fontWeight:700,flexShrink:0}}>REMOVE</button>
                  :<button onClick={()=>onAdd(r.symbol,r.name)} style={{background:`${accent}12`,border:`1px solid ${accent}28`,color:accent,borderRadius:5,padding:"2px 9px",fontFamily:FONT_MONO,fontSize:10,cursor:"pointer",fontWeight:700,flexShrink:0}}>+ ADD</button>}
              </div>
            ))}
          </div>
        )}
        {results.length===0&&!searching&&(
          <div style={{marginBottom:14}}>
            <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:8}}>QUICK ADD</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {quickAdds.map(s=>(
                <button key={s} onClick={()=>onAdd(s,COMPANY_NAMES[s])}
                  style={{display:"flex",alignItems:"center",gap:3,background:`${accent}0a`,border:`1px solid ${accent}20`,borderRadius:6,padding:"3px 8px",cursor:"pointer"}}>
                  <span style={{fontFamily:FONT_MONO,fontSize:10,fontWeight:700,color:T.text}}>{s}</span>
                  <span style={{color:accent,fontSize:11,fontWeight:700}}>+</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
          <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700}}>CURRENT ({watchlist.length})</span>
          <button onClick={onReset} style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,cursor:"pointer",textDecoration:"underline"}}>RESET TO DEFAULT</button>
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {watchlist.map(s=>(
            <div key={s} style={{display:"flex",alignItems:"center",gap:4,background:`${accent}0f`,border:`1px solid ${accent}22`,borderRadius:5,padding:"3px 9px"}}>
              <span style={{fontFamily:FONT_MONO,fontSize:11,color:accent,fontWeight:700}}>{s}</span>
              <button onClick={()=>onRemove(s)} style={{color:T.dim,fontSize:11,cursor:"pointer",lineHeight:1,paddingLeft:2}}>✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS PANEL ───────────────────────────────────────────────────────────
function ColorRow({label,bg,setBg,text,setText,T,accent}){
  const[bgD,setBgD]=useState(bg),[txtD,setTxtD]=useState(text);
  useEffect(()=>setBgD(bg),[bg]);useEffect(()=>setTxtD(text),[text]);
  const cBg=v=>{setBgD(v);if(/^#[0-9a-fA-F]{6}$/.test(v))setBg(v);};
  const cTxt=v=>{setTxtD(v);if(/^#[0-9a-fA-F]{6}$/.test(v))setText(v);};
  return(
    <div style={{marginBottom:14,padding:"11px",borderRadius:8,background:T.surface,border:`1px solid ${T.border}`}}>
      <div style={{fontFamily:FONT_MONO,fontSize:9,color:accent,letterSpacing:2,fontWeight:700,marginBottom:9}}>{label}</div>
      {[["BG",bg,setBg,bgD,setBgD,cBg],["TEXT",text,setText,txtD,setTxtD,cTxt]].map(([l,val,set,draft,setDraft,commit])=>(
        <div key={l} style={{display:"flex",gap:7,alignItems:"center",marginBottom:l==="BG"?6:0}}>
          <span style={{fontFamily:FONT_MONO,fontSize:8,color:T.dim,width:30}}>{l}</span>
          <input type="color" value={val} onChange={e=>set(e.target.value)} style={{width:28,height:24,border:`1px solid ${T.border}`,borderRadius:4,cursor:"pointer",padding:0,background:"transparent"}}/>
          <input type="text" value={draft} onChange={e=>commit(e.target.value)} style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:5,padding:"4px 8px",color:T.text,fontFamily:FONT_MONO,fontSize:10}}/>
        </div>
      ))}
    </div>
  );
}

function WidthControl({label,value,setValue,min,max,presets,T,accent,hint}){
  return(
    <div style={{marginBottom:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
        <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700}}>{label}</span>
        <span style={{fontFamily:FONT_MONO,fontSize:10,color:accent,fontWeight:700}}>{value}px</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e=>setValue(Number(e.target.value))}
        style={{width:"100%",accentColor:accent,marginBottom:7,display:"block"}}/>
      <div style={{display:"flex",gap:5,marginBottom:5}}>
        {presets.map(p=>(
          <button key={p.l} onClick={()=>setValue(p.v)}
            style={{flex:1,padding:"5px",borderRadius:5,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,color:value===p.v?accent:T.dim,background:value===p.v?`${accent}10`:"transparent",border:`1px solid ${value===p.v?`${accent}28`:T.border}`,cursor:"pointer"}}>
            {p.l}
          </button>
        ))}
      </div>
      {hint&&<div style={{fontFamily:FONT_MONO,fontSize:7.5,color:T.dim,letterSpacing:0.3}}>{hint}</div>}
    </div>
  );
}

// V10.5: honest, visible reassurance that paying customers' data actually
// survives — settings, chat history, trades/paper account, bot config, layouts.
// Two states only: really synced, or really local-only. No middle ground that
// could be misread as "probably fine."
function DataSyncStatus({user,T,accent}){
  const synced=!!user&&supabaseConfigured();
  return(
    <div style={{marginBottom:18,padding:"11px 13px",borderRadius:9,
      background:synced?`${accent}0a`:"rgba(247,201,72,0.08)",
      border:`1px solid ${synced?`${accent}30`:"rgba(247,201,72,0.35)"}`}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
        <span style={{fontSize:11}}>{synced?"✓":"⚠"}</span>
        <span style={{fontFamily:FONT_MONO,fontSize:9,fontWeight:800,letterSpacing:1.5,color:synced?accent:"#f7c948"}}>
          {synced?"YOUR DATA IS SAVED TO YOUR ACCOUNT":"LOCAL TO THIS DEVICE ONLY"}
        </span>
      </div>
      <div style={{fontFamily:FONT_CHAT,fontSize:10,color:T.dim,lineHeight:1.55}}>
        {synced?(
          <>Settings, theme, watchlist, chat history, layouts, bot panel style, cadence/conviction
          preferences, and your paper-trading/shadow account all sync to your account and
          follow you to any device you sign into.<br/><br/>
          <b style={{color:T.text}}>Local-only by design:</b> a broker API token you paste in (never
          stored server-side, for security) and an uploaded background video (too large to sync —
          background photos and colors do sync).</>
        ):(
          <>You're not signed in (or this deployment has no account backend configured), so
          everything — settings, watchlist, chat history, trades — lives only in this browser.
          Clearing your browser data or switching devices will lose it. Sign in to turn on
          account sync.</>
        )}
      </div>
    </div>
  );
}

function SettingsPanel(props){
  const{onClose,mainBg,setMainBg,mainText,setMainText,leftBg,setLeftBg,leftText,setLeftText,rightBg,setRightBg,rightText,setRightText,accentKey,setAccentKey,density,setDensity,leftWidth,setLeftWidth,rightWidth,setRightWidth,chartRightWidth,setChartRightWidth,onResetAll,T,accent,fontSize,setFontSize,chatStyle,setChatStyle,bgImage,setBgImage,user,onSignOut,themeSel,setThemeSel,sidePanels,setSidePanels,chatFont,setChatFont,onStartTour,bgVideo,onPickVideo,onRemoveVideo,displayName,setDisplayName,chatAutoDelete,setChatAutoDelete,onClearChatHistory,isDev,onPreviewV13Popup}=props;
  const[confirmClear,setConfirmClear]=useState(false);
  const[tab,setTab]=useState("themes");
  const[uploadErr,setUploadErr]=useState("");
  const[videoErr,setVideoErr]=useState("");

  // Background video: kept as a Blob in IndexedDB (a video data-URL would blow
  // past localStorage's ~5MB quota). Device-local by design — see the (i) note.
  const handleVideoUpload=async(e)=>{
    const file=e.target.files?.[0];e.target.value="";if(!file)return;
    setVideoErr("");
    if(!/^video\/(mp4|webm)$/.test(file.type)){setVideoErr("Use an MP4 or WebM video.");return;}
    if(file.size>60*1024*1024){setVideoErr(`Video too large (${(file.size/1048576).toFixed(0)}MB) — max 60MB.`);return;}
    try{await onPickVideo(file);}catch(err){setVideoErr("Could not save that video.");}
  };

  const handleBgUpload=(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    setUploadErr("");
    if(!/^image\//.test(file.type)){setUploadErr("Please choose an image file.");return;}
    if(file.size>8*1024*1024){setUploadErr("Image too large (max 8MB).");return;}
    const img=new Image();
    const reader=new FileReader();
    reader.onload=()=>{img.src=reader.result;};
    img.onload=()=>{
      // Downscale to max 1600px and compress so the data URL stays small.
      const scale=Math.min(1,1600/Math.max(img.width,img.height));
      const canvas=document.createElement("canvas");
      canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);
      canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      let dataUrl=canvas.toDataURL("image/jpeg",0.82);
      if(dataUrl.length>1_500_000)dataUrl=canvas.toDataURL("image/jpeg",0.6);
      if(dataUrl.length>1_500_000){setUploadErr("Image is too complex to compress — try a smaller photo.");return;}
      setBgImage(prev=>({...prev,dataUrl}));
    };
    img.onerror=()=>setUploadErr("Could not read that image.");
    reader.readAsDataURL(file);
    e.target.value="";
  };
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1000,display:"flex",justifyContent:"flex-end"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      {/* V11 M1: full-width sheet on a phone. A 310px drawer on a 375px screen
          leaves a useless 65px sliver of dimmed backdrop and squeezes the
          controls for no reason — on mobile the sheet IS the screen. */}
      <div className="kronos-settings-sheet" style={{background:T.panel,borderLeft:`1px solid ${T.border}`,padding:22,overflowY:"auto",boxShadow:"-8px 0 40px rgba(0,0,0,0.6)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <span style={{fontFamily:FONT_MONO,fontSize:11,fontWeight:700,color:accent,letterSpacing:3}}>⚙ SETTINGS</span>
          <button onClick={onClose} aria-label="Close settings" style={{color:T.dim,fontSize:17,cursor:"pointer",minWidth:44,minHeight:44,display:"flex",alignItems:"center",justifyContent:"flex-end"}}>✕</button>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:16}}>
          {["themes","colors","layout","personal"].map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              style={{flex:1,padding:"7px 2px",fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",color:tab===t?accent:T.dim,background:tab===t?`${accent}10`:"transparent",border:`1px solid ${tab===t?`${accent}28`:T.border}`,borderRadius:6,cursor:"pointer"}}>{t}</button>
          ))}
        </div>
        {tab==="themes"&&(
          <>
            {/* V10.4: theme picker — lightweight canvas themes vs looping-video themes.
                A group renders only if it has themes; video themes appear here
                automatically once their asset lands in public/themes/. */}
            <div style={{marginBottom:18}}>
              <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:9}}>TERMINAL THEME</div>
              {[["BASIC · LIGHTWEIGHT","basic"],["VIDEO · LOOPING","video"]].map(([groupLabel,groupId])=>{
                const group=THEME_LIST.filter(t=>t.group===groupId);
                if(!group.length)return null;
                return(
                <div key={groupId} style={{marginBottom:10}}>
                  <div style={{fontFamily:FONT_MONO,fontSize:7,color:T.dim,letterSpacing:2,marginBottom:5,opacity:0.7}}>{groupLabel}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {group.map(t=>(
                      <button key={t.id} onClick={()=>setThemeSel(prev=>({...prev,id:t.id}))} style={{
                        display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"7px 11px",borderRadius:8,cursor:"pointer",textAlign:"left",
                        color:themeSel?.id===t.id?accent:T.dim,
                        background:themeSel?.id===t.id?`${accent}10`:"transparent",
                        border:`1px solid ${themeSel?.id===t.id?`${accent}35`:T.border}`,transition:"all 0.2s",
                      }}>
                        <span style={{display:"flex",flexDirection:"column",gap:2,minWidth:0}}>
                          <span style={{fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:1}}>{t.label}{t.group==="video"?" ▶":""}</span>
                          <span style={{fontFamily:FONT_CHAT,fontSize:8.5,color:T.dim,lineHeight:1.35}}>{t.desc}</span>
                        </span>
                        {t.mb!=null&&(
                          <span title={`${t.mb} MB — downloaded once, then cached by the browser`}
                            style={{flexShrink:0,fontFamily:FONT_MONO,fontSize:7,color:t.mb>=3?"#f7c948":T.dim,border:`1px solid ${t.mb>=3?"#f7c94840":T.border}`,borderRadius:4,padding:"2px 5px"}}>{t.mb}MB</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );})}
              {/* Recolor ANY theme (canvas or video) */}
              {themeSel?.id!=="none"&&(
                <div style={{padding:"10px 12px",borderRadius:8,background:T.surface,border:`1px solid ${T.border}`,marginBottom:4}}>
                  {/* TINT — pick any color, blended over the theme. The intuitive lever:
                      "make this theme teal" is one click, not three sliders. */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <span style={{fontFamily:FONT_MONO,fontSize:8,color:T.dim,letterSpacing:1,fontWeight:700}}>THEME TINT</span>
                    {themeSel?.tint&&<button onClick={()=>setThemeSel(prev=>({...prev,tint:""}))} style={{fontFamily:FONT_MONO,fontSize:7,color:T.dim,background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"2px 7px",cursor:"pointer"}}>NONE</button>}
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
                    {/* "none" swatch + curated presets + custom picker */}
                    <button onClick={()=>setThemeSel(prev=>({...prev,tint:""}))} title="No tint"
                      style={{width:26,height:26,borderRadius:7,cursor:"pointer",background:"repeating-conic-gradient(#3a4a5a 0% 25%, transparent 0% 50%) 50% / 10px 10px",border:!themeSel?.tint?`2px solid ${accent}`:`2px solid transparent`,boxShadow:!themeSel?.tint?`0 0 8px ${accent}`:"none"}}/>
                    {["#00d4aa","#7eb8f7","#a78bfa","#ff6b6b","#f7c948","#ff8a5b","#22d3ee","#ec4899","#4ade80","#ffffff"].map(c=>(
                      <button key={c} onClick={()=>setThemeSel(prev=>({...prev,tint:c}))} title={c}
                        style={{width:26,height:26,borderRadius:7,background:c,cursor:"pointer",border:themeSel?.tint===c?"2px solid #fff":"2px solid transparent",boxShadow:themeSel?.tint===c?`0 0 10px ${c}`:"none",transition:"all 0.15s"}}/>
                    ))}
                    <label title="Custom color" style={{width:26,height:26,borderRadius:7,cursor:"pointer",position:"relative",overflow:"hidden",border:`2px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"center",background:"conic-gradient(red,#ff0,lime,cyan,blue,magenta,red)"}}>
                      <span style={{fontFamily:FONT_MONO,fontSize:12,color:"#fff",textShadow:"0 0 3px #000",fontWeight:800}}>+</span>
                      <input type="color" value={themeSel?.tint||"#00d4aa"} onChange={e=>setThemeSel(prev=>({...prev,tint:e.target.value}))} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer"}}/>
                    </label>
                  </div>
                  {themeSel?.tint&&(
                    <div style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                        <span style={{fontFamily:FONT_MONO,fontSize:8,color:T.dim,letterSpacing:1}}>TINT STRENGTH</span>
                        <span style={{fontFamily:FONT_MONO,fontSize:9,color:accent,fontWeight:700}}>{Math.round((themeSel?.tintStrength??0.5)*100)}%</span>
                      </div>
                      <input type="range" min={5} max={100} value={Math.round((themeSel?.tintStrength??0.5)*100)}
                        onChange={e=>setThemeSel(prev=>({...prev,tintStrength:Number(e.target.value)/100}))}
                        style={{width:"100%",accentColor:themeSel?.tint||accent}}/>
                    </div>
                  )}

                  {/* Fine adjustment — hue/sat/brightness on top of the tint */}
                  <div style={{fontFamily:FONT_MONO,fontSize:8,color:T.dim,letterSpacing:1,fontWeight:700,marginBottom:8,paddingTop:8,borderTop:`1px solid ${T.border}`}}>FINE ADJUST</div>
                  {[["HUE","hue",0,360,1,"°"],["SATURATION","sat",0,250,100,"%"],["BRIGHTNESS","bri",30,180,100,"%"]].map(([label,key,mn,mx,mul,unit])=>{
                    const val=key==="hue"?(themeSel?.hue||0):Math.round((themeSel?.[key]??1)*100);
                    return(
                      <div key={key} style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                          <span style={{fontFamily:FONT_MONO,fontSize:8,color:T.dim,letterSpacing:1}}>{label}</span>
                          <span style={{fontFamily:FONT_MONO,fontSize:9,color:accent,fontWeight:700}}>{val}{unit}</span>
                        </div>
                        <input type="range" min={mn} max={mx} value={val}
                          onChange={e=>{const n=Number(e.target.value);setThemeSel(prev=>({...prev,[key]:key==="hue"?n:n/100}));}}
                          style={{width:"100%",accentColor:accent}}/>
                      </div>
                    );
                  })}
                  <button onClick={()=>setThemeSel(prev=>({...prev,hue:0,sat:1,bri:1,tint:"",tintStrength:0.5}))}
                    style={{width:"100%",padding:"5px",borderRadius:6,background:"transparent",border:`1px solid ${T.border}`,color:T.dim,fontFamily:FONT_MONO,fontSize:8,letterSpacing:1,cursor:"pointer"}}>RESET COLOR</button>
                  {isVideoTheme(themeSel?.id)&&(
                    <div style={{fontFamily:FONT_MONO,fontSize:7.5,color:T.dim,marginTop:7,lineHeight:1.5,opacity:0.8}}>In the Kronos bot, the orb also tints automatically with the VIX (calm→teal, fear→red).</div>
                  )}
                </div>
              )}
              {(bgImage?.dataUrl||bgVideo?.enabled)&&<div style={{fontFamily:FONT_MONO,fontSize:8,color:"#f7c948",marginTop:8,lineHeight:1.5}}>⚠ Your background {bgVideo?.enabled?"video":"photo"} overrides the theme — remove it in the Personal tab to see the theme.</div>}
            </div>

            {/* V10: side panel transparency */}
            <div style={{marginBottom:18,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
              <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:9}}>SIDE PANELS (WATCHLIST / NEWS)</div>
              <div style={{display:"flex",gap:6,marginBottom:10}}>
                {[["solid","SOLID"],["transparent","TRANSPARENT"]].map(([m,label])=>(
                  <button key={m} onClick={()=>setSidePanels(prev=>({...prev,mode:m}))}
                    style={{flex:1,padding:"8px",borderRadius:7,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,color:sidePanels?.mode===m?accent:T.dim,background:sidePanels?.mode===m?`${accent}10`:"transparent",border:`1px solid ${sidePanels?.mode===m?`${accent}28`:T.border}`,cursor:"pointer"}}>{label}</button>
                ))}
              </div>
              {sidePanels?.mode==="transparent"&&(
                <>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700}}>PANEL OPACITY</span>
                    <span style={{fontFamily:FONT_MONO,fontSize:10,color:accent,fontWeight:700}}>{Math.round((sidePanels?.opacity??0.6)*100)}%</span>
                  </div>
                  <input type="range" min={15} max={95} value={Math.round((sidePanels?.opacity??0.6)*100)}
                    onChange={e=>setSidePanels(prev=>({...prev,opacity:Number(e.target.value)/100}))}
                    style={{width:"100%",accentColor:accent}}/>
                </>
              )}
            </div>

            {/* V10: font selector */}
            <div style={{marginBottom:18,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
              <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:9}}>TERMINAL FONT</div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {FONT_CHOICES.map(f=>(
                  <button key={f.id} onClick={()=>setChatFont(f.id)} style={{
                    padding:"8px 12px",borderRadius:7,cursor:"pointer",textAlign:"left",
                    fontFamily:f.stack,fontSize:12,
                    color:chatFont===f.id?accent:T.text,
                    background:chatFont===f.id?`${accent}10`:"transparent",
                    border:`1px solid ${chatFont===f.id?`${accent}30`:T.border}`,
                  }}>{f.label} — The quick brown fox, 1234.56</button>
                ))}
              </div>
            </div>

            {/* Chat box background — a look/feel setting, so it lives with Themes */}
            <div style={{marginBottom:18,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
              <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:9}}>CHAT BOX BACKGROUND</div>
              <div style={{display:"flex",gap:6,marginBottom:10}}>
                {[["solid","SOLID"],["transparent","TRANSPARENT"]].map(([m,label])=>(
                  <button key={m} onClick={()=>setChatStyle(prev=>({...prev,mode:m}))}
                    style={{flex:1,padding:"8px",borderRadius:7,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,color:chatStyle?.mode===m?accent:T.dim,background:chatStyle?.mode===m?`${accent}10`:"transparent",border:`1px solid ${chatStyle?.mode===m?`${accent}28`:T.border}`,cursor:"pointer"}}>{label}</button>
                ))}
              </div>
              {chatStyle?.mode==="solid"&&(
                <>
                  <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:10}}>
                    <span style={{fontFamily:FONT_MONO,fontSize:8,color:T.dim,width:44}}>COLOR</span>
                    <input type="color" value={chatStyle?.color||mainBg} onChange={e=>setChatStyle(prev=>({...prev,color:e.target.value}))}
                      style={{width:28,height:24,border:`1px solid ${T.border}`,borderRadius:4,cursor:"pointer",padding:0,background:"transparent"}}/>
                    <button onClick={()=>setChatStyle(prev=>({...prev,color:""}))}
                      style={{fontFamily:FONT_MONO,fontSize:8,color:T.dim,background:"transparent",border:`1px solid ${T.border}`,borderRadius:5,padding:"3px 8px",cursor:"pointer"}}>USE THEME</button>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700}}>OPACITY</span>
                    <span style={{fontFamily:FONT_MONO,fontSize:10,color:accent,fontWeight:700}}>{Math.round((chatStyle?.opacity??0.85)*100)}%</span>
                  </div>
                  <input type="range" min={20} max={100} value={Math.round((chatStyle?.opacity??0.85)*100)}
                    onChange={e=>setChatStyle(prev=>({...prev,opacity:Number(e.target.value)/100}))}
                    style={{width:"100%",accentColor:accent}}/>
                </>
              )}
              {chatStyle?.mode==="transparent"&&(
                <div style={{fontFamily:FONT_MONO,fontSize:8,color:T.dim,lineHeight:1.6}}>Chat floats directly over your background with a subtle blur for readability.</div>
              )}
            </div>
          </>
        )}

        {tab==="personal"&&(
          <>
            {/* V10.5: honest, visible confirmation of what's actually saved — see
                DataSyncStatus below for the exact list and the local-only exceptions. */}
            <DataSyncStatus user={user} T={T} accent={accent}/>

            {/* V13: PROFILE — name is remembered and follows the account. */}
            <div style={{marginBottom:18}}>
              <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:9}}>PROFILE</div>
              <label style={{display:"block",fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:1,marginBottom:6}}>DISPLAY NAME</label>
              <input type="text" value={displayName||""} maxLength={40} placeholder="What should we call you?"
                onChange={e=>setDisplayName(e.target.value)}
                style={{width:"100%",padding:"9px 10px",borderRadius:7,background:T.surface,border:`1px solid ${T.border}`,color:T.text,fontFamily:FONT_MONO,fontSize:11}}/>
              {isDev&&(
                <>
                  <a href="/admin" style={{display:"block",marginTop:10,padding:"9px",borderRadius:7,textAlign:"center",textDecoration:"none",background:`${accent}10`,border:`1px solid ${accent}30`,color:accent,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1.5}}>
                    ⚙ DEVELOPER BRAIN ACCESS
                  </a>
                  <button onClick={onPreviewV13Popup}
                    style={{width:"100%",marginTop:7,padding:"9px",borderRadius:7,background:"transparent",border:`1px solid ${T.border}`,color:T.dim,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1.5,cursor:"pointer"}}>
                    ✦ PREVIEW V13 POPUP
                  </button>
                </>
              )}
            </div>

            {/* V11 M3: signal push alerts — the reason mobile matters for a
                signals product. Self-gates on platform support + sign-in. */}
            <PushAlerts T={T} accent={accent} user={user}/>

            {/* V13: CHAT HISTORY — delete on demand + an auto-delete cadence. */}
            <div style={{marginBottom:18,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
              <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:9}}>CHAT HISTORY</div>
              <label style={{display:"block",fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:1,marginBottom:6}}>AUTO-DELETE</label>
              <select value={chatAutoDelete||"never"} onChange={e=>setChatAutoDelete(e.target.value)}
                style={{width:"100%",padding:"9px 10px",borderRadius:7,background:T.surface,border:`1px solid ${T.border}`,color:T.text,fontFamily:FONT_MONO,fontSize:10,marginBottom:10}}>
                {[["never","Never"],["session","Every session"],["daily","Daily"],["weekly","Weekly"],["monthly","Monthly"]].map(([v,l])=>(
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              {confirmClear?(
                <div style={{display:"flex",gap:6}}>
                  <button onClick={()=>{onClearChatHistory?.();setConfirmClear(false);}}
                    style={{flex:1,padding:"9px",borderRadius:7,background:"rgba(255,77,109,0.12)",border:"1px solid rgba(255,77,109,0.35)",color:"#ff4d6d",fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>CONFIRM DELETE</button>
                  <button onClick={()=>setConfirmClear(false)}
                    style={{flex:1,padding:"9px",borderRadius:7,background:"transparent",border:`1px solid ${T.border}`,color:T.dim,fontFamily:FONT_MONO,fontSize:9,letterSpacing:1,cursor:"pointer"}}>CANCEL</button>
                </div>
              ):(
                <button onClick={()=>setConfirmClear(true)}
                  style={{width:"100%",padding:"9px",borderRadius:7,background:"rgba(255,77,109,0.08)",border:"1px solid rgba(255,77,109,0.25)",color:"#ff4d6d",fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>DELETE CHAT HISTORY</button>
              )}
            </div>

            {/* ACCOUNT */}
            {user&&(
              <div style={{marginBottom:18}}>
                <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:9}}>ACCOUNT</div>
                <div style={{fontFamily:FONT_MONO,fontSize:10,color:T.text,marginBottom:10,overflow:"hidden",textOverflow:"ellipsis"}}>{user.email}</div>
                <button onClick={onSignOut}
                  style={{width:"100%",padding:"9px",borderRadius:7,background:"rgba(255,77,109,0.08)",border:"1px solid rgba(255,77,109,0.25)",color:"#ff4d6d",fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>SIGN OUT</button>
              </div>
            )}

            {/* BACKGROUND VIDEO (loops automatically) */}
            <div style={{marginBottom:18,paddingTop:user?14:0,borderTop:user?`1px solid ${T.border}`:"none"}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:9}}>
                <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700}}>BACKGROUND VIDEO</span>
                <span title={"Videos loop forever, on their own — muted and seamless, no controls.\n\nPicked for you: the video is stored on THIS device (it's far too large to sync to your account like other settings), so it won't follow you to another computer.\n\nMP4 or WebM, max 60MB. Use the dim slider below to keep the terminal readable."}
                  style={{width:14,height:14,borderRadius:"50%",display:"inline-flex",alignItems:"center",justifyContent:"center",fontFamily:FONT_MONO,fontSize:8,fontWeight:800,color:accent,border:`1px solid ${accent}55`,background:`${accent}12`,cursor:"help"}}>i</span>
              </div>
              {bgVideo?.enabled?(
                <div style={{marginBottom:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,padding:"8px 10px",borderRadius:8,border:`1px solid ${accent}30`,background:`${accent}08`,marginBottom:8}}>
                    <span style={{fontSize:13}}>🎞</span>
                    <span style={{flex:1,fontFamily:FONT_MONO,fontSize:9,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{bgVideo?.name||"background.mp4"}</span>
                    <span style={{fontFamily:FONT_MONO,fontSize:7,color:accent,letterSpacing:1}}>↻ LOOPING</span>
                  </div>
                  <button onClick={onRemoveVideo}
                    style={{width:"100%",padding:"7px",borderRadius:6,background:"rgba(255,77,109,0.08)",border:"1px solid rgba(255,77,109,0.25)",color:"#ff4d6d",fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>REMOVE VIDEO</button>
                </div>
              ):(
                <label style={{display:"block",width:"100%",padding:"16px 0",textAlign:"center",borderRadius:8,border:`1px dashed ${accent}45`,background:`${accent}08`,color:accent,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,cursor:"pointer",marginBottom:10}}>
                  + UPLOAD VIDEO (MP4/WEBM · AUTO-LOOPS)
                  <input type="file" accept="video/mp4,video/webm" onChange={handleVideoUpload} style={{display:"none"}}/>
                </label>
              )}
              {videoErr&&<div style={{fontFamily:FONT_MONO,fontSize:9,color:"#ff4d6d",marginBottom:8}}>⚠ {videoErr}</div>}
            </div>

            {/* BACKGROUND PHOTO */}
            <div style={{marginBottom:18,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
              <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:9}}>BACKGROUND PHOTO</div>
              {bgVideo?.enabled&&<div style={{fontFamily:FONT_MONO,fontSize:8,color:"#f7c948",marginBottom:8,lineHeight:1.5}}>⚠ Your video is active and takes priority over a photo.</div>}
              {bgImage?.dataUrl?(
                <div style={{marginBottom:10}}>
                  <div style={{width:"100%",height:90,borderRadius:8,border:`1px solid ${T.border}`,backgroundImage:`url(${bgImage.dataUrl})`,backgroundSize:"cover",backgroundPosition:"center",marginBottom:8}}/>
                  <button onClick={()=>setBgImage(prev=>({...prev,dataUrl:""}))}
                    style={{width:"100%",padding:"7px",borderRadius:6,background:"rgba(255,77,109,0.08)",border:"1px solid rgba(255,77,109,0.25)",color:"#ff4d6d",fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>REMOVE PHOTO</button>
                </div>
              ):(
                <label style={{display:"block",width:"100%",padding:"16px 0",textAlign:"center",borderRadius:8,border:`1px dashed ${accent}45`,background:`${accent}08`,color:accent,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,cursor:"pointer",marginBottom:10}}>
                  + UPLOAD PHOTO (JPG/PNG, AUTO-COMPRESSED)
                  <input type="file" accept="image/*" onChange={handleBgUpload} style={{display:"none"}}/>
                </label>
              )}
              {uploadErr&&<div style={{fontFamily:FONT_MONO,fontSize:9,color:"#ff4d6d",marginBottom:8}}>⚠ {uploadErr}</div>}
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700}}>PHOTO DIM</span>
                <span style={{fontFamily:FONT_MONO,fontSize:10,color:accent,fontWeight:700}}>{Math.round((bgImage?.dim??0.6)*100)}%</span>
              </div>
              <input type="range" min={0} max={95} value={Math.round((bgImage?.dim??0.6)*100)}
                onChange={e=>setBgImage(prev=>({...prev,dim:Number(e.target.value)/100}))}
                style={{width:"100%",accentColor:accent}}/>
              {bgImage?.dataUrl&&(
                <>
                  {/* V10 item 3: user-controlled photo position */}
                  <div style={{display:"flex",justifyContent:"space-between",margin:"10px 0 6px"}}>
                    <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700}}>POSITION ←→</span>
                    <span style={{fontFamily:FONT_MONO,fontSize:10,color:accent,fontWeight:700}}>{bgImage?.posX??50}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={bgImage?.posX??50}
                    onChange={e=>setBgImage(prev=>({...prev,posX:Number(e.target.value)}))}
                    style={{width:"100%",accentColor:accent}}/>
                  <div style={{display:"flex",justifyContent:"space-between",margin:"8px 0 6px"}}>
                    <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700}}>POSITION ↑↓</span>
                    <span style={{fontFamily:FONT_MONO,fontSize:10,color:accent,fontWeight:700}}>{bgImage?.posY??50}%</span>
                  </div>
                  <input type="range" min={0} max={100} value={bgImage?.posY??50}
                    onChange={e=>setBgImage(prev=>({...prev,posY:Number(e.target.value)}))}
                    style={{width:"100%",accentColor:accent}}/>
                  <button onClick={()=>setBgImage(prev=>({...prev,posX:50,posY:50}))}
                    style={{marginTop:8,width:"100%",padding:"6px",borderRadius:6,background:"transparent",border:`1px solid ${T.border}`,color:T.dim,fontFamily:FONT_MONO,fontSize:9,letterSpacing:1,cursor:"pointer"}}>RE-CENTER</button>
                </>
              )}
            </div>
            {/* Relaunch tour */}
            {onStartTour&&(
              <div style={{marginBottom:18,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
                <button onClick={()=>{onClose();onStartTour();}} style={{width:"100%",padding:"10px",borderRadius:8,background:`${accent}10`,border:`1px solid ${accent}30`,color:accent,fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:2,cursor:"pointer"}}>
                  🧭 TAKE THE TOUR AGAIN
                </button>
              </div>
            )}

            {/* LEGAL */}
            <div style={{marginBottom:6,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
              <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:9}}>LEGAL</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[["terms","Terms of Service"],["privacy","Privacy Policy"],["disclaimer","Risk Disclaimer"]].map(([id,label])=>(
                  <a key={id} href={`/legal#${id}`} target="_blank" rel="noopener noreferrer"
                    style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 12px",borderRadius:8,textDecoration:"none",background:T.surface,border:`1px solid ${T.border}`,color:T.text,fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:0.5}}>
                    {label}<span style={{color:T.dim,fontSize:11}}>↗</span>
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
        {tab==="colors"&&(
          <>
            <div style={{marginBottom:16}}>
              <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:9}}>ACCENT COLOR</div>
              <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                {Object.entries(ACCENTS).map(([k,c])=>(
                  <button key={k} onClick={()=>setAccentKey(k)}
                    style={{width:30,height:30,borderRadius:7,background:c,cursor:"pointer",border:accentKey===k?"3px solid #fff":"3px solid transparent",boxShadow:accentKey===k?`0 0 12px ${c}`:"",transition:"all 0.15s"}}/>
                ))}
              </div>
            </div>
            <ColorRow label="MAIN / CHAT AREA" bg={mainBg} setBg={setMainBg} text={mainText} setText={setMainText} T={T} accent={accent}/>
            <ColorRow label="LEFT PANEL (WATCHLIST)" bg={leftBg} setBg={setLeftBg} text={leftText} setText={setLeftText} T={T} accent={accent}/>
            <ColorRow label="RIGHT PANEL (NEWS / CHART AI)" bg={rightBg} setBg={setRightBg} text={rightText} setText={setRightText} T={T} accent={accent}/>
          </>
        )}
        {tab==="layout"&&(
          <>
            <div style={{marginBottom:18}}>
              <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700,marginBottom:9}}>DENSITY</div>
              <div style={{display:"flex",gap:7}}>
                {["comfortable","compact"].map(d=>(
                  <button key={d} onClick={()=>setDensity(d)}
                    style={{flex:1,padding:"8px",borderRadius:7,fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",color:density===d?accent:T.dim,background:density===d?`${accent}10`:"transparent",border:`1px solid ${density===d?`${accent}28`:T.border}`,cursor:"pointer"}}>{d}</button>
                ))}
              </div>
            </div>
            <WidthControl label="LEFT PANEL WIDTH" value={leftWidth} setValue={setLeftWidth} min={180} max={500} presets={[{l:"Narrow",v:220},{l:"Standard",v:290},{l:"Wide",v:360}]} T={T} accent={accent} hint="💡 Or drag the panel border directly"/>
            <WidthControl label="RIGHT PANEL WIDTH" value={rightWidth} setValue={setRightWidth} min={200} max={560} presets={[{l:"Narrow",v:260},{l:"Standard",v:310},{l:"Wide",v:380}]} T={T} accent={accent} hint="💡 Or drag the panel border directly"/>
            <WidthControl label="CHART AI PANEL WIDTH" value={chartRightWidth} setValue={setChartRightWidth} min={200} max={600} presets={[{l:"Narrow",v:280},{l:"Standard",v:340},{l:"Wide",v:420}]} T={T} accent={accent} hint="💡 Or drag the panel border directly"/>
            <div style={{marginTop:18,paddingTop:14,borderTop:`1px solid ${T.border}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,letterSpacing:2,fontWeight:700}}>GLOBAL TEXT &amp; TAB SIZE</span>
                <span style={{fontFamily:FONT_MONO,fontSize:10,color:accent,fontWeight:700}}>{fontSize}px</span>
              </div>
              {/* V10.5: this used to be 4 fixed buttons that only scaled body text —
                  the nav tabs (Trading Terminal / Data / Chart / bot sub-tabs) were
                  hardcoded in px and never moved, so it looked broken. Now a real
                  slider, and the tab labels below scale off this value too. */}
              <input type="range" min={11} max={20} step={1} value={fontSize}
                onChange={e=>{const v=Number(e.target.value);setFontSize(v);localStorage.setItem("kronos_font_size",v);}}
                style={{width:"100%",accentColor:accent,marginBottom:7,display:"block"}}/>
              <div style={{display:"flex",gap:6}}>
                {[{label:"S",val:12},{label:"M",val:14},{label:"L",val:16},{label:"XL",val:18}].map(({label,val})=>(
                  <button key={val} onClick={()=>{setFontSize(val);localStorage.setItem("kronos_font_size",val);}} style={{
                    flex:1,padding:"7px 0",fontFamily:FONT_MONO,fontSize:10,fontWeight:700,
                    color:fontSize===val?accent:T.dim,
                    background:fontSize===val?`${accent}12`:"transparent",
                    border:`1px solid ${fontSize===val?accent+"40":T.border}`,
                    borderRadius:7,cursor:"pointer",transition:"all 0.15s",
                  }}>{label}</button>
                ))}
              </div>
            </div>
          </>
        )}
        <button onClick={onResetAll} style={{width:"100%",padding:"9px",borderRadius:7,background:"transparent",border:`1px solid ${T.border}`,color:T.dim,fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer",marginTop:6,marginBottom:16}}>RESET ALL TO DEFAULT</button>
        <div style={{padding:"10px",borderRadius:8,background:T.surface,border:`1px solid ${T.border}`}}>
          <div style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,lineHeight:1.7}}>This terminal is a proprietary research intelligence system.<br/>⚠️ Not financial advice. All setups are probability-based analysis.</div>
        </div>
      </div>
    </div>
  );
}

// ─── RIGHT NEWS PANEL ─────────────────────────────────────────────────────────
// V10.5: any BREAKING item or LIVE speech makes the header pulse, so the user
// looks up from the chart. Kept narrow on purpose (see lib/newsImpact.detectBreaking)
// — if everything pulses, nothing does.
export function breakingItems(news){
  return (news||[]).filter(n=>n?.impact?.breaking);
}
function NewsPanel({news,onDiveDeep,onRefresh,refreshing,lastUpd,accent,T,density}){
  const alerts=breakingItems(news);
  const live=alerts.some(a=>a.impact?.live);
  const alertColor=live?"#ff3d57":"#f7c948";
  return(
    <div style={{width:"100%",display:"flex",flexDirection:"column",background:T.panel,height:"100%"}}>
      <div style={{padding:"11px 14px",borderBottom:`1px solid ${alerts.length?`${alertColor}45`:T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,background:alerts.length?`${alertColor}0c`:"transparent",transition:"background 0.4s"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:alerts.length?alertColor:accent,boxShadow:`0 0 8px ${alerts.length?alertColor:accent}`,animation:alerts.length?"news-pulse 1.1s ease-in-out infinite":"none"}}/>
          <span style={{fontFamily:FONT_SERIF,fontSize:15,fontWeight:700,color:T.text,letterSpacing:0.3}}>News</span>
          {alerts.length>0&&(
            <span style={{
              fontFamily:FONT_MONO,fontSize:7.5,fontWeight:800,letterSpacing:1.5,color:alertColor,
              background:`${alertColor}18`,border:`1px solid ${alertColor}55`,borderRadius:4,padding:"2px 6px",
              animation:"news-pulse 1.1s ease-in-out infinite",
            }}>
              {live?"● LIVE":"● BREAKING"}{alerts.length>1?` ${alerts.length}`:""}
            </span>
          )}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontFamily:FONT_MONO,fontSize:8,color:T.dim}}>{lastUpd?new Date(lastUpd).toLocaleTimeString():""}</span>
          <button onClick={onRefresh} title="Refresh news"
            style={{width:24,height:24,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:accent,background:`${accent}10`,border:`1px solid ${accent}22`,cursor:"pointer",animation:refreshing?"spin 0.7s linear infinite":"none"}}>↻</button>
        </div>
      </div>
      {alerts.length>0&&(
        <div onClick={()=>onDiveDeep?.(alerts[0])} title="Analyze this"
          style={{padding:"7px 14px",borderBottom:`1px solid ${alertColor}30`,background:`${alertColor}12`,flexShrink:0,cursor:"pointer"}}>
          <div style={{fontFamily:FONT_MONO,fontSize:7,color:alertColor,letterSpacing:2,fontWeight:800,marginBottom:2}}>
            {live?"LIVE NOW":"BREAKING"}
          </div>
          <div style={{fontFamily:FONT_CHAT,fontSize:11,color:T.text,lineHeight:1.4,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>
            {alerts[0].headline}
          </div>
        </div>
      )}
      <div style={{padding:"4px 14px",borderBottom:`1px solid ${T.border}`,background:"rgba(255,107,53,0.025)",flexShrink:0}}>
        <span style={{fontFamily:FONT_MONO,fontSize:8,color:T.dim,letterSpacing:1}}>Ⓣ TRUMP FLAGGED INLINE · CLICK TO ANALYZE</span>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>
        {news.length===0&&<div style={{padding:18,textAlign:"center",fontFamily:FONT_MONO,fontSize:10,color:T.dim}}>LOADING NEWS...</div>}
        {news.map((item,i)=><NewsCard key={item.id||i} item={item} onDiveDeep={onDiveDeep} T={T}/>)}
      </div>
    </div>
  );
}

// ─── CHART PAGE ───────────────────────────────────────────────────────────────
// V10.6: intervals are now OUR codes (what /api/candles + the signal engine
// speak), not TradingView widget codes. The embed is gone, so its vocabulary
// goes with it.
const CHART_INTERVALS=[["1min","1m"],["5min","5m"],["15min","15m"],["1h","1h"],["4h","4h"],["1d","1D"],["1w","1W"],["1mo","1M"]];
// Anyone with a persisted TradingView code from V10.5 gets mapped across once;
// an unknown value falls back to 1d rather than requesting garbage from the API.
const TV_INTERVAL_MIGRATION={"1":"1min","5":"5min","15":"15min","60":"1h","240":"4h","D":"1d","W":"1w","M":"1mo"};
export function migrateChartInterval(iv){
  if(!iv)return "1d";
  if(CHART_INTERVALS.some(([code])=>code===iv))return iv;
  return TV_INTERVAL_MIGRATION[iv]||"1d";
}
function ChartPage({symbol,onSymbolChange,interval="1d",onIntervalChange,annotations,onClearAnnotations,messages,input,setInput,fontSize=14,send,loading,onButton,accent,T,TR,chartRightWidth,onStartResizeRight,isMobile=false}){
  const chatEndRef=useRef(null);
  const chatScrollRef=useRef(null);
  const[atBottom,setAtBottom]=useState(true);
  const[symInput,setSymInput]=useState(symbol);
  const isDark=luminance(TR.bg)<=0.55;
  // V13: only auto-scroll on a new message if the user was already at the
  // bottom — otherwise a reply mid-scrollback would yank them back down.
  useEffect(()=>{if(atBottom)chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);
  const onChatScroll=useCallback((e)=>{
    const el=e.currentTarget;
    setAtBottom(el.scrollHeight-el.scrollTop-el.clientHeight<40);
  },[]);
  useEffect(()=>setSymInput(symbol),[symbol]);
  const handleSymKey=(e)=>{if(e.key==="Enter"&&symInput.trim())onSymbolChange(symInput.trim().toUpperCase());};
  const handleKey=(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}};
  return(
    // Mobile stacks chart OVER chat rather than showing chart alone. The AI draws
    // and explains in the same breath — splitting those across two tabs would
    // mean reading the answer here and the drawing somewhere else, which is
    // exactly the thing this feature exists to avoid.
    <div style={{flex:1,display:"flex",flexDirection:isMobile?"column":"row",overflow:"hidden",minWidth:0}}>
      {/* Chart area */}
      <div style={{flex:isMobile?"1.45 1 0":"1",display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0,minHeight:0}}>
        <div style={{padding:"8px 14px",borderBottom:`1px solid ${T.border}`,background:T.panel,display:"flex",alignItems:"center",gap:10,flexShrink:0,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,background:T.surface,border:`1px solid ${T.border}`,borderRadius:7,padding:"5px 10px"}}>
            <input value={symInput} onChange={e=>setSymInput(e.target.value.toUpperCase())} onKeyDown={handleSymKey}
              placeholder="TICKER..." style={{background:"transparent",border:"none",color:T.text,fontFamily:FONT_MONO,fontSize:13,fontWeight:700,letterSpacing:1,width:75}}/>
            <button onClick={()=>{if(symInput.trim())onSymbolChange(symInput.trim().toUpperCase());}}
              style={{fontFamily:FONT_MONO,fontSize:10,color:accent,background:`${accent}12`,border:`1px solid ${accent}25`,borderRadius:5,padding:"2px 8px",fontWeight:700,cursor:"pointer"}}>LOAD</button>
          </div>
          {/* V10 item 4: ticker quick-list removed — search bar only */}
          {/* AI-drawn annotations are the user's to dismiss — never a one-way door. */}
          {annotations?.filter(a=>a.symbol===symbol).length>0&&(
            <button onClick={onClearAnnotations}
              title="Remove all drawings on this chart"
              style={{fontFamily:FONT_MONO,fontSize:9,fontWeight:700,padding:"4px 9px",borderRadius:5,cursor:"pointer",
                color:T.dim,background:"transparent",border:`1px solid ${T.border}`}}>
              ✕ CLEAR {annotations.filter(a=>a.symbol===symbol).length} DRAWING{annotations.filter(a=>a.symbol===symbol).length>1?"S":""}
            </button>
          )}
          {/* 8 intervals don't fit on a 375px row — scroll them horizontally
              rather than wrapping into a second row that eats chart height. */}
          <div style={{display:"flex",gap:3,marginLeft:isMobile?0:"auto",overflowX:isMobile?"auto":"visible",WebkitOverflowScrolling:"touch",maxWidth:"100%"}}>
            {CHART_INTERVALS.map(([code,label])=>(
              <button key={code} onClick={()=>onIntervalChange(code)}
                style={{fontFamily:FONT_MONO,fontSize:9,fontWeight:700,padding:isMobile?"7px 10px":"4px 7px",borderRadius:5,cursor:"pointer",flexShrink:0,
                  color:interval===code?accent:T.dim,background:interval===code?`${accent}14`:"transparent",
                  border:`1px solid ${interval===code?`${accent}30`:T.border}`}}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{flex:1,minHeight:0}}>
          <LightweightChart symbol={symbol} interval={interval} T={T} accent={accent} annotations={annotations||[]}/>
        </div>
      </div>
      {/* Drag-to-resize is a mouse affordance; there's nothing to drag with a thumb. */}
      {!isMobile&&<ResizeDivider onMouseDown={onStartResizeRight} accent={accent}/>}
      {/* AI Chat panel — a fixed px width on a phone would push the chart off-screen,
          so on mobile it becomes a flex row under the chart instead. */}
      <div style={isMobile
        ?{flex:"1 1 0",minHeight:0,borderTop:`1px solid ${TR.border}`,display:"flex",flexDirection:"column",background:TR.panel}
        :{width:chartRightWidth,minWidth:chartRightWidth,borderLeft:`1px solid ${TR.border}`,display:"flex",flexDirection:"column",background:TR.panel}}>
        <div style={{padding:"11px 14px",borderBottom:`1px solid ${TR.border}`,display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:accent,boxShadow:`0 0 8px ${accent}`}}/>
          <span style={{fontFamily:FONT_MONO,fontSize:10,fontWeight:700,color:accent,letterSpacing:2}}>AI DESK</span>
        </div>
        <div style={{flex:1,minHeight:0,position:"relative"}}>
          <div ref={chatScrollRef} onScroll={onChatScroll} style={{height:"100%",overflowY:"auto",padding:"12px 12px"}}>
            {messages.slice(-30).map((msg,i)=><ChatMessage key={i} msg={msg} accent={accent} T={TR} fontSize={fontSize} onButton={onButton}/>)}
            {loading&&<TypingIndicator accent={accent}/>}
            <div ref={chatEndRef}/>
          </div>
          {!atBottom&&(
            <button onClick={()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});setAtBottom(true);}}
              title="Scroll to bottom"
              style={{position:"absolute",bottom:10,right:14,width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:accent,background:TR.panel,border:`1px solid ${accent}40`,boxShadow:"0 4px 14px rgba(0,0,0,0.35)",cursor:"pointer"}}>↓</button>
          )}
        </div>
        <div style={{padding:"8px 12px 14px",borderTop:`1px solid ${TR.border}`,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"flex-end",gap:7,background:TR.surface,border:`1px solid ${TR.border}`,borderRadius:9,padding:"7px 10px"}}
            onFocusCapture={e=>e.currentTarget.style.borderColor=`${accent}32`}
            onBlurCapture={e=>e.currentTarget.style.borderColor=TR.border}>
            <span style={{fontFamily:FONT_MONO,fontSize:11,color:accent,paddingBottom:1,animation:"blink 1.2s infinite"}}>▸</span>
            <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
              placeholder={`Ask about ${symbol}...`} rows={1}
              style={{flex:1,background:"transparent",border:"none",color:TR.text,fontFamily:FONT_CHAT,fontSize:13,lineHeight:1.5,maxHeight:80,overflowY:"auto"}}
              onInput={e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,80)+"px";}}/>
            <button onClick={send} disabled={!input.trim()||loading}
              style={{width:26,height:26,borderRadius:6,flexShrink:0,background:input.trim()&&!loading?`${accent}12`:"transparent",border:`1px solid ${input.trim()&&!loading?`${accent}28`:TR.border}`,color:input.trim()&&!loading?accent:TR.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>▸</button>
          </div>
          <div style={{marginTop:3,textAlign:"center"}}>
            <span style={{fontFamily:FONT_MONO,fontSize:7.5,color:TR.dim,letterSpacing:1}}>NOT FINANCIAL ADVICE</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DATA PAGE ────────────────────────────────────────────────────────────────
// V10.5: filings/insiders carry a real rating. It arrives in two stages — a
// deterministic baseline from the API, then an AI-reasoned refinement that only
// lands after the model has actually interrogated the filing (/api/filing-intel).
// The ⓘ tooltip shows the reasoning, so the number is never a black box.
function ImpactChip({impact,T}){
  const[hov,setHov]=useState(false);
  if(!impact)return null;
  const s=impact.score??0;
  const c=s>=70?"#22c55e":s>=45?"#facc15":"#8896a8";
  const reasoned=impact.source==="ai";
  const why=impact.reasoning||impact.explanation;
  return(
    <div style={{position:"relative",marginTop:5}}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <div style={{flex:1,height:3,borderRadius:2,background:"rgba(127,127,127,0.14)",overflow:"hidden"}}>
          <div style={{width:`${s}%`,height:"100%",borderRadius:2,background:"linear-gradient(90deg,#ef4444,#f59e0b 45%,#facc15 65%,#22c55e)",transition:"width 0.5s"}}/>
        </div>
        <span style={{fontFamily:FONT_MONO,fontSize:7,fontWeight:800,letterSpacing:1,color:c,whiteSpace:"nowrap"}}>
          {impact.label}{reasoned?" ✦":""}
        </span>
      </div>
      {hov&&why&&(
        <div style={{
          position:"absolute",bottom:"calc(100% + 6px)",left:0,zIndex:50,width:220,
          background:"rgba(8,14,24,0.97)",border:`1px solid ${s>=70?"rgba(34,197,94,0.4)":T.border}`,
          borderRadius:8,padding:"9px 11px",boxShadow:"0 8px 22px rgba(0,0,0,0.5)",pointerEvents:"none",
        }}>
          <div style={{fontFamily:FONT_MONO,fontSize:8,fontWeight:800,letterSpacing:1.5,marginBottom:4,color:c}}>
            {impact.label} · {s}/100
          </div>
          <div style={{fontFamily:FONT_CHAT,fontSize:10,color:"#aebccc",lineHeight:1.5}}>{why}</div>
          {impact.takeaway&&(
            <div style={{fontFamily:FONT_CHAT,fontSize:9.5,color:"#9DB4CC",lineHeight:1.5,marginTop:5,paddingTop:5,borderTop:`1px solid ${T.border}`}}>
              → {impact.takeaway}
            </div>
          )}
          <div style={{fontFamily:FONT_MONO,fontSize:7,color:"#5a6b7a",marginTop:6,letterSpacing:0.5}}>
            {reasoned?"AI-reasoned":"Baseline — awaiting AI pass"}
          </div>
        </div>
      )}
    </div>
  );
}

// V10 items 2+6: every card is drag-and-drop + resizable via GridDock when the
// user customizes; classic auto-fit grid otherwise.
// V10.5: the "options" (Options Intelligence) panel was REMOVED — it never worked
// reliably. Saved user layouts may still contain an {i:"options"} entry; GridDock
// renders only the keys present in `items`, so a stale entry is ignored rather
// than crashing. It's filtered out on load anyway (see migrateDataLayout).
// V12.1: keys are namespaced `data_*` so the Data view's collapse + layout state
// no longer collides with the Terminal view's same-named panels. Both views shared
// one flat `collapsed` map keyed by panel name, so collapsing `news` in the terminal
// silently collapsed `news` on the Data page too (and stuck it that way in edit mode).
const DEFAULT_DATA_LAYOUT=[
  {i:"data_news",x:0,y:0,w:4,h:6,minW:2,minH:3},
  {i:"data_filings",x:4,y:0,w:4,h:6,minW:2,minH:3},
  {i:"data_insiders",x:8,y:0,w:4,h:6,minW:2,minH:3},
  {i:"data_desk",x:0,y:6,w:12,h:6,minW:3,minH:3},
];
// Strip panels that no longer exist from a persisted layout. (Movers is NOT a
// grid card — it's a fixed panel at the top of the Data page — so it's absent here.)
const LIVE_DATA_PANELS=new Set(["data_news","data_filings","data_insiders","data_desk"]);
// Old saved layouts used bare keys (news/filings/…) — remap them to the namespaced
// keys so a user's saved arrangement survives the rename instead of being dropped.
const DATA_KEY_REMAP={news:"data_news",filings:"data_filings",insiders:"data_insiders",desk:"data_desk"};
export function migrateDataLayout(l){
  if(!Array.isArray(l)) return l;   // undefined → flex fallback (no forced grid)
  return l.map((p)=>{const i=DATA_KEY_REMAP[p.i]||p.i;return LIVE_DATA_PANELS.has(i)?{...p,i}:null;}).filter(Boolean);
}
function DataPage({news,secData,secLoading,onRefreshAll,onDiveNews,onDiveFiling,onDiveInsider,messages,input,setInput,send,loading,onOpenChat,accent,T,watchlist,gridLayout,onGridChange,editMode,collapsed,onToggleCollapse,onPickTicker}){
  const moversCard=(
    <MoversPanel T={T} accent={accent} onPick={onPickTicker} fill/>
  );
  const lastMsg=[...messages].reverse().find(m=>m.role==="assistant");
  const handleKey=(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}};

  const newsCard=(
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:14,height:"100%",display:"flex",flexDirection:"column",minHeight:0}}>
      <div style={{fontFamily:FONT_MONO,fontSize:9,color:"#f7c948",letterSpacing:2,fontWeight:700,marginBottom:10,flexShrink:0}}>📰 BREAKING / LIVE NEWS</div>
      <div style={{overflowY:"auto",flex:1,minHeight:0}}>
        {news.slice(0,12).map((item,i)=><NewsCard key={item.id||i} item={item} onDiveDeep={onDiveNews} T={T}/>)}
      </div>
    </div>
  );
  const filingsCard=(
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:14,height:"100%",display:"flex",flexDirection:"column",minHeight:0}}>
      <div style={{fontFamily:FONT_MONO,fontSize:9,color:"#7eb8f7",letterSpacing:2,fontWeight:700,marginBottom:10,flexShrink:0}}>📋 SEC FILINGS</div>
      <div style={{overflowY:"auto",flex:1,minHeight:0}}>
        {secLoading&&<div style={{fontFamily:FONT_MONO,fontSize:10,color:T.dim,padding:8}}>Loading from SEC EDGAR...</div>}
        {!secLoading&&(secData?.filings||[]).length===0&&<div style={{fontFamily:FONT_MONO,fontSize:10,color:T.dim,padding:8}}>No recent filings for your watchlist.</div>}
        {(secData?.filings||[]).map((f,i)=>(
          <div key={i} onClick={()=>onDiveFiling(f)}
            style={{background:"rgba(126,184,247,0.06)",border:"1px solid rgba(126,184,247,0.18)",borderLeft:"3px solid #7eb8f7",borderRadius:7,padding:"8px 10px",marginBottom:6,cursor:"pointer"}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(126,184,247,0.12)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(126,184,247,0.06)"}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
              <span style={{fontFamily:FONT_MONO,fontSize:11,fontWeight:700,color:"#7eb8f7"}}>{f.symbol} · {f.form}</span>
              <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim}}>{f.date}</span>
            </div>
            <span style={{fontFamily:FONT_CHAT,fontSize:10.5,color:T.textDim}}>{f.formName||f.form}</span>
            <ImpactChip impact={f.impact} T={T}/>
          </div>
        ))}
      </div>
    </div>
  );
  const insidersCard=(
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:14,height:"100%",display:"flex",flexDirection:"column",minHeight:0}}>
      <div style={{fontFamily:FONT_MONO,fontSize:9,color:"#a78bfa",letterSpacing:2,fontWeight:700,marginBottom:10,flexShrink:0}}>👤 INSIDER TRADES (FORM 4)</div>
      <div style={{overflowY:"auto",flex:1,minHeight:0}}>
        {secLoading&&<div style={{fontFamily:FONT_MONO,fontSize:10,color:T.dim,padding:8}}>Loading from SEC EDGAR...</div>}
        {!secLoading&&(secData?.insiderTrades||[]).length===0&&<div style={{fontFamily:FONT_MONO,fontSize:10,color:T.dim,padding:8}}>No recent Form 4s for your watchlist.</div>}
        {(secData?.insiderTrades||[]).map((t,i)=>(
          <div key={i} onClick={()=>onDiveInsider(t)}
            style={{background:"rgba(167,139,250,0.06)",border:"1px solid rgba(167,139,250,0.18)",borderLeft:"3px solid #a78bfa",borderRadius:7,padding:"8px 10px",marginBottom:6,cursor:"pointer"}}
            onMouseEnter={e=>e.currentTarget.style.background="rgba(167,139,250,0.12)"}
            onMouseLeave={e=>e.currentTarget.style.background="rgba(167,139,250,0.06)"}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontFamily:FONT_MONO,fontSize:11,fontWeight:700,color:"#a78bfa"}}>{t.symbol}</span>
                {/* The transaction TYPE is the whole signal — a BUY and a tax
                    withholding are not the same event. Show it, don't hide it. */}
                {t.txnCode&&(()=>{const buy=t.txnCode==="P";const sell=t.txnCode==="S";
                  const c=buy?"#00e676":sell?"#ff8a5b":"#8896a8";
                  const lbl=({P:"BUY",S:"SELL",A:"GRANT",M:"EXERCISE",F:"TAX",G:"GIFT",C:"CONVERT"})[t.txnCode]||t.txnCode;
                  return <span style={{fontFamily:FONT_MONO,fontSize:7,fontWeight:800,letterSpacing:1,color:c,border:`1px solid ${c}55`,background:`${c}14`,borderRadius:3,padding:"1px 5px"}}>{lbl}</span>;})()}
              </span>
              <span style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim}}>{t.date}</span>
            </div>
            {(t.insiderName||t.txnValue)&&(
              <div style={{fontFamily:FONT_CHAT,fontSize:9.5,color:T.dim,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {t.insiderName||"Insider"}{t.officerTitle?` · ${t.officerTitle}`:t.isDirector?" · Director":""}
                {t.txnValue?` · $${Number(t.txnValue).toLocaleString()}`:""}
              </div>
            )}
            <ImpactChip impact={t.impact} T={T}/>
          </div>
        ))}
      </div>
    </div>
  );
  const deskCard=(
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:14,height:"100%",display:"flex",flexDirection:"column",minHeight:0}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:9,flexShrink:0}}>
        <span style={{fontFamily:FONT_MONO,fontSize:9,color:accent,letterSpacing:2,fontWeight:700}}>◈ ASK THE DESK</span>
        <button onClick={onOpenChat} style={{fontFamily:FONT_MONO,fontSize:9,color:T.dim,cursor:"pointer",textDecoration:"underline"}}>Open full chat →</button>
      </div>
      {lastMsg&&(
        <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"9px 12px",marginBottom:9,flex:1,overflowY:"auto",minHeight:0}}>
          <p style={{fontFamily:FONT_CHAT,fontSize:12.5,color:T.textDim,lineHeight:1.5,margin:0,whiteSpace:"pre-wrap"}}>{lastMsg.content.slice(0,600)}{lastMsg.content.length>600?"...":""}</p>
        </div>
      )}
      <div style={{display:"flex",gap:8,flexShrink:0}}>
        <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
          placeholder="Quick question for the desk..." rows={1}
          style={{flex:1,background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 12px",color:T.text,fontFamily:FONT_CHAT,fontSize:13,resize:"none"}}/>
        <button onClick={send} disabled={!input.trim()||loading}
          style={{padding:"0 16px",borderRadius:8,background:input.trim()&&!loading?`${accent}15`:"transparent",border:`1px solid ${input.trim()&&!loading?`${accent}30`:T.border}`,color:input.trim()&&!loading?accent:T.dim,fontFamily:FONT_MONO,fontSize:12,fontWeight:700,cursor:"pointer"}}>
          {loading?"...":"ASK"}
        </button>
      </div>
    </div>
  );

  const useGrid=editMode||Boolean(gridLayout);

  return(
    <div style={{flex:1,display:"flex",flexDirection:"column",background:T.bg,overflow:"hidden",minHeight:0}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",padding:"20px 22px 12px",flexShrink:0}}>
        <div>
          <div style={{fontFamily:FONT_DISPLAY,fontSize:24,fontWeight:700,color:T.text,letterSpacing:0.2}}>Data</div>
          <div style={{fontFamily:FONT_CHAT,fontSize:11.5,color:T.dim,marginTop:2}}>Live market intelligence — news, filings, insider activity</div>
        </div>
        <button onClick={onRefreshAll}
          style={{display:"flex",alignItems:"center",gap:6,padding:"7px 13px",borderRadius:8,background:`${accent}10`,border:`1px solid ${accent}28`,color:accent,fontFamily:FONT_MONO,fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer"}}>
          <span style={{animation:secLoading?"spin 0.7s linear infinite":"none"}}>↻</span> REFRESH ALL
        </button>
      </div>

      {/* V12: Movers + Calendars as FIXED panels above the grid/flex fork, so they
          always render regardless of the layout system (the draggable grid only
          engages when a layout is saved or in edit mode — otherwise the page uses
          the flex fallback, which is why a grid-only card never showed).
          Side-by-side on desktop; they wrap to stacked on narrow screens. */}
      <div style={{padding:"0 22px 12px",flexShrink:0,display:"flex",gap:14,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 320px",minWidth:0,height:250}}>{moversCard}</div>
        <div style={{flex:"1 1 320px",minWidth:0,height:250}}><CalendarPanel T={T} accent={accent} onPick={onPickTicker} fill/></div>
      </div>

      {useGrid?(
        <GridDock
          layout={gridLayout||DEFAULT_DATA_LAYOUT}
          onLayoutChange={(l)=>{if(editMode)onGridChange(l);}}
          editMode={editMode}
          accent={accent} T={T}
          collapsed={collapsed} onToggleCollapse={onToggleCollapse}
          items={{data_news:newsCard,data_filings:filingsCard,data_insiders:insidersCard,data_desk:deskCard}}
        />
      ):(
        <div style={{flex:1,overflowY:"auto",padding:"0 22px 20px",minHeight:0}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:14,marginBottom:18}}>
            <div style={{maxHeight:360,display:"flex"}}>{newsCard}</div>
            <div style={{maxHeight:360,display:"flex"}}>{filingsCard}</div>
            <div style={{maxHeight:360,display:"flex"}}>{insidersCard}</div>
          </div>
          <div style={{height:260,display:"flex"}}>{deskCard}</div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN ──────────────────────────────────────────────────────────────────────
export default function MarketTerminal(){
  const [accessState, setAccessState] = useState("loading");
  const [fontSize, setFontSize] = useState(() => {
    if (typeof window !== "undefined") {
      return Number(localStorage.getItem("kronos_font_size") || 14);
    }
    return 14;
  });

  const [user, setUser] = useState(null);

  useEffect(() => {
    // Multi-tenant mode: Supabase session is the source of truth.
    if (supabaseConfigured()) {
      getSupabase().auth.getSession()
        .then(({ data }) => {
          if (data?.session?.user) { setUser(data.session.user); setAccessState("granted"); }
          else setAccessState("locked");
        })
        .catch(() => setAccessState("locked"));
      return;
    }
    // Legacy single-user mode: session access code.
    const stored = sessionStorage.getItem("kronos_access");
    if (!stored) {
      setAccessState("locked");
      return;
    }

    fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: stored }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setAccessState("granted");
        else {
          sessionStorage.removeItem("kronos_access");
          setAccessState("locked");
        }
      })
      .catch(() => setAccessState("locked"));
  }, []);

  const[view,setView]=useState(()=>{
    // V13.6: the dev "test comet" / "preview chop banner" buttons (on /admin) set a
    // flag then send the user here — open straight into the bot so the comet has an
    // orb to launch on and the chop banner has a feed to render in.
    try{if(localStorage.getItem("kronos_dev_comet_test")==="1"||localStorage.getItem("kronos_dev_test_chop")==="1")return "bot";}catch{}
    return "terminal";
  });
  const[showWelcome,setShowWelcome]=useState(true);
  const[showTour,setShowTour]=useState(false);
  // V10: chart page state survives refresh (bug fix)
  const[overviewSymbol,setOverviewSymbol]=useState(null); // V12: per-ticker overview page
  const[chartSymbol,setChartSymbolRaw]=useState(()=>{try{return JSON.parse(localStorage.getItem("kronos_chart_state")||"{}").symbol||"AAPL";}catch{return "AAPL";}});
  const[chartInterval,setChartIntervalRaw]=useState(()=>{try{return migrateChartInterval(JSON.parse(localStorage.getItem("kronos_chart_state")||"{}").interval);}catch{return "1d";}});
  const setChartSymbol=useCallback((s)=>{setChartSymbolRaw(s);try{localStorage.setItem("kronos_chart_state",JSON.stringify({symbol:s,interval:chartInterval}));}catch{}},[chartInterval]);
  const setChartInterval=useCallback((iv)=>{setChartIntervalRaw(iv);try{localStorage.setItem("kronos_chart_state",JSON.stringify({symbol:chartSymbol,interval:iv}));}catch{}},[chartSymbol]);

  // V11 M1: phone layout. `false` until mounted (see lib/useIsMobile) so SSR and
  // first paint always agree.
  const isMobile=useIsMobile();
  const[mobilePanel,setMobilePanel]=useState("chat");
  const mobileTab=mobileTabFor(view,mobilePanel);

  // V10.6: AI-drawn chart annotations. Keyed by symbol so drawings for NVDA don't
  // bleed onto SPY. Stored flat (one array) because the render path filters by
  // symbol anyway and a flat list keeps the AI tool handlers trivial.
  const[chartAnnotations,setChartAnnotations]=useState([]);
  useEffect(()=>{setChartAnnotations(loadAnnotations());},[]);
  // V12: "Show Trade on Chart" (from a signal in the feed) draws entry/TP/SL into
  // the shared annotation store, then fires this event — reload the drawings, load
  // the ticker, and switch to the chart. Same chart + same annotations the AI and
  // the terminal use, so bot and terminal render the trade identically.
  useEffect(()=>{
    const onShow=(e)=>{const sym=e.detail?.symbol;setChartAnnotations(loadAnnotations());if(sym)setChartSymbol(sym);setView("chart");};
    window.addEventListener("kronos-show-chart",onShow);
    return()=>window.removeEventListener("kronos-show-chart",onShow);
  },[]);
  useEffect(()=>{saveAnnotations(chartAnnotations);},[chartAnnotations]);
  const clearChartAnnotations=useCallback((sym)=>{
    setChartAnnotations(prev=>prev.filter(a=>a.symbol!==(sym||chartSymbol)));
  },[chartSymbol]);
  const[mainBg,setMainBg]=useState(THEME_DEFAULTS.mainBg);
  const[mainText,setMainText]=useState(THEME_DEFAULTS.mainText);
  const[leftBg,setLeftBg]=useState(THEME_DEFAULTS.leftBg);
  const[leftText,setLeftText]=useState(THEME_DEFAULTS.leftText);
  const[rightBg,setRightBg]=useState(THEME_DEFAULTS.rightBg);
  const[rightText,setRightText]=useState(THEME_DEFAULTS.rightText);
  const[accentKey,setAccentKey]=useState(THEME_DEFAULTS.accent);
  const[density,setDensity]=useState(THEME_DEFAULTS.density);
  const[leftWidth,setLeftWidth]=useState(THEME_DEFAULTS.leftWidth);
  const[rightWidth,setRightWidth]=useState(THEME_DEFAULTS.rightWidth);
  const[chartRightWidth,setChartRightWidth]=useState(THEME_DEFAULTS.chartRightWidth);
  // V9 personalization + layouts (per-account when Supabase is configured)
  const[chatStyle,setChatStyle]=useState({mode:"solid",color:"",opacity:0.85});
  const[bgImage,setBgImage]=useState({dataUrl:"",dim:0.6,posX:50,posY:50});
  // Background video: metadata in settings (syncs), blob in IndexedDB (device-local).
  const[bgVideo,setBgVideo]=useState({enabled:false,name:""});
  const[bgVideoUrl,setBgVideoUrl]=useState("");
  // V10.4 personalization. `hue` (deg) + `sat`/`bri` recolor any theme via CSS filter.
  // Single source of truth for valid ids = THEME_LIST (ThemeBackdrop + lib/videoThemes).
  const VALID_THEMES=THEME_LIST.map(t=>t.id);
  // Default to a canvas theme: video themes only exist once their asset is installed,
  // so defaulting to one would give a fresh user a black backdrop.
  const[themeSel,setThemeSel]=useState({id:FALLBACK_THEME,hue:0,sat:1,bri:1,tint:"",tintStrength:0.5});
  // V10.5b: default is TRANSPARENT, not solid. With solid side panels the theme
  // backdrop was painted correctly but 100% covered by opaque panels, so picking
  // Aurora/Grid Pulse appeared to do nothing at all. 0.85 keeps text fully
  // readable while letting the backdrop actually register behind it. Users who
  // want the old look can still switch to Solid in Settings → Themes.
  const[sidePanels,setSidePanels]=useState({mode:"transparent",opacity:0.85});
  const[chatFont,setChatFont]=useState("inter");
  const[layouts,setLayouts]=useState({});          // {terminal:[{i,x,y,w,h},...]}
  const[collapsed,setCollapsed]=useState({});      // V10.2: {panelKey:true} collapsed panels
  const toggleCollapse=useCallback((key)=>setCollapsed(prev=>({...prev,[key]:!prev[key]})),[]);
  const[layoutEdit,setLayoutEdit]=useState(false);
  const[notes,setNotes]=useState([]);              // [{id,text}] free note panels
  const settingsLoadedRef=useRef(false);
  // V13: profile fields — name, interaction mode, dev flag, popup/chat-retention prefs.
  const[displayName,setDisplayName]=useState("");
  const[interactionMode,setInteractionMode]=useState("chatty"); // "chatty" | "command"
  const[isDev,setIsDev]=useState(false); // server-derived (OWNER_EMAILS); never sent on save
  const[hasSeenV13Popup,setHasSeenV13Popup]=useState(()=>{
    try{return localStorage.getItem("kronos_v13_popup_seen")==="1";}catch{return false;}
  });
  const[settingsReady,setSettingsReady]=useState(false); // gates the V13 popup so it never flashes before we know
  const[v13PopupContent,setV13PopupContent]=useState(null); // dev-editable copy from brain_config, via /api/settings
  const[v13PopupPreview,setV13PopupPreview]=useState(false); // dev-only manual preview, doesn't touch hasSeenV13Popup
  const[chatAutoDelete,setChatAutoDelete]=useState("never"); // daily|weekly|monthly|session|never
  const[chatHistoryClearedAt,setChatHistoryClearedAt]=useState(null);
  const[watchlist,setWatchlist]=useState(DEFAULT_WATCHLIST);
  const[watchlistMeta,setWatchlistMeta]=useState(buildDefaultMeta());
  const[showWL,setShowWL]=useState(false);
  const[showSettings,setShowSettings]=useState(false);
  const[showIndicatorInfo,setShowIndicatorInfo]=useState(false);
  const[showMentor,setShowMentor]=useState(false);
  const[quotes,setQuotes]=useState({});
  const[news,setNews]=useState([]);
  // Breaking / live-speech alerts — drives the pulsing dot on the Data nav tab and
  // the News panel header. Recomputed whenever news refreshes.
  const newsAlerts=useMemo(()=>breakingItems(news),[news]);
  const[newsRefreshing,setNewsRefreshing]=useState(false);
  const[newsLastUpd,setNewsLastUpd]=useState(null);
  const[secData,setSecData]=useState(null);
  const[secLoading,setSecLoading]=useState(false);
  const[messages,setMessages]=useState([{role:"assistant",content:"TRADING TERMINAL DESK ONLINE.\n\nYou have full access to a proprietary hedge fund intelligence system. This desk identifies edge, timing, and high-probability setups with precision.\n\nThis is not financial advice — this is your asymmetric edge.\n\nClick \"Chart\" to open the live TradingView chart. Click \"Data\" for the intelligence dashboard."}]);
  const[input,setInput]=useState("");
  const[loading,setLoading]=useState(false);
  const[lastUpd,setLastUpd]=useState(null);
  const[dataErr,setDataErr]=useState(null);
  const chatEndRef=useRef(null);
  const[desktopChatAtBottom,setDesktopChatAtBottom]=useState(true);
  const onDesktopChatScroll=useCallback((e)=>{
    const el=e.currentTarget;
    setDesktopChatAtBottom(el.scrollHeight-el.scrollTop-el.clientHeight<40);
  },[]);
  const resizeState=useRef({active:false,type:null,startX:0,startWidth:0});

  const T=useMemo(()=>deriveTheme(mainBg,mainText),[mainBg,mainText]);
  const TLbase=useMemo(()=>deriveTheme(leftBg,leftText),[leftBg,leftText]);
  const TRbase=useMemo(()=>deriveTheme(rightBg,rightText),[rightBg,rightText]);
  // V10 item 3: side panels can go transparent so the theme backdrop shows through.
  const TL=useMemo(()=>{
    if(sidePanels?.mode!=="transparent")return TLbase;
    const al=sidePanels.opacity??0.6;
    const a=(hex)=>{const c=hexToRgb(hex);return `rgba(${c.r},${c.g},${c.b},${al})`;};
    return {...TLbase,panel:a(TLbase.panel),surface:a(TLbase.surface)};
  },[TLbase,sidePanels]);
  const TR=useMemo(()=>{
    if(sidePanels?.mode!=="transparent")return TRbase;
    const al=sidePanels.opacity??0.6;
    const a=(hex)=>{const c=hexToRgb(hex);return `rgba(${c.r},${c.g},${c.b},${al})`;};
    return {...TRbase,panel:a(TRbase.panel),surface:a(TRbase.surface)};
  },[TRbase,sidePanels]);
  const accent=ACCENTS[accentKey]||ACCENTS.teal;

  // Global drag-resize handlers
  useEffect(()=>{
    const onMove=(e)=>{
      const rs=resizeState.current;if(!rs.active)return;
      const delta=e.clientX-rs.startX;
      if(rs.type==="left")setLeftWidth(Math.max(180,Math.min(500,rs.startWidth+delta)));
      else if(rs.type==="right")setRightWidth(Math.max(200,Math.min(560,rs.startWidth-delta)));
      else if(rs.type==="chartRight")setChartRightWidth(Math.max(200,Math.min(600,rs.startWidth-delta)));
    };
    const onUp=()=>{resizeState.current.active=false;document.body.style.cursor="";document.body.style.userSelect="";};
    window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
    return()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  },[]);

  const startResize=useCallback((type,currentWidth)=>(e)=>{
    e.preventDefault();
    resizeState.current={active:true,type,startX:e.clientX,startWidth:currentWidth};
    document.body.style.cursor="col-resize";document.body.style.userSelect="none";
  },[]);

  // Persist settings
  useEffect(()=>{
    try{
      const s=localStorage.getItem("mktintel_theme_v5");
      if(s){const p=JSON.parse(s);setMainBg(p.mainBg||DEFAULT_BG);setMainText(p.mainText||DEFAULT_TEXT);setLeftBg(p.leftBg||DEFAULT_BG);setLeftText(p.leftText||DEFAULT_TEXT);setRightBg(p.rightBg||DEFAULT_BG);setRightText(p.rightText||DEFAULT_TEXT);setAccentKey(p.accent||"teal");setDensity(p.density||"comfortable");setLeftWidth(p.leftWidth||290);setRightWidth(p.rightWidth||310);setChartRightWidth(p.chartRightWidth||340);}
      const w=localStorage.getItem("mktintel_w");if(w)setWatchlist(JSON.parse(w));
      const wm=localStorage.getItem("mktintel_wm");if(wm)setWatchlistMeta(JSON.parse(wm));
    }catch{}
  },[]);
  useEffect(()=>{try{localStorage.setItem("mktintel_theme_v5",JSON.stringify({mainBg,mainText,leftBg,leftText,rightBg,rightText,accent:accentKey,density,leftWidth,rightWidth,chartRightWidth}));}catch{}},[mainBg,mainText,leftBg,leftText,rightBg,rightText,accentKey,density,leftWidth,rightWidth,chartRightWidth]);
  useEffect(()=>{try{localStorage.setItem("mktintel_w",JSON.stringify(watchlist));}catch{}},[watchlist]);
  useEffect(()=>{try{localStorage.setItem("mktintel_wm",JSON.stringify(watchlistMeta));}catch{}},[watchlistMeta]);
  // V9/V10: local persistence for personalization/layouts (works with or without accounts)
  useEffect(()=>{try{const s=localStorage.getItem("kronos_personal");if(s){const p=JSON.parse(s);if(p.chatStyle)setChatStyle(p.chatStyle);if(p.bgImage)setBgImage(prev=>({...prev,...p.bgImage}));if(p.bgVideo)setBgVideo(prev=>({...prev,...p.bgVideo}));if(p.layouts)setLayouts(p.layouts);if(p.collapsed)setCollapsed(p.collapsed);if(p.notes)setNotes(p.notes);if(p.themeSel)setThemeSel(migrateTheme(p.themeSel));if(p.sidePanels)setSidePanels(p.sidePanels);if(p.chatFont)setChatFont(p.chatFont);if(p.interactionMode)setInteractionMode(p.interactionMode);if(p.displayName)setDisplayName(p.displayName);}}catch{}},[]);
  useEffect(()=>{try{localStorage.setItem("kronos_personal",JSON.stringify({chatStyle,bgImage,bgVideo,layouts,collapsed,notes,themeSel,sidePanels,chatFont,interactionMode,displayName}));}catch{}},[chatStyle,bgImage,bgVideo,layouts,collapsed,notes,themeSel,sidePanels,chatFont,interactionMode,displayName]);

  // Rehydrate the background video blob from IndexedDB into an object URL.
  // (The blob is device-local; only the {enabled,name} metadata is persisted.)
  useEffect(()=>{
    let url="";
    if(!bgVideo?.enabled){setBgVideoUrl("");return;}
    let cancelled=false;
    loadBgVideo().then(blob=>{
      if(cancelled||!blob){if(!blob)setBgVideo(prev=>({...prev,enabled:false}));return;}
      url=URL.createObjectURL(blob);
      setBgVideoUrl(url);
    });
    return()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
  },[bgVideo?.enabled,bgVideo?.name]);

  const handlePickVideo=useCallback(async(file)=>{
    await saveBgVideo(file);
    setBgVideo({enabled:true,name:file.name});
  },[]);
  const handleRemoveVideo=useCallback(async()=>{
    await clearBgVideo();
    setBgVideo({enabled:false,name:""});
    setBgVideoUrl("");
  },[]);

  // V13: chat history deletion — resets to the seed welcome message and stamps
  // when it happened (chatAutoDelete schedules compare elapsed time against this).
  const clearChatHistory=useCallback(()=>{
    setMessages([{role:"assistant",content:"TRADING TERMINAL DESK ONLINE.\n\nYou have full access to a proprietary hedge fund intelligence system. This desk identifies edge, timing, and high-probability setups with precision.\n\nThis is not financial advice — this is your asymmetric edge.\n\nClick \"Chart\" to open the live TradingView chart. Click \"Data\" for the intelligence dashboard."}]);
    setChatHistoryClearedAt(Date.now());
  },[]);

  // V13: auto-delete schedule — runs once on mount/login, compares elapsed time
  // since the last clear against the chosen cadence. "session" always clears (a
  // fresh page load IS the new session); "never" is a no-op.
  useEffect(()=>{
    if(!settingsReady)return;
    if(chatAutoDelete==="never")return;
    if(chatAutoDelete==="session"){clearChatHistory();return;}
    const THRESHOLDS={daily:24*60*60*1000,weekly:7*24*60*60*1000,monthly:30*24*60*60*1000};
    const ms=THRESHOLDS[chatAutoDelete];
    if(!ms)return;
    if(!chatHistoryClearedAt||Date.now()-chatHistoryClearedAt>ms)clearChatHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[settingsReady]);

  // ── V9 SERVER SETTINGS SYNC (per-account, only when signed in via Supabase) ──
  // NOTE: kronos_broker_creds is deliberately EXCLUDED — it holds a live broker API
  // token/account ID (see BrokerConnect.jsx). Syncing it would copy a plaintext
  // secret into the settings JSON server-side, compounding an existing local risk
  // rather than fixing it. Flagged separately; not a V10-scoped fix.
  const KRONOS_LS_KEYS=["kronos_botmode","kronos_flow_done","kronos_broker_url","kronos_broker_preset","kronos_broker","kronos_papermode","kronos_profile","kronos_propfirm","kronos_font_size","kronos_tape","kronos_studio_config","kronos_tour_seen","kronos_cadence","kronos_min_conviction","kronos_chart_state","kronos_terminal_chart_symbol","kronos_shadow","kronos_paper_futures","kronos_paper_options","kronos_bot_ui","kronos_bot_collapsed","kronos_chart_annotations"];
  // No-account mode (legacy code gate, OR the dev auth bypass which grants
  // access with a null user even when Supabase IS configured — see
  // AuthGate.jsx's DEV_AUTH_BYPASS): there's no server profile to ever wait
  // on, so the V13 popup gate is ready immediately once access is settled,
  // driven purely by the localStorage mirror.
  useEffect(()=>{if(accessState==="granted"&&!user)setSettingsReady(true);},[accessState,user]);
  useEffect(()=>{
    if(!user||!supabaseConfigured())return;
    (async()=>{
      try{
        const token=await getAccessToken();if(!token)return;
        const r=await fetch("/api/settings",{headers:{Authorization:`Bearer ${token}`}});
        if(!r.ok)return;
        const{settings:s,isDev:dev,v13Popup}=await r.json();
        setIsDev(Boolean(dev));
        if(v13Popup)setV13PopupContent(v13Popup);
        if(s&&typeof s==="object"){
          if(s.theme){const p=s.theme;setMainBg(p.mainBg||DEFAULT_BG);setMainText(p.mainText||DEFAULT_TEXT);setLeftBg(p.leftBg||DEFAULT_BG);setLeftText(p.leftText||DEFAULT_TEXT);setRightBg(p.rightBg||DEFAULT_BG);setRightText(p.rightText||DEFAULT_TEXT);setAccentKey(p.accent||"teal");setDensity(p.density||"comfortable");setLeftWidth(p.leftWidth||290);setRightWidth(p.rightWidth||310);setChartRightWidth(p.chartRightWidth||340);}
          if(s.fontSize)setFontSize(Number(s.fontSize)||14);
          if(s.watchlist?.length)setWatchlist(s.watchlist);
          if(s.watchlistMeta)setWatchlistMeta(s.watchlistMeta);
          if(s.chatStyle)setChatStyle(s.chatStyle);
          if(s.bgImage)setBgImage(prev=>({...prev,...s.bgImage}));
          if(s.layouts)setLayouts(s.layouts);
          if(s.notes)setNotes(s.notes);
          if(s.themeSel)setThemeSel(migrateTheme(s.themeSel));
          if(s.sidePanels)setSidePanels(s.sidePanels);
          if(s.chatFont)setChatFont(s.chatFont);
          if(s.collapsed)setCollapsed(s.collapsed);
          // V10: per-account AI chat history — your desk conversation follows you.
          if(Array.isArray(s.chatHistory)&&s.chatHistory.length)setMessages(s.chatHistory);
          if(s.kronosLocal)try{Object.entries(s.kronosLocal).forEach(([k,v])=>{if(KRONOS_LS_KEYS.includes(k)&&v!=null)localStorage.setItem(k,v);});}catch{}
          // V13 profile fields.
          if(s.displayName)setDisplayName(s.displayName);
          if(s.interactionMode)setInteractionMode(s.interactionMode);
          if(s.chatAutoDelete)setChatAutoDelete(s.chatAutoDelete);
          if(s.chatHistoryClearedAt)setChatHistoryClearedAt(s.chatHistoryClearedAt);
          // Server is authoritative once logged in (lets a dev's "reset popup" reach the
          // user on next load even if their local mirror still says "seen").
          if(typeof s.hasSeenV13Popup==="boolean"){
            setHasSeenV13Popup(s.hasSeenV13Popup);
            try{localStorage.setItem("kronos_v13_popup_seen",s.hasSeenV13Popup?"1":"0");}catch{}
          }
        }
      }catch{}
      finally{settingsLoadedRef.current=true;setSettingsReady(true);}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user]);

  // Debounced save of everything per-account (2s after last change).
  useEffect(()=>{
    if(!user||!supabaseConfigured()||!settingsLoadedRef.current)return;
    const t=setTimeout(async()=>{
      try{
        const token=await getAccessToken();if(!token)return;
        const kronosLocal={};
        KRONOS_LS_KEYS.forEach(k=>{try{const v=localStorage.getItem(k);if(v!=null)kronosLocal[k]=v;}catch{}});
        const base={
          theme:{mainBg,mainText,leftBg,leftText,rightBg,rightText,accent:accentKey,density,leftWidth,rightWidth,chartRightWidth},
          fontSize,watchlist,watchlistMeta,chatStyle,bgImage,layouts,collapsed,notes,themeSel,sidePanels,chatFont,kronosLocal,
          displayName,interactionMode,hasSeenV13Popup,chatAutoDelete,chatHistoryClearedAt,
        };
        const putSettings=(settings)=>fetch("/api/settings",{method:"PUT",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({settings})});
        let r=await putSettings({...base,chatHistory:messages.slice(-80)});
        if(r.status===413){
          // Payload still too big (huge chat history) — retry once without it
          // rather than silently losing the rest of the save (theme/layouts/etc).
          r=await putSettings(base);
        }
      }catch{}
    },2000);
    return()=>clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[user,mainBg,mainText,leftBg,leftText,rightBg,rightText,accentKey,density,leftWidth,rightWidth,chartRightWidth,fontSize,watchlist,watchlistMeta,chatStyle,bgImage,layouts,notes,themeSel,sidePanels,chatFont,messages,displayName,interactionMode,hasSeenV13Popup,chatAutoDelete,chatHistoryClearedAt]);
  useEffect(()=>{if(desktopChatAtBottom)chatEndRef.current?.scrollIntoView({behavior:"smooth"});},[messages,loading]);

  const fetchQuotes=useCallback(async()=>{
    if(!watchlist.length)return;
    const BATCH=8;const merged={};
    for(let i=0;i<watchlist.length;i+=BATCH){
      const batch=watchlist.slice(i,i+BATCH);
      try{const r=await fetch(`/api/yf-quotes?symbols=${batch.join(",")}`);if(r.ok){const d=await r.json();(d.data||[]).forEach(q=>{merged[q.symbol]=q;});setDataErr(null);}else{const e=await r.json();setDataErr(e.error||"Quote error");}}
      catch{setDataErr("Network error");}
      if(i+BATCH<watchlist.length)await new Promise(r=>setTimeout(r,1100));
    }
    setQuotes(prev=>({...prev,...merged}));setLastUpd(Date.now());
  },[watchlist]);

  const fetchNews=useCallback(async()=>{
    try{const r=await fetch(`/api/news?limit=25`);if(r.ok){const d=await r.json();setNews(d.data||[]);}setNewsLastUpd(Date.now());}catch{}
  },[]);

  const manualRefreshNews=useCallback(async()=>{setNewsRefreshing(true);await fetchNews();setNewsRefreshing(false);},[fetchNews]);

  useEffect(()=>{fetchQuotes();fetchNews();const t=setInterval(()=>{fetchQuotes();fetchNews();},60000);return()=>clearInterval(t);},[fetchQuotes,fetchNews]);

  const loadSecData=useCallback(async()=>{
    setSecLoading(true);
    let loaded={filings:[],insiderTrades:[]};
    try{
      const r=await fetch(`/api/sec-filings?symbols=${watchlist.slice(0,12).join(",")}`);
      const d=await r.json();
      loaded={filings:d.filings||[],insiderTrades:d.insiderTrades||[]};
      setSecData(loaded);
    }catch{setSecData(loaded);}
    finally{setSecLoading(false);}

    // V10.5: AI reasoning pass, in the BACKGROUND. The cards are already on screen
    // with their deterministic baseline rating; this refines them once the model has
    // actually interrogated each filing. It never blocks the render, and if it fails
    // the baseline simply stands.
    const items=[...loaded.filings,...loaded.insiderTrades];
    if(!items.length)return;
    try{
      const r=await fetch("/api/filing-intel",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({items}),
      });
      const {ratings}=await r.json();
      if(!ratings?.length)return;
      const byId=new Map(ratings.map(x=>[x.id,x]));
      const merge=(arr)=>arr.map(it=>byId.has(it.url)?{...it,impact:{...it.impact,...byId.get(it.url)}}:it);
      setSecData(prev=>prev?{filings:merge(prev.filings),insiderTrades:merge(prev.insiderTrades)}:prev);
    }catch{/* baseline rating stands */}
  },[watchlist]);

  useEffect(()=>{if(view==="data"&&!secData)loadSecData();},[view,secData,loadSecData]);

  const ctx=useCallback(()=>({
    watchlist:watchlist.map(s=>({symbol:s,name:watchlistMeta[s]||s,...(quotes[s]||{})})),
    news:news.slice(0,8).map(n=>({headline:n.headline,source:n.source,datetime:n.datetime})),
    fetchedAt:lastUpd,
  }),[watchlist,watchlistMeta,quotes,news,lastUpd]);

  // ── V12 AUTO-SETUP (chat rules 1 & 2) ──────────────────────────────────────
  // When the user names a ticker in chat, the desk checks the Signal Feed for a
  // live setup on it and, if one exists, plots it on the chart automatically and
  // hands back a re-show button. Deterministic (reads the real stored plan) — it
  // does NOT depend on the model deciding to call a tool.
  const KNOWN_SYMBOLS=useMemo(()=>new Set([...Object.keys(COMPANY_NAMES),...watchlist]),[watchlist]);
  const findActiveSetupInText=useCallback(async(text)=>{
    if(!text||!supabaseConfigured())return null;
    const raw=String(text).toUpperCase();
    const toks=new Set();
    (raw.match(/\$[A-Z]{1,5}\b/g)||[]).forEach(t=>toks.add(t.slice(1)));         // cashtags
    (raw.match(/\b[A-Z]{1,5}\b/g)||[]).forEach(t=>{if(KNOWN_SYMBOLS.has(t))toks.add(t);}); // known tickers
    if(!toks.size)return null;
    const sb=getSupabase();if(!sb)return null;
    for(const sym of toks){
      const COLS="id,symbol,direction,conviction,plan,created_at";
      // Prefer state-based (active/won) selection; fall back if migration 006 isn't run.
      let{data,error}=await sb.from("signals").select(`${COLS},state`).eq("symbol",sym).in("state",["active","won"]).order("created_at",{ascending:false}).limit(1);
      if(error?.code==="42703")({data}=await sb.from("signals").select(COLS).eq("symbol",sym).order("created_at",{ascending:false}).limit(1));
      const row=(data||[])[0];
      if(row&&row.plan&&row.plan.entry!=null&&row.direction!=="NEUTRAL")return row;
    }
    return null;
  },[KNOWN_SYMBOLS]);
  const setupTargets=(p)=>[p?.t1,p?.t2].filter(v=>v!=null);
  // Rule 1: draw the setup onto the shared chart AND jump to the chart view so the
  // user sees it immediately (Gio's call — auto-jump, not silent). Same makeLevel
  // machinery the signal feed and the AI's chart_plot_trade use, so it renders
  // identically. The re-show button (rule 2) re-triggers this after they navigate away.
  const plotSetupOnChart=useCallback((row)=>{
    const sym=String(row.symbol||"").toUpperCase();const p=row.plan||{};
    const built=[];
    const push=(price,kind,label)=>{const lv=makeLevel({symbol:sym,price,kind,label});if(lv)built.push(lv);};
    push(p.entry,"entry",`ENTRY ${row.direction}`);
    push(p.stop,"sl","STOP");
    if(p.t1!=null)push(p.t1,"tp",p.t2!=null?"TP1":"TARGET");
    if(p.t2!=null)push(p.t2,"tp","TP2");
    if(!built.length)return;
    setChartSymbol(sym);
    setChartAnnotations(prev=>[...prev.filter(a=>a.symbol!==sym),...built]);
    setView("chart");
  },[]);
  // Rule 2: the reply's re-show button — clicking re-plots + jumps to the chart via
  // the existing chart_plot_trade registry entry.
  const setupReshowButton=(row)=>({
    kind:"action",
    label:`▸ SHOW ${row.symbol} SETUP ON CHART`,
    action:{name:"chart_plot_trade",input:{symbol:row.symbol,entry:row.plan.entry,stop:row.plan.stop,targets:setupTargets(row.plan),note:`${row.direction} ${row.symbol}`,replace:true}},
  });

  // V10: the desk AI can operate the terminal — registry of client-executable actions.
  const aiActionsRef=useRef({});
  aiActionsRef.current={
    set_view:({view})=>{if(["terminal","data","chart","bot"].includes(view))setView(view);},
    set_bot_mode:({mode})=>{try{localStorage.setItem("kronos_botmode",mode==="options"?"options":"futures");}catch{};setView("bot");},
    set_theme:({themeId})=>setThemeSel(prev=>({...prev,id:themeId||"none"})),
    set_accent:({color})=>{if(ACCENTS[color])setAccentKey(color);},
    set_font:({font})=>{if(FONT_CHOICES.some(f=>f.id===font))setChatFont(font);},
    set_font_size:({size})=>{const s=Number(size);if([12,14,16,18].includes(s)){setFontSize(s);try{localStorage.setItem("kronos_font_size",String(s));}catch{}}},
    add_watchlist_symbol:({symbol})=>{const s=String(symbol||"").toUpperCase().trim();if(/^[A-Z.^-]{1,8}$/.test(s))addWL(s,COMPANY_NAMES[s]);},
    remove_watchlist_symbol:({symbol})=>rmWL(String(symbol||"").toUpperCase().trim()),
    set_chart_symbol:({symbol})=>{const s=String(symbol||"").toUpperCase().trim();if(s){setChartSymbol(s);setView("chart");}},
    open_settings:()=>setShowSettings(true),
    start_tour:()=>setShowTour(true),

    // ── V10.6 CHART DRAWING ──────────────────────────────────────────────────
    // Every handler builds annotations through lib/chartAnnotations' make*()
    // factories, which coerce and validate. A malformed tool call (the model
    // hands back "$452.30", or a price it hallucinated as a string) returns null
    // and is dropped — a bad draw must never break the chart.
    chart_plot_trade:({symbol,entry,stop,targets,note,replace})=>{
      const s=String(symbol||"").toUpperCase().trim();
      if(!s)return;
      const built=[];
      const e=makeLevel({symbol:s,price:entry,kind:"entry",label:note||"ENTRY"});
      if(e)built.push(e);
      const st=makeLevel({symbol:s,price:stop,kind:"sl",label:"STOP"});
      if(st)built.push(st);
      const tgts=Array.isArray(targets)?targets:(targets!=null?[targets]:[]);
      tgts.forEach((t,i)=>{
        const lv=makeLevel({symbol:s,price:t,kind:"tp",label:tgts.length>1?`TP${i+1}`:"TARGET"});
        if(lv)built.push(lv);
      });
      if(!built.length)return; // nothing valid — don't touch the chart or navigate
      setChartAnnotations(prev=>[
        ...(replace===false?prev:prev.filter(a=>a.symbol!==s)),
        ...built,
      ]);
      setChartSymbol(s);setView("chart");
    },
    chart_draw_trendline:({symbol,fromTime,fromPrice,toTime,toPrice,label,color})=>{
      const s=String(symbol||"").toUpperCase().trim();
      const tl=makeTrendline({
        symbol:s,
        from:{time:fromTime,price:fromPrice},
        to:{time:toTime,price:toPrice},
        label,color:AI_DRAW_COLORS[color]||AI_DRAW_COLORS.purple,
      });
      if(!tl)return;
      setChartAnnotations(prev=>[...prev,tl]);
      setChartSymbol(s);setView("chart");
    },
    chart_add_marker:({symbol,time,text,shape,position,color})=>{
      const s=String(symbol||"").toUpperCase().trim();
      const m=makeMarker({symbol:s,time,text,shape,position,color:AI_DRAW_COLORS[color]||AI_DRAW_COLORS.blue});
      if(!m)return;
      setChartAnnotations(prev=>[...prev,m]);
      setChartSymbol(s);setView("chart");
    },
    chart_add_level:({symbol,price,kind,label})=>{
      const s=String(symbol||"").toUpperCase().trim();
      const lv=makeLevel({symbol:s,price,kind:kind||"note",label});
      if(!lv)return;
      setChartAnnotations(prev=>[...prev,lv]);
      setChartSymbol(s);setView("chart");
    },
    chart_clear_annotations:({symbol})=>{
      const s=String(symbol||"").toUpperCase().trim();
      clearChartAnnotations(s||chartSymbol);
    },
  };

  const callAPI=useCallback(async(prompt,isAlert,curMsgs)=>{
    setLoading(true);
    // Rules 1&2: look up any active setup on a ticker named in this message (in
    // parallel with the model call). If found we auto-plot it and offer a button.
    const setupP=findActiveSetupInText(prompt).catch(()=>null);
    try{
      const history=(curMsgs||messages).map(m=>({role:m.role,content:m.content}));
      const r=await fetch("/api/scan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:history,prompt,marketContext:ctx(),interactionMode})});
      const d=await r.json();
      // Execute any terminal actions the AI requested, then show its reply.
      let actionNote="";
      if(Array.isArray(d.actions)&&d.actions.length){
        const done=[];
        for(const a of d.actions){
          try{const fn=aiActionsRef.current[a.name];if(fn){fn(a.input||{});done.push(a.name.replace(/_/g," "));}}catch{}
        }
        if(done.length)actionNote=`\n\n⚙ Executed: ${done.join(", ")}`;
      }
      // Assemble inline buttons: the auto-setup re-show (rules 1&2) first, then any
      // choice buttons the model offered via offer_choices (rule 3, e.g. short/long).
      const setup=await setupP;
      const buttons=[];
      if(setup){plotSetupOnChart(setup);buttons.push(setupReshowButton(setup));}
      if(Array.isArray(d.buttons))buttons.push(...d.buttons);
      setMessages(p=>[...p,{role:"assistant",content:(d.text||d.error||"Analysis complete.")+actionNote,isAlertDive:isAlert,...(buttons.length?{buttons}:{})}]);
    }catch{setMessages(p=>[...p,{role:"assistant",content:"⚠️ Connection error. Please retry."}]);}
    finally{setLoading(false);}
  },[messages,ctx,findActiveSetupInText,plotSetupOnChart]);

  const send=useCallback(async()=>{
    if(!input.trim()||loading)return;
    const msg=input.trim();setInput("");
    const nm=[...messages,{role:"user",content:msg}];
    setMessages(nm);await callAPI(msg,false,nm);
  },[input,loading,callAPI,messages]);

  const handleQuick=useCallback(async(prompt,label)=>{
    if(loading)return;
    const nm=[...messages,{role:"user",content:label}];
    setMessages(nm);await callAPI(prompt,false,nm);
  },[loading,callAPI,messages]);

  // V12: an inline button on an assistant message was clicked. kind "action" runs a
  // client tool (e.g. re-show a setup on the chart); kind "prompt" sends a follow-up
  // to the desk (e.g. the short/long explanation choice).
  const onButton=useCallback((b)=>{
    if(!b)return;
    if(b.kind==="action"){const fn=aiActionsRef.current[b.action?.name];if(fn){try{fn(b.action.input||{});}catch{}}}
    else if(b.kind==="prompt"&&b.prompt){handleQuick(b.prompt,b.userLabel||b.label);}
  },[handleQuick]);

  const handleWLClick=useCallback(async(q)=>{
    // V12: clicking a watchlist ticker opens its dedicated Overview page (chart +
    // technicals + signals + news flow + embedded AI). On the chart page it still
    // just loads the symbol there.
    if(view==="chart"){setChartSymbol(q.symbol);return;}
    setOverviewSymbol(q.symbol);setView("overview");return;
    const prompt=`DEEP DIVE — ${q.symbol} (${q.name||q.symbol})\nLive: $${q.price?.toFixed(2)}, ${q.changePercent?.toFixed(2)}% today, H$${q.high?.toFixed(2)} L$${q.low?.toFixed(2)}\n\n▸ CATALYST\n▸ LEVELS — exact support and resistance\n▸ OPTIONS LANDSCAPE — IV rank\n▸ DIRECTION — CALL or PUT\n▸ PLAY — exact strike and expiry\n▸ ENTRY / TARGET / STOP\n▸ TIMEFRAME\n▸ SYMPATHY PLAYS\n▸ RISK\n▸ VERDICT — grade A/B/C`;
    const nm=[...messages,{role:"user",content:`🔍 Deep dive: ${q.symbol} — $${q.price?.toFixed(2)} (${q.changePercent?.toFixed(2)}%)`}];
    setMessages(nm);await callAPI(prompt,true,nm);
  },[loading,callAPI,messages,view]);

  const handleNews=useCallback(async(item)=>{
    if(loading)return;
    const isTrumpSearch=item.isTrumpSearch;
    const prompt=isTrumpSearch
      ?`Search Trump's latest Truth Social posts and statements RIGHT NOW — last 24 hours. Which sectors and tickers impacted? For each: exact tickers, direction, options play with exact strike/expiry, IV rank, entry/target/stop.`
      :`Analyze this news:\n"${item.headline}"\nSource: ${item.source}\n\nDirectly affected tickers? Sympathy plays? Priced in or still edge? Exact options plays with strike/expiry, IV rank, entry/target/stop.`;
    const label=isTrumpSearch?"Ⓣ AI: Search Trump Truth Social now":`📰 ${item.headline?.slice(0,65)}...`;
    const nm=[...messages,{role:"user",content:label}];
    setMessages(nm);await callAPI(prompt,true,nm);
  },[loading,callAPI,messages]);

  const handleFiling=useCallback(async(f)=>{
    if(loading)return;
    const prompt=`SEC filing: ${f.symbol} filed a ${f.form} (${f.formName||""}) on ${f.date}. What does this typically signal? Bullish, bearish, or neutral read right now?`;
    const nm=[...messages,{role:"user",content:`📋 ${f.symbol} filed ${f.form} on ${f.date}`}];
    setMessages(nm);await callAPI(prompt,true,nm);
  },[loading,callAPI,messages]);

  const handleInsider=useCallback(async(t)=>{
    if(loading)return;
    const prompt=`Insider Form 4 for ${t.symbol} on ${t.date}. What's the typical read? Bullish or bearish signal?`;
    const nm=[...messages,{role:"user",content:`👤 ${t.symbol} insider Form 4 — ${t.date}`}];
    setMessages(nm);await callAPI(prompt,true,nm);
  },[loading,callAPI,messages]);

  const addWL=(symbol,name)=>{setWatchlist(p=>p.includes(symbol)?p:[...p,symbol]);setWatchlistMeta(p=>({...p,[symbol]:name||COMPANY_NAMES[symbol]||symbol}));};
  const rmWL=(symbol)=>setWatchlist(p=>p.filter(x=>x!==symbol));
  const resetWL=()=>{setWatchlist(DEFAULT_WATCHLIST);setWatchlistMeta(buildDefaultMeta());};
  const resetAll=()=>{setMainBg(THEME_DEFAULTS.mainBg);setMainText(THEME_DEFAULTS.mainText);setLeftBg(THEME_DEFAULTS.leftBg);setLeftText(THEME_DEFAULTS.leftText);setRightBg(THEME_DEFAULTS.rightBg);setRightText(THEME_DEFAULTS.rightText);setAccentKey(THEME_DEFAULTS.accent);setDensity(THEME_DEFAULTS.density);setLeftWidth(THEME_DEFAULTS.leftWidth);setRightWidth(THEME_DEFAULTS.rightWidth);setChartRightWidth(THEME_DEFAULTS.chartRightWidth);};
  const handleKey=(e)=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}};

  // ── V9: shared panel elements (used by both classic flex + drag-drop grid) ──
  const chatBgStyle = chatStyle?.mode==="transparent"
    ? {background:"transparent"}
    : (()=>{const c=hexToRgb(chatStyle?.color||T.bg);return{background:`rgba(${c.r},${c.g},${c.b},${chatStyle?.opacity??0.85})`};})();

  const watchlistInner=(
    <div style={{height:"100%",display:"flex",flexDirection:"column",background:TL.panel,minHeight:0}}>
      <div style={{padding:"11px 12px 9px",borderBottom:`1px solid ${TL.border}`,flexShrink:0}}>
        {/* V12 fix: the panel's collapse button is absolutely positioned at top:8
            right:8 (see the term_watchlist wrapper), which sat ON TOP of this
            clock readout. Reserve ~26px on the right so the clock clears it. */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8,paddingRight:24}}>
          <div style={{display:"flex",alignItems:"center",gap:7}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:dataErr?"#ff4d6d":accent,boxShadow:dataErr?"none":`0 0 8px ${accent}`}}/>
            <span style={{fontFamily:FONT_SANS,fontSize:14,fontWeight:700,color:TL.text,letterSpacing:0.2}}>Watchlist</span>
          </div>
          <span style={{fontFamily:FONT_MONO,fontSize:8,color:TL.dim}}>{lastUpd?new Date(lastUpd).toLocaleTimeString():"—"}</span>
        </div>
        {dataErr&&<div style={{fontFamily:FONT_MONO,fontSize:9,color:"#ff4d6d",background:"rgba(255,77,109,0.07)",border:"1px solid rgba(255,77,109,0.18)",borderRadius:5,padding:"4px 8px",marginBottom:7}}>⚠ {dataErr}</div>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontFamily:FONT_MONO,fontSize:8,color:TL.dim,letterSpacing:2,fontWeight:700}}>{watchlist.length} TICKERS</span>
          <div style={{display:"flex",gap:5}}>
            {/* V10: beginner indicator guide */}
            <button onClick={()=>setShowIndicatorInfo(true)} title="What do these numbers mean?" style={{fontFamily:FONT_MONO,fontSize:9,color:TL.dim,background:"transparent",border:`1px solid ${TL.border}`,borderRadius:5,padding:"3px 8px",fontWeight:700,cursor:"pointer"}}>ⓘ</button>
            <button onClick={()=>setShowWL(true)} style={{fontFamily:FONT_MONO,fontSize:9,color:accent,background:`${accent}0e`,border:`1px solid ${accent}22`,borderRadius:5,padding:"3px 9px",fontWeight:700,cursor:"pointer"}}>★ EDIT</button>
          </div>
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"7px 9px",minHeight:0}}>
        {watchlist.map(s=><WatchlistRow key={s} symbol={s} quote={quotes[s]} name={watchlistMeta[s]} onClick={handleWLClick} T={TL} density={density}/>)}
      </div>
      <div style={{padding:"5px 12px",borderTop:`1px solid ${TL.border}`,display:"flex",justifyContent:"space-between",flexShrink:0}}>
        <span style={{fontFamily:FONT_MONO,fontSize:8,color:TL.dim,letterSpacing:1}}>AUTO 60S</span>
        <span style={{fontFamily:FONT_MONO,fontSize:8,color:TL.dim,animation:"scanLine 3s infinite"}}>● LIVE</span>
      </div>
    </div>
  );

  const consoleInner=(
    // V10 item 5: the console column scrolls — chat on top, big chart below the fold.
    <div style={{height:"100%",display:"flex",flexDirection:"column",overflowY:"auto",overflowX:"hidden",minWidth:0,minHeight:0}}>
      <TickerTape accent={accent} T={T} speed={55}/>
      <div style={{position:"relative",flexShrink:0}}>
        <div onScroll={onDesktopChatScroll} style={{minHeight:"44vh",maxHeight:"60vh",overflowY:"auto",padding:"14px 18px",...chatBgStyle}}>
          {messages.map((msg,i)=><ChatMessage key={i} msg={msg} accent={accent} T={T} fontSize={fontSize} onButton={onButton}/>)}
          {loading&&<TypingIndicator accent={accent}/>}
          <div ref={chatEndRef}/>
        </div>
        {!desktopChatAtBottom&&(
          <button onClick={()=>{chatEndRef.current?.scrollIntoView({behavior:"smooth"});setDesktopChatAtBottom(true);}}
            title="Scroll to bottom"
            style={{position:"absolute",bottom:10,right:16,width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:accent,background:T.panel,border:`1px solid ${accent}40`,boxShadow:"0 4px 14px rgba(0,0,0,0.35)",cursor:"pointer",zIndex:3}}>↓</button>
        )}
      </div>
      <QuickActions onAction={handleQuick} accent={accent} T={T}/>
      <div style={{padding:"7px 18px 13px",borderTop:`1px solid ${T.border}`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"flex-end",gap:8,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"8px 12px"}}
          onFocusCapture={e=>e.currentTarget.style.borderColor=`${accent}32`}
          onBlurCapture={e=>e.currentTarget.style.borderColor=T.border}>
          <span style={{fontFamily:FONT_MONO,fontSize:12,color:accent,paddingBottom:1,animation:"blink 1.2s infinite"}}>▸</span>
          <textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={handleKey}
            placeholder="Ask the desk anything..." rows={1}
            style={{flex:1,background:"transparent",border:"none",color:T.text,fontFamily:FONT_CHAT,fontSize:14,lineHeight:1.5,maxHeight:100,overflowY:"auto"}}
            onInput={e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,100)+"px";}}/>
          <button onClick={send} disabled={!input.trim()||loading}
            style={{width:28,height:28,borderRadius:6,flexShrink:0,background:input.trim()&&!loading?`${accent}12`:"transparent",border:`1px solid ${input.trim()&&!loading?`${accent}28`:T.border}`,color:input.trim()&&!loading?accent:T.dim,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13}}>▸</button>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:3,padding:"0 2px"}}>
          <span style={{fontFamily:FONT_MONO,fontSize:7.5,color:T.dim,letterSpacing:1}}>SHIFT+ENTER FOR NEW LINE</span>
          <span style={{fontFamily:FONT_MONO,fontSize:7.5,color:T.dim,letterSpacing:1}}>NOT FINANCIAL ADVICE</span>
        </div>
      </div>
      <TerminalChart accent={accent} T={T} defaultSymbol={watchlist[0]||"SPY"}/>
    </div>
  );

  const newsInner=(
    <NewsPanel news={news} onDiveDeep={handleNews} onRefresh={manualRefreshNews} refreshing={newsRefreshing} lastUpd={newsLastUpd} accent={accent} T={TR} density={density}/>
  );

  const noteItems={};
  notes.forEach(n=>{
    noteItems[`note-${n.id}`]=(
      <div style={{height:"100%",display:"flex",flexDirection:"column",background:T.surface}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",borderBottom:`1px solid ${T.border}`,flexShrink:0}}>
          <span style={{fontFamily:FONT_MONO,fontSize:8,color:"#f7c948",letterSpacing:2,fontWeight:700}}>📝 NOTE</span>
          <button onClick={()=>setNotes(prev=>prev.filter(x=>x.id!==n.id))} style={{color:T.dim,fontSize:12,cursor:"pointer"}}>✕</button>
        </div>
        <textarea value={n.text} onChange={e=>setNotes(prev=>prev.map(x=>x.id===n.id?{...x,text:e.target.value}:x))}
          placeholder="Trade notes, levels, reminders..."
          style={{flex:1,background:"transparent",border:"none",color:T.text,fontFamily:FONT_CHAT,fontSize:12,lineHeight:1.6,padding:"10px 12px",resize:"none",minHeight:0}}/>
      </div>
    );
  });

  const terminalGrid=layoutEdit||Boolean(layouts?.terminal);

  return(
    <>
      {accessState === "loading" && (
        <div style={{minHeight:"100vh",background:"#060910"}} />
      )}

      {accessState === "locked" && (
        <AuthGate onAccess={(u) => { setUser(u || null); setAccessState("granted"); }} />
      )}

      <DevBypassBadge />

      {accessState === "granted" && (
        <>
          <FOMCOverlay />
          <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Source+Serif+4:wght@400;500;600;700&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;0,9..144,800;1,9..144,700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap');

            /* ── RESET & BASE ── */
            *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}

            /* ── CRYSTAL CLEAR TEXT RENDERING ── */
            html{
              -webkit-font-smoothing:antialiased;
              -moz-osx-font-smoothing:grayscale;
              text-rendering:geometricPrecision;
              font-feature-settings:"kern" 1,"liga" 1,"calt" 1;
              -webkit-text-size-adjust:100%;
              font-size:${fontSize||14}px;
            }

            /* ── SHARP SCROLLBARS ── */
            ::-webkit-scrollbar{width:2px;height:2px;}
            ::-webkit-scrollbar-track{background:transparent;}
            ::-webkit-scrollbar-thumb{background:#2A3D5288;border-radius:2px;}
            ::-webkit-scrollbar-thumb:hover{background:#9DB4CC66;}

            /* ── MONO FONT OPTIMIZATION ── */
            .mono,span[style*="JetBrains"]{
              font-variant-numeric:tabular-nums;
              font-feature-settings:"tnum" 1,"calt" 0;
              letter-spacing:0.02em;
            }

            /* ── ANIMATIONS ── */
            @keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.85);}50%{opacity:1;transform:scale(1.1);}}
            @keyframes blink{0%,100%{opacity:1;}50%{opacity:0;}}
            @keyframes spin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}
            /* V10.5: breaking-news / live-speech alert pulse */
            @keyframes news-pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}
            @keyframes tab-alert{0%,100%{box-shadow:0 0 0 0 rgba(255,61,87,0.5);}50%{box-shadow:0 0 0 5px rgba(255,61,87,0);}}
            @keyframes scanLine{0%,100%{opacity:0.3;}50%{opacity:1;}}
            @keyframes shimmer{0%{opacity:0.4;}50%{opacity:0.9;}100%{opacity:0.4;}}
            @keyframes slideIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}

            /* ── INTERACTIVE STATES ── */
            button{cursor:pointer;border:none;background:none;-webkit-tap-highlight-color:transparent;}
            textarea:focus,input:focus{outline:none;}
            textarea{resize:none;}

            /* ── V11 M1: MOBILE SHELL ──
               100dvh is the whole point: on iOS, 100vh is the viewport WITHOUT the
               URL bar, so a 100vh shell is taller than the visible area and the
               bottom tab bar sits permanently off-screen. dvh tracks the real
               visible height as the bar shows/hides. The 100vh line is the
               fallback for browsers that don't know dvh — order matters. */
            .kronos-shell{height:100vh;height:100dvh;}
            /* Settings drawer: fixed rail on desktop, full sheet on a phone. */
            .kronos-settings-sheet{width:310px;height:100vh;height:100dvh;}
            @media (max-width:767px){
              .kronos-settings-sheet{width:100vw;max-width:100vw;padding-bottom:calc(22px + env(safe-area-inset-bottom, 0px));}
            }
            /* Nothing may scroll the page sideways on a phone. Panels scroll
               internally; the shell itself never does. */
            html,body{overscroll-behavior-y:none;}
            @media (max-width:767px){
              body{overflow-x:hidden;}
              /* iOS zooms the whole page when you focus an input under 16px.
                 Chat/ticker inputs are 13px by design, so pin them at 16 on
                 phones — the zoom is far more disruptive than the size change. */
              input,textarea,select{font-size:16px !important;}
            }

            /* ── GPU ACCELERATION FOR ANIMATED ELEMENTS ── */
            [data-animated]{will-change:transform;transform:translateZ(0);backface-visibility:hidden;}

            /* ── REDUCED MOTION ── */
            @media(prefers-reduced-motion:reduce){
              *{animation-duration:0.01ms!important;animation-iteration-count:1!important;transition-duration:0.01ms!important;}
            }

            /* ── V13: COMMAND PALETTE MODE — flat, institutional, zero glow ──
               Chatty mode is untouched (the existing soft-glow look). Command
               mode kills box/text-shadow globally and desaturates (not to full
               grayscale — long/short color coding still has to read at a glance)
               rather than re-deriving every component's inline style by hand. */
            [data-mode="command"] *{box-shadow:none!important;text-shadow:none!important;}
            [data-mode="command"] [data-animated]{animation:none!important;}
            [data-mode="command"]{filter:saturate(0.55);}
          `}</style>
          <div className="kronos-shell" data-mode={interactionMode} style={{
            display:"flex",flexDirection:"column",
            backgroundColor:T.bg,
            fontFamily:FONT_CHOICES.find(f=>f.id===chatFont)?.stack||FONT_CHAT,
            overflow:"hidden",position:"relative",
            backgroundImage: (bgImage?.dataUrl&&!bgVideoUrl)
              ? `linear-gradient(rgba(0,0,0,${bgImage.dim??0.6}),rgba(0,0,0,${bgImage.dim??0.6})),url(${bgImage.dataUrl})`
              : (bgVideoUrl||(themeSel?.id&&themeSel.id!=="none"))?"none":`radial-gradient(circle, ${T.border}55 1px, transparent 1px)`,
            backgroundSize: bgImage?.dataUrl ? "cover" : "22px 22px",
            backgroundPosition: bgImage?.dataUrl ? `${bgImage.posX??50}% ${bgImage.posY??50}%` : "0 0",
            backgroundAttachment: bgImage?.dataUrl ? "fixed" : undefined,
          }}>
            {/* V10.3: looping background video — highest priority backdrop.
                muted+playsInline are REQUIRED for browsers to autoplay at all. */}
            {bgVideoUrl&&(
              <div style={{position:"absolute",inset:0,overflow:"hidden",pointerEvents:"none",zIndex:0}} aria-hidden="true">
                <video src={bgVideoUrl} autoPlay loop muted playsInline
                  style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}/>
                <div style={{position:"absolute",inset:0,background:`rgba(0,0,0,${bgImage?.dim??0.6})`}}/>
              </div>
            )}
            {/* Animated theme backdrop (a photo or video takes precedence when set) */}
            {/* V13: Command Palette mode drops the decorative animated backdrop
                entirely — that's the single biggest "vibe-coded" tell, and a
                flat institutional look has no backdrop at all. */}
            {!bgImage?.dataUrl&&!bgVideoUrl&&interactionMode!=="command"&&<ThemeBackdrop theme={themeSel?.id||"none"} accent={accent} filter={`hue-rotate(${themeSel?.hue||0}deg) saturate(${themeSel?.sat??1}) brightness(${themeSel?.bri??1})`} tint={themeSel?.tint||""} tintStrength={themeSel?.tintStrength??0.5}/>}
            {showWelcome&&<WelcomePopup
              onClose={()=>{setShowWelcome(false);try{if(localStorage.getItem("kronos_tour_seen")!=="1")setShowTour(true);}catch{}}}
              onTour={()=>{setShowWelcome(false);setShowTour(true);}}
              accent={accent} T={T}/>}
            {showTour&&<TourGuide accent={accent} T={T} onClose={()=>setShowTour(false)} onSwitchView={(v)=>setView(v)}/>}
            {/* V13: one-time "what's new" popup — waits for settings to load (no
                flash) and for the welcome/tour modals to clear (no stacking). */}
            {settingsReady&&!showWelcome&&!showTour&&!hasSeenV13Popup&&(
              <V13Popup content={v13PopupContent} accent={accent} T={T} onClose={()=>{setHasSeenV13Popup(true);try{localStorage.setItem("kronos_v13_popup_seen","1");}catch{}}}/>
            )}
            {v13PopupPreview&&<V13Popup content={v13PopupContent} accent={accent} T={T} onClose={()=>setV13PopupPreview(false)}/>}
        {showWL&&<WatchlistModal onClose={()=>setShowWL(false)} watchlist={watchlist} onAdd={addWL} onRemove={rmWL} onReset={resetWL} accent={accent} T={TL}/>}
        {showIndicatorInfo&&<IndicatorInfoModal onClose={()=>setShowIndicatorInfo(false)} accent={accent} T={T}/>}
        {showMentor&&<KronosMentor onClose={()=>setShowMentor(false)} accent={accent} T={T}/>}
        {/* V10.5: the gear is SCOPE-AWARE. On the bot page it opens the bot's own
            appearance settings — showing watchlist widths and terminal themes there
            was noise, since none of it is visible from the bot. */}
        {showSettings&&view==="bot"&&<BotSettings onClose={()=>setShowSettings(false)} T={T} accent={accent}/>}
        {showSettings&&view!=="bot"&&<SettingsPanel onClose={()=>setShowSettings(false)} mainBg={mainBg} setMainBg={setMainBg} mainText={mainText} setMainText={setMainText} leftBg={leftBg} setLeftBg={setLeftBg} leftText={leftText} setLeftText={setLeftText} rightBg={rightBg} setRightBg={setRightBg} rightText={rightText} setRightText={setRightText} accentKey={accentKey} setAccentKey={setAccentKey} density={density} setDensity={setDensity} leftWidth={leftWidth} setLeftWidth={setLeftWidth} rightWidth={rightWidth} setRightWidth={setRightWidth} chartRightWidth={chartRightWidth} setChartRightWidth={setChartRightWidth} onResetAll={resetAll} T={T} accent={accent} fontSize={fontSize} setFontSize={setFontSize} chatStyle={chatStyle} setChatStyle={setChatStyle} bgImage={bgImage} setBgImage={setBgImage} bgVideo={bgVideo} onPickVideo={handlePickVideo} onRemoveVideo={handleRemoveVideo} themeSel={themeSel} setThemeSel={setThemeSel} sidePanels={sidePanels} setSidePanels={setSidePanels} chatFont={chatFont} setChatFont={setChatFont} onStartTour={()=>setShowTour(true)} user={user} onSignOut={async()=>{try{await getSupabase()?.auth.signOut();}catch{}window.location.reload();}} displayName={displayName} setDisplayName={setDisplayName} chatAutoDelete={chatAutoDelete} setChatAutoDelete={setChatAutoDelete} onClearChatHistory={clearChatHistory} isDev={isDev} onPreviewV13Popup={()=>{setShowSettings(false);setV13PopupPreview(true);}}/>}

        {/* HEADER — on mobile this condenses to wordmark + market badge + gear.
            The page-name row and the ⇄ bot flip are redundant on a phone: the
            bottom tab bar already does that navigation, and at 375px the text
            tabs would wrap and eat a third of the viewport. */}
        <div style={{padding:isMobile?"8px 12px":"10px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:T.panel,flexShrink:0,position:"relative",zIndex:2,paddingTop:isMobile?"max(8px, env(safe-area-inset-top, 0px))":undefined}}>
          <div style={{display:"flex",alignItems:"baseline",gap:isMobile?9:18,minWidth:0}}>
            {isMobile?(
              <>
                <span style={{fontFamily:FONT_DISPLAY,fontSize:15,fontWeight:800,letterSpacing:0.4,color:T.text,whiteSpace:"nowrap"}}>KRONOS</span>
                <span style={{fontFamily:FONT_MONO,fontSize:7,color:accent,background:`${accent}10`,border:`1px solid ${accent}22`,padding:"2px 5px",borderRadius:4,letterSpacing:1.5,fontWeight:700}}>LIVE</span>
              </>
            ):(<>
            {/* BOT FLIP BUTTON */}
<button onClick={()=>setView(v=>v==="bot"?"terminal":"bot")} title="Toggle Bot Dashboard" style={{
  width:34,height:34,borderRadius:8,display:"flex",alignItems:"center",
  justifyContent:"center",fontSize:18,
  color:view==="bot"?accent:T.dim,
  background:view==="bot"?`${accent}12`:T.surface,
  border:`1px solid ${view==="bot"?`${accent}30`:T.border}`,
  cursor:"pointer",transition:"all 0.15s",marginRight:4,flexShrink:0,
}}>⇄</button>

{["terminal","data","chart","overview"].map(v=>(
              <button key={v} onClick={()=>{
                // V12: Overview is now an explicit nav tab. Clicking it with no
                // ticker chosen defaults to the current chart symbol so the tab is
                // never blank; a watchlist click still deep-links a specific ticker.
                if(v==="overview"&&!overviewSymbol)setOverviewSymbol(chartSymbol||"AAPL");
                setView(v);
              }} style={{cursor:"pointer",position:"relative"}}>
                <span style={{fontFamily:FONT_DISPLAY,fontSize:Math.round(18*((fontSize||14)/14)),fontWeight:700,letterSpacing:0.3,color:view===v?T.text:T.dim,transition:"color 0.15s",textTransform:"capitalize"}}>
                  {v==="terminal"?"Trading Terminal":v.charAt(0).toUpperCase()+v.slice(1)}
                </span>
                {/* Breaking/live alert dot — visible from ANY page, so a live Fed
                    speech reaches you even while you're on the chart. */}
                {v==="data"&&newsAlerts.length>0&&(
                  <span title={`${newsAlerts.length} breaking/live item${newsAlerts.length>1?"s":""}`}
                    style={{
                      position:"absolute",top:-2,right:-9,width:7,height:7,borderRadius:"50%",
                      background:newsAlerts.some(a=>a.impact?.live)?"#ff3d57":"#f7c948",
                      animation:"news-pulse 1.1s ease-in-out infinite",
                    }}/>
                )}
              </button>
            ))}
            <span style={{fontFamily:FONT_MONO,fontSize:8,color:accent,background:`${accent}10`,border:`1px solid ${accent}22`,padding:"2px 6px",borderRadius:4,letterSpacing:2,fontWeight:700}}>LIVE</span>
            </>)}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:isMobile?7:10,flexShrink:0}}>
            {/* V10: drag-and-drop layout controls (terminal + data views).
                Hidden on mobile: dragging a dense grid with a thumb is misery,
                and the phone layout is a fixed order by design (M1 scope). */}
            {!isMobile&&(view==="terminal"||view==="data")&&(
              layoutEdit?(
                <div style={{display:"flex",gap:6}}>
                  {view==="terminal"&&<button onClick={()=>setNotes(prev=>[...prev,{id:Date.now(),text:""}])}
                    style={{padding:"5px 10px",borderRadius:7,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,color:"#f7c948",background:"rgba(247,201,72,0.08)",border:"1px solid rgba(247,201,72,0.3)",cursor:"pointer"}}>+ NOTE</button>}
                  <button onClick={()=>{const k=view==="data"?"data":"terminal";setLayouts(prev=>{const p={...prev};delete p[k];return p;});setLayoutEdit(false);}}
                    style={{padding:"5px 10px",borderRadius:7,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,color:"#ff4d6d",background:"rgba(255,77,109,0.08)",border:"1px solid rgba(255,77,109,0.3)",cursor:"pointer"}}>RESET</button>
                  <button onClick={()=>{const k=view==="data"?"data":"terminal";const def=k==="data"?DEFAULT_DATA_LAYOUT:DEFAULT_TERMINAL_LAYOUT;if(!layouts?.[k])setLayouts(prev=>({...prev,[k]:def}));setLayoutEdit(false);}}
                    style={{padding:"5px 10px",borderRadius:7,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,color:accent,background:`${accent}12`,border:`1px solid ${accent}40`,cursor:"pointer"}}>🔒 SAVE LAYOUT</button>
                </div>
              ):(
                <button onClick={()=>setLayoutEdit(true)} title="Customize layout — drag & resize panels"
                  style={{padding:"5px 10px",borderRadius:7,fontFamily:FONT_MONO,fontSize:9,fontWeight:700,letterSpacing:1,color:T.dim,background:T.surface,border:`1px solid ${T.border}`,cursor:"pointer"}}>🔓 LAYOUT</button>
              )
            )}
            {/* V13: interaction-mode switcher — Chatty AI (conversational) vs
                Command Palette (terse/strict). Pure client state, no reload. */}
            <button onClick={()=>setInteractionMode(m=>m==="command"?"chatty":"command")}
              title={interactionMode==="command"?"Command Palette — click for Chatty AI":"Chatty AI — click for Command Palette"}
              style={{width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                color:interactionMode==="command"?T.text:accent,
                background:interactionMode==="command"?T.surface:`${accent}0e`,
                border:`1px solid ${interactionMode==="command"?T.border:`${accent}30`}`,cursor:"pointer"}}>
              {interactionMode==="command"?"⌘":"💬"}
            </button>
            <MarketStatusBadge accent={accent} T={T}/>
            {/* V10.2: Kronos Mentor (coming soon) */}
            <button onClick={()=>setShowMentor(true)} title="Kronos Mentor" style={{width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:accent,background:`${accent}0e`,border:`1px solid ${accent}30`,cursor:"pointer"}}>🤖</button>
            <button onClick={()=>setShowSettings(true)} style={{width:32,height:32,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,color:T.dim,background:T.surface,border:`1px solid ${T.border}`,cursor:"pointer"}}>⚙</button>
          </div>
        </div>

        {/* ── MOBILE BODY (M1) — one panel at a time, reusing the SAME panel
            elements the desktop layout uses. The V9 refactor that extracted
            watchlistInner/consoleInner/newsInner is why this needs no panel
            rewrite: the phone renders the identical element, full-screen. ── */}
        {isMobile&&(
          <div style={{display:"flex",flex:1,overflow:"hidden",position:"relative",zIndex:1,minHeight:0}}>
            {mobileTab==="chat"&&(
              <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>{consoleInner}</div>
            )}
            {mobileTab==="watchlist"&&(
              <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden",background:TL.panel}}>{watchlistInner}</div>
            )}
            {mobileTab==="news"&&(
              <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden",background:TR.panel}}>{newsInner}</div>
            )}
            {mobileTab==="chart"&&(
              <ChartPage isMobile symbol={chartSymbol} onSymbolChange={setChartSymbol} interval={chartInterval} onIntervalChange={setChartInterval}
                annotations={chartAnnotations} onClearAnnotations={()=>clearChartAnnotations(chartSymbol)}
                messages={messages} input={input} setInput={setInput} send={send} loading={loading} onButton={onButton}
                accent={accent} T={T} TR={TR} chartRightWidth={chartRightWidth} onStartResizeRight={()=>{}} fontSize={fontSize}/>
            )}
            {mobileTab==="data"&&(
              <DataPage isMobile news={news} secData={secData} secLoading={secLoading} onRefreshAll={()=>{fetchNews();loadSecData();}}
                onDiveNews={handleNews} onDiveFiling={handleFiling} onDiveInsider={handleInsider}
                messages={messages} input={input} setInput={setInput} send={send} loading={loading}
                onOpenChat={()=>{setView("terminal");setMobilePanel("chat");}} accent={accent} T={T} watchlist={watchlist}
                onPickTicker={(s)=>{setOverviewSymbol(s);setView("overview");}}
                gridLayout={migrateDataLayout(layouts?.data)} onGridChange={()=>{}} editMode={false}
                collapsed={collapsed} onToggleCollapse={toggleCollapse}/>
            )}
            {mobileTab==="bot"&&<BotDashboard isMobile accent={accent} T={T} botName="KRONOS BOT" isDev={isDev}/>}
            {view==="overview"&&overviewSymbol&&(
              <TickerOverview symbol={overviewSymbol} T={T} accent={accent}
                messages={messages} input={input} setInput={setInput} send={send} loading={loading}
                fontSize={fontSize} onBack={()=>setView("terminal")} onSymbolChange={(s)=>setOverviewSymbol(s)}/>
            )}
          </div>
        )}

        {/* ── DESKTOP BODY — unchanged above 768px ───────────────────────────── */}
        {!isMobile&&(
        <div style={{display:"flex",flex:1,overflow:"hidden",position:"relative",zIndex:1}}>
          {/* LEFT PANEL — data page (terminal renders its own copy, grid-aware) */}
          {(view==="data"||(view==="terminal"&&!terminalGrid))&&(
            collapsed.term_watchlist?(
              <CollapsedRail label="Watchlist" side="left" onExpand={()=>toggleCollapse("term_watchlist")} accent={accent} T={TL}/>
            ):(
            <>
              <div style={{width:leftWidth,minWidth:leftWidth,borderRight:`1px solid ${TL.border}`,display:"flex",flexDirection:"column",background:TL.panel,position:"relative"}}>
                <button onClick={()=>toggleCollapse("term_watchlist")} title="Collapse watchlist" style={{position:"absolute",top:8,right:8,zIndex:10,width:18,height:18,borderRadius:4,background:`${TL.panel}cc`,border:`1px solid ${TL.border}`,color:TL.dim,cursor:"pointer",fontFamily:FONT_MONO,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>◂</button>
                {watchlistInner}
              </div>
              <ResizeDivider onMouseDown={startResize("left",leftWidth)} accent={accent}/>
            </>
            )
          )}

          <div style={{display:view==="chart"?"flex":"none",flex:1,overflow:"hidden"}}>
            <ChartPage symbol={chartSymbol} onSymbolChange={setChartSymbol} interval={chartInterval} onIntervalChange={setChartInterval} annotations={chartAnnotations} onClearAnnotations={()=>clearChartAnnotations(chartSymbol)} messages={messages} input={input} setInput={setInput} send={send} loading={loading} onButton={onButton} accent={accent} T={T} TR={TR} chartRightWidth={chartRightWidth} onStartResizeRight={startResize("chartRight",chartRightWidth)} fontSize={fontSize}/>
          </div>

          {/* TERMINAL VIEW — classic flex (default) */}
          {view==="terminal"&&!terminalGrid&&(
            <>
              <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
                {consoleInner}
              </div>
              {collapsed.term_news?(
                <CollapsedRail label="News" side="right" onExpand={()=>toggleCollapse("term_news")} accent={accent} T={TR}/>
              ):(
                <>
                  <ResizeDivider onMouseDown={startResize("right",rightWidth)} accent={accent}/>
                  <div style={{width:rightWidth,minWidth:rightWidth,borderLeft:`1px solid ${TR.border}`,position:"relative"}}>
                    <button onClick={()=>toggleCollapse("term_news")} title="Collapse news" style={{position:"absolute",top:8,left:8,zIndex:10,width:18,height:18,borderRadius:4,background:`${TR.panel}cc`,border:`1px solid ${TR.border}`,color:TR.dim,cursor:"pointer",fontFamily:FONT_MONO,fontSize:9,display:"flex",alignItems:"center",justifyContent:"center"}}>▸</button>
                    {newsInner}
                  </div>
                </>
              )}
            </>
          )}

          {/* TERMINAL VIEW — V9 drag-and-drop grid (custom layouts) */}
          {view==="terminal"&&terminalGrid&&(
            <GridDock
              layout={layouts?.terminal||DEFAULT_TERMINAL_LAYOUT}
              onLayoutChange={(l)=>{if(layoutEdit)setLayouts(prev=>({...prev,terminal:l}));}}
              editMode={layoutEdit}
              accent={accent} T={T}
              collapsed={collapsed} onToggleCollapse={toggleCollapse}
              items={{watchlist:watchlistInner,console:consoleInner,news:newsInner,...noteItems}}
            />
          )}

          {/* DATA VIEW */}
          {view==="data"&&(
            <DataPage news={news} secData={secData} secLoading={secLoading} onRefreshAll={()=>{fetchNews();loadSecData();}} onDiveNews={handleNews} onDiveFiling={handleFiling} onDiveInsider={handleInsider} messages={messages} input={input} setInput={setInput} send={send} loading={loading} onOpenChat={()=>setView("terminal")} accent={accent} T={T} watchlist={watchlist}
              onPickTicker={(s)=>{setOverviewSymbol(s);setView("overview");}}
              gridLayout={migrateDataLayout(layouts?.data)} onGridChange={(l)=>setLayouts(prev=>({...prev,data:l}))} editMode={layoutEdit} collapsed={collapsed} onToggleCollapse={toggleCollapse}/>
          )}

          {/* BOT DASHBOARD VIEW */}
{view==="bot"&&(
  <BotDashboard accent={accent} T={T} botName="KRONOS BOT" isDev={isDev} />
)}

          {/* V12: PER-TICKER OVERVIEW VIEW */}
          {view==="overview"&&overviewSymbol&&(
            <TickerOverview symbol={overviewSymbol} T={T} accent={accent}
              messages={messages} input={input} setInput={setInput} send={send} loading={loading}
              fontSize={fontSize} onBack={()=>setView("terminal")}/>
          )}

        </div>
        )}

        {/* Bottom tab bar — mobile only, always last so it pins to the bottom. */}
        {isMobile&&(
          <MobileTabBar active={mobileTab} accent={accent} T={T} alertCount={newsAlerts.length}
            onSelect={(id)=>{
              // Map a tab back onto (view, mobilePanel). Keeping `view` authoritative
              // means AI actions, the tour, and deep links all still drive the phone
              // layout for free.
              if(id==="chart"){setView("chart");}
              else if(id==="bot"){setView("bot");}
              else if(id==="data"){setView("data");}
              else if(id==="overview"){if(!overviewSymbol)setOverviewSymbol(chartSymbol||"AAPL");setView("overview");}
              else{setView("terminal");setMobilePanel(id);}
            }}/>
        )}
      </div>
    </>      )}
    </>  );
}