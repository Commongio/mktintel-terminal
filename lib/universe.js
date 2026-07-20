// lib/universe.js — V10.2 market-cap-tiered scan universe + risk-tier mapping.
//
// Honest scope note: truly scanning *every* US stock every couple minutes is
// infeasible on free data tiers (rate limits / IP bans). What this delivers is
// a meaningfully BROADER, tiered universe (large + mid + small cap) than the old
// 7-large-cap list, refreshed with the day's most-active names — and a mapping
// from the user's existing risk profile to which tiers they see.
//
// Tiers: "large" = mega/large cap, lower volatility, safer.
//        "mid"   = mid cap, moderate volatility.
//        "small" = small/micro cap + high-beta, bigger swings, higher risk.

// Curated tiered fallback (always available, no network needed).
export const CURATED = {
  large: ["SPY", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "JPM", "V", "UNH", "XOM", "WMT", "COST", "HD", "PG",
    "MU", "INTC", "CSCO", "ORCL", "IBM", "TXN", "QCOM", "AVGO", "DIS", "KO", "PEP", "BA", "GE", "F", "GM", "T", "VZ", "BAC", "WFC"],
  mid:   ["AMD", "TSLA", "PLTR", "COIN", "SHOP", "UBER", "SNOW", "CRWD", "NET", "DKNG", "RBLX", "ROKU", "PINS", "SOFI"],
  small: ["IONQ", "RKLB", "GME", "MSTR", "SMCI", "MARA", "RIOT", "CLSK", "LUNR", "BBAI", "SOUN", "TMC", "ACHR", "CIFR"],
};

// Futures live in their own small universe; tiered by instrument type.
export const FUTURES_UNIVERSE = {
  large: ["ES", "MES", "NQ", "MNQ"],   // index futures — deepest, steadiest
  mid:   ["YM", "RTY", "CL", "GC"],    // Dow/Russell + oil/gold
  small: ["NG", "SI", "BTC", "ETH"],   // nat gas / silver / crypto — wildest
};

// Reverse lookup: symbol → tier.
const TIER_OF = (() => {
  const m = {};
  for (const [tier, syms] of Object.entries(CURATED)) syms.forEach((s) => (m[s] = tier));
  for (const [tier, syms] of Object.entries(FUTURES_UNIVERSE)) syms.forEach((s) => (m[s] = tier));
  return m;
})();

// Dynamic names we don't know get a heuristic tier (default "small" — unknown/
// most-active often means a mover worth treating as higher risk).
export function symbolTier(symbol) {
  return TIER_OF[String(symbol || "").toUpperCase()] || "small";
}

// Map the user's onboarding risk profile → the tiers they should SEE.
// riskTolerance: Conservative | Balanced | Aggressive | Adaptive
// experience:    Beginner | Intermediate | Advanced
export function allowedTiers(profile, vix) {
  const risk = String(profile?.riskTolerance || "Balanced");
  const exp = String(profile?.experience || "Intermediate");
  // Adaptive: VIX-driven — calm markets let riskier tiers through; fear locks down.
  if (risk === "Adaptive") {
    if (vix != null && vix >= 25) return ["large"];
    if (vix != null && vix >= 18) return ["large", "mid"];
    return ["large", "mid", "small"];
  }
  // Beginners are held to safer names regardless of stated tolerance.
  if (exp === "Beginner") return risk === "Aggressive" ? ["large", "mid"] : ["large"];
  if (risk === "Conservative") return ["large"];
  if (risk === "Aggressive") return ["large", "mid", "small"];
  return ["large", "mid"]; // Balanced
}

