// lib/companyNames.js — shared static company-name fallback.
//
// Live quote providers (Yahoo's shortName/longName) often fail from datacenter
// IPs (see lib/marketData.js's own comments on this) and degrade to name===
// symbol. Rather than showing a blank/duplicate name in that case, callers
// fall back to this curated map for well-known tickers. Extracted out of
// page.js so both it (watchlist meta) and TickerTape.js (LED ticker strip)
// share one source instead of two copies drifting apart.
export const COMPANY_NAMES = {
  NVDA: "NVIDIA Corp", AAPL: "Apple Inc", MSFT: "Microsoft Corp", GOOGL: "Alphabet Inc",
  AMZN: "Amazon.com Inc", META: "Meta Platforms", TSLA: "Tesla Inc", AMD: "Advanced Micro Devices",
  JPM: "JPMorgan Chase", V: "Visa Inc", UNH: "UnitedHealth Group", LLY: "Eli Lilly",
  XOM: "Exxon Mobil", BA: "Boeing Co", WMT: "Walmart Inc", COST: "Costco Wholesale",
  NKE: "Nike Inc", DIS: "Walt Disney Co", PLTR: "Palantir Technologies", RKLB: "Rocket Lab",
  IONQ: "IonQ Inc", SMCI: "Super Micro Computer", GME: "GameStop Corp", MSTR: "MicroStrategy",
  SPY: "S&P 500 ETF", QQQ: "Nasdaq 100 ETF", IWM: "Russell 2000 ETF", DIA: "Dow Jones ETF",
  COIN: "Coinbase Global", RIOT: "Riot Platforms", MARA: "Marathon Digital", CLSK: "CleanSpark",
  ADBE: "Adobe Inc", CRM: "Salesforce Inc", ORCL: "Oracle Corp", INTC: "Intel Corp",
  QCOM: "Qualcomm Inc", PYPL: "PayPal Holdings", SQ: "Block Inc", SHOP: "Shopify Inc",
  UBER: "Uber Technologies", SBUX: "Starbucks Corp", MCD: "McDonald's Corp", TGT: "Target Corp",
  HD: "Home Depot", CAT: "Caterpillar Inc", GE: "General Electric", RTX: "RTX Corp",
  KO: "Coca-Cola Co", PEP: "PepsiCo Inc", PG: "Procter & Gamble", JNJ: "Johnson & Johnson",
  T: "AT&T Inc", VZ: "Verizon Communications", C: "Citigroup Inc", WFC: "Wells Fargo",
  GS: "Goldman Sachs", MS: "Morgan Stanley", BAC: "Bank of America", AVGO: "Broadcom Inc",
  NFLX: "Netflix Inc",
};