// ── ROTATING-BUCKET SCANNING (V10.3) ──────────────────────────────────────────
//
// The problem: "scan every tradeable stock" is not achievable on free data tiers.
// ~5,000 US tickers × a full options-chain fetch each, every 2 minutes, would hit
// Yahoo/Finnhub rate limits (and an IP ban) within the hour — and Vercel kills the
// function at 60s anyway (maxDuration).
//
// The fix: keep a LARGE liquid universe, and scan a different SLICE of it each
// cron run. Over a full rotation the whole universe gets covered, while any single
// run stays inside the rate limit and the 60s budget.
//
//   BUCKET_SIZE symbols/run × (1 run / 2 min) → full sweep in
//   ceil(universe / BUCKET_SIZE) × 2 min.
//
// Movers are not left to chance: the day's most-actives are PINNED into every run
// (they're the names most likely to be printing a setup right now), and only the
// remaining slots rotate. So hot names are always fresh; the long tail is covered
// on a cycle.
export const BUCKET_SIZE = 26;   // symbols scanned per cron run (fits the 60s budget)
export const PINNED_MOVERS = 10; // slots per run reserved for the day's most-actives

// The rotation stride is a CONSTANT, not (BUCKET_SIZE - actual pinned count).
// It has to be: the cursor advances by this same number every run, so if the
// slice size flexed with however many most-actives happened to come back, the
// cursor and the slice would disagree and the rotation would silently skip
// symbols (permanent coverage holes) or re-scan the same ones (wasted budget).
export const ROTATING_PER_RUN = BUCKET_SIZE - PINNED_MOVERS; // 16

// The rotating long tail: liquid, optionable US names beyond the curated core.
// Deliberately a fixed list (not "every ticker") — illiquid names produce garbage
// signals and burn rate limit for nothing.
export const ROTATION_POOL = [
  // mega/large
  "SPY","QQQ","IWM","DIA","AAPL","MSFT","GOOGL","GOOG","AMZN","META","NVDA","TSLA","BRK.B","JPM","V","MA","UNH","XOM","WMT","COST","HD","PG","JNJ","LLY","AVGO","ORCL","CVX","MRK","ABBV","PEP","KO","BAC","CRM","AMD","ADBE","NFLX","TMO","MCD","CSCO","ACN","LIN","ABT","DHR","WFC","TXN","VZ","DIS","PM","CAT","INTU","IBM","GE","QCOM","NOW","NEE","CMCSA","RTX","AMGN","PFE","UNP","SPGI","HON","LOW","COP","BKNG","GS","ELV","SYK","BLK","T","PLD","AXP","MDT","LMT","ADP","GILD","MDLZ","CVS","VRTX","SCHW","MMC","TJX","ADI","CI","REGN","ETN","ZTS","SLB","BSX","MO","SO","EOG","PGR","DUK","BDX","ITW","AON","CSX","CL","APD","NOC","MMM","FDX","EMR","MCK","PSX","GD","TGT","MPC","USB","NSC","PNC","MET","AIG","PRU","AFL","TRV","ALL","F","GM","DAL","UAL","LUV","AAL","BA","UBER","LYFT","ABNB","DASH",
  // mid / high-beta growth
  "PLTR","COIN","SHOP","SNOW","CRWD","NET","DDOG","ZS","OKTA","TWLO","SQ","PYPL","ROKU","PINS","SNAP","SPOT","RBLX","U","DKNG","PENN","CHWY","ETSY","EBAY","W","CVNA","CARV","AFRM","UPST","SOFI","LC","HOOD","MARA","RIOT","CLSK","HUT","BITF","MSTR","SMCI","DELL","HPQ","HPE","WDC","STX","MU","LRCX","AMAT","KLAC","ASML","ARM","INTC","ON","MRVL","SWKS","QRVO","TER","ENPH","SEDG","FSLR","RUN","PLUG","BE","CHPT","BLNK","RIVN","LCID","NIO","XPEV","LI","FSR","NKLA","QS","MP","ALB","LTHM",
  // biotech / pharma movers
  "MRNA","BNTX","NVAX","SRPT","ALNY","BMRN","IONS","EXAS","ILMN","CRSP","EDIT","NTLA","BEAM","VERV","RXRX","SDGR","TDOC","HIMS","OSCR","CLOV","DOCS",
  // consumer / retail / travel
  "NKE","LULU","DECK","ONON","CROX","SKX","RL","PVH","GPS","ANF","AEO","URBN","BBY","DG","DLTR","ROST","BURL","KSS","M","JWN","CMG","SBUX","YUM","DPZ","WING","SHAK","CAVA","DRI","TXRH","MAR","HLT","H","RCL","CCL","NCLH","EXPE","TRIP",
  // energy / materials / industrials
  "OXY","DVN","FANG","HAL","BKR","APA","MRO","HES","PXD","CTRA","EQT","AR","RRC","SWN","LNG","OKE","WMB","KMI","ET","EPD","FCX","NEM","GOLD","AA","X","CLF","NUE","STLD","VMC","MLM","DE","CMI","PCAR","URI","FAST","GWW",
  // financials / fintech
  "C","MS","TFC","COF","DFS","SYF","ALLY","FITB","KEY","RF","HBAN","CFG","ZION","CMA","MTB","NTRS","STT","BK","ICE","CME","NDAQ","CBOE","MSCI","MCO","FIS","FISV","GPN","TOST","MQ",
  // media / telecom / misc high-volume
  "WBD","PARA","FOXA","NWSA","LYV","EA","TTWO","RBLX","MTCH","BMBL","YELP","ZG","OPEN","RDFN","COMP","IONQ","RGTI","QBTS","BBAI","SOUN","AI","PATH","GTLB","MDB","ESTC","CFLT","S","PANW","FTNT","CYBR","TENB","RPD",
  // popular ETFs / vol
  "TQQQ","SQQQ","SOXL","SOXS","SPXL","SPXS","TNA","TZA","UVXY","VXX","SVXY","XLF","XLE","XLK","XLV","XLI","XLY","XLP","XLU","XLB","XLRE","XLC","SMH","XBI","ARKK","KRE","GDX","GDXJ","SLV","GLD","USO","UNG","TLT","HYG","EEM","FXI","EWZ",
];

// Deduped, ordered scan pool: curated core first (always highest quality), then
// the long tail. This is the list the rotation walks.
export const FULL_UNIVERSE = [...new Set([
  ...CURATED.large, ...CURATED.mid, ...CURATED.small,
  ...ROTATION_POOL,
].map((s) => s.toUpperCase()))];

// How many runs a full sweep takes.
export function rotationLength() {
  return Math.ceil(FULL_UNIVERSE.length / ROTATING_PER_RUN);
}

// The scan universe for ONE cron run.
//   cursor — rotation offset (see nextCursor / the cron's clock-derived cursor).
//   extras — the day's most-actives; PINNED so movers are never missed.
export function scanUniverse(assetClass, extras = [], cursor = 0) {
  if (assetClass === "futures") {
    // Futures is a tiny universe — scan all of it every run, no rotation needed.
    return [...FUTURES_UNIVERSE.large, ...FUTURES_UNIVERSE.mid, ...FUTURES_UNIVERSE.small];
  }

  const pinned = extras.map((s) => String(s).toUpperCase()).slice(0, PINNED_MOVERS);

  // Always take exactly ROTATING_PER_RUN names from the pool, starting at `cursor`.
  // A pinned name that also falls in this window is skipped (it's already covered)
  // and we take the NEXT pool entry instead — so the window still advances by
  // exactly ROTATING_PER_RUN and the cursor stays in lockstep.
  const slice = [];
  const n = FULL_UNIVERSE.length;
  for (let i = 0; i < ROTATING_PER_RUN; i++) {
    const sym = FULL_UNIVERSE[(cursor + i) % n];
    if (!pinned.includes(sym)) slice.push(sym);
  }

  return [...new Set([...pinned, ...slice])];
}

// Where the next run picks up. Advances by exactly the rotating stride.
export function nextCursor(cursor = 0) {
  return (cursor + ROTATING_PER_RUN) % FULL_UNIVERSE.length;
}

// Dynamic most-actives from Yahoo's predefined screener. Reuses the same
// cookie+crumb handshake the options chain needs. Best-effort: returns [] on any
// failure so callers fall back to the curated universe.
const YF_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
  Accept: "application/json",
};
let _session = null;
async function yahooSession(force = false) {
  if (!force && _session && Date.now() - _session.at < 25 * 60_000) return _session;
  const r1 = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": YF_HEADERS["User-Agent"], Accept: "text/html,*/*;q=0.8" }, redirect: "manual", signal: AbortSignal.timeout(6000) }).catch(() => null);
  const cookie = (r1?.headers?.get("set-cookie") || "").split(";")[0] || "";
  if (!cookie) throw new Error("No Yahoo cookie");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { ...YF_HEADERS, Cookie: cookie }, signal: AbortSignal.timeout(6000) });
  if (!r2.ok) throw new Error(`crumb ${r2.status}`);
  const crumb = (await r2.text()).trim();
  if (!crumb || crumb.includes("<")) throw new Error("bad crumb");
  _session = { cookie, crumb, at: Date.now() };
  return _session;
}
export async function fetchMostActives(count = 20) {
  try {
    const s = await yahooSession();
    const url = `https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=most_actives&count=${count}&crumb=${encodeURIComponent(s.crumb)}`;
    const r = await fetch(url, { headers: { ...YF_HEADERS, Cookie: s.cookie }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`screener ${r.status}`);
    const data = await r.json();
    const quotes = data?.finance?.result?.[0]?.quotes || [];
    // Only keep US equities with real symbols (skip weird tickers).
    return quotes.map((q) => q.symbol).filter((s) => /^[A-Z]{1,5}$/.test(s));
  } catch {
    return [];
  }
}

// V12: full-detail predefined screener for the Data page's Top Movers / Top
// Losers. scrId ∈ 'day_gainers' | 'day_losers' | 'most_actives'. This is Yahoo's
// MARKET-WIDE screener — it covers every tradeable US equity, not the curated
// universe, which is exactly what the movers tabs need. Returns rich rows (price,
// %change, volume, name). Best-effort: throws so the route can 502 cleanly.
export async function fetchScreener(scrId, count = 25) {
  const valid = { day_gainers: 1, day_losers: 1, most_actives: 1 };
  const id = valid[scrId] ? scrId : "day_gainers";
  const n = Math.min(count, 100);

  // The cookie+crumb handshake (fc.yahoo.com/getcrumb) frequently 406/404s from
  // datacenter IPs. The predefined screener also answers WITHOUT a crumb on
  // query1 — more reliable here — so try that first and only fall back to the
  // crumb'd query2 path if the no-crumb one fails.
  let quotes = null;
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${id}&count=${n}`,
      { headers: YF_HEADERS, signal: AbortSignal.timeout(8000) }
    );
    if (r.ok) quotes = (await r.json())?.finance?.result?.[0]?.quotes || null;
  } catch { /* fall through to crumb path */ }

  if (!quotes) {
    const s = await yahooSession();
    const url = `https://query2.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${id}&count=${n}&crumb=${encodeURIComponent(s.crumb)}`;
    const r = await fetch(url, { headers: { ...YF_HEADERS, Cookie: s.cookie }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`screener ${r.status}`);
    quotes = (await r.json())?.finance?.result?.[0]?.quotes || [];
  }

  return quotes
    .filter((q) => q.symbol && /^[A-Z]{1,5}$/.test(q.symbol) && q.regularMarketPrice != null)
    .map((q) => ({
      symbol: q.symbol,
      name: q.shortName || q.longName || q.symbol,
      price: q.regularMarketPrice ?? null,
      change: q.regularMarketChange ?? null,
      changePct: q.regularMarketChangePercent ?? null,
      volume: q.regularMarketVolume ?? null,
      marketCap: q.marketCap ?? null,
    }));
}
