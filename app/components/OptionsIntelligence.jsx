"use client";
import { useState, useEffect, useCallback } from "react";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const convColor = (ratio) =>
  ratio >= 10 ? "#ff4d6d" : ratio >= 5 ? "#f7c948" : ratio >= 3 ? "#00ff88" : "#7eb8f7";

// ─── UOA ROW ──────────────────────────────────────────────────────────────────
function UOARow({ item, accent }) {
  const cc     = convColor(item.ratio);
  const isCall = item.type === "CALL";
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "52px 48px 70px 60px 60px 52px 1fr",
      alignItems: "center", gap: 4,
      padding: "7px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)",
      fontSize: 10, fontFamily: FM,
    }}>
      <span style={{ fontWeight: 700, color: "#c8d8e8" }}>{item.symbol}</span>
      <span style={{
        padding: "2px 5px", borderRadius: 3, fontSize: 8, fontWeight: 700,
        color: isCall ? "#00ff88" : "#ff4d6d",
        background: isCall ? "rgba(0,255,136,0.10)" : "rgba(255,77,109,0.10)",
        border: `1px solid ${isCall ? "rgba(0,255,136,0.25)" : "rgba(255,77,109,0.25)"}`,
      }}>
        {item.type}
      </span>
      <span style={{ color: "#c8d8e8" }}>${item.strike}</span>
      <span style={{ color: "#7eb8f7" }}>{item.expiry?.slice(5)}</span>
      <span style={{ color: "#888" }}>{item.volume?.toLocaleString()}</span>
      <span style={{
        fontWeight: 700, color: cc,
        background: `${cc}12`, padding: "2px 5px", borderRadius: 3, textAlign: "center",
      }}>
        {item.ratio}x
      </span>
      <span style={{
        fontSize: 8, padding: "2px 6px", borderRadius: 3, letterSpacing: 1,
        color: isCall ? "#00ff88" : "#ff4d6d",
        background: isCall ? "rgba(0,255,136,0.07)" : "rgba(255,77,109,0.07)",
      }}>
        {item.sentiment}
      </span>
    </div>
  );
}

// ─── HEATMAP CELL ─────────────────────────────────────────────────────────────
function HeatCell({ calls, puts, strike, maxVal }) {
  const callInt = Math.min(1, (calls || 0) / maxVal);
  const putInt  = Math.min(1, (puts  || 0) / maxVal);
  const bg = callInt > putInt
    ? `rgba(0,255,136,${0.08 + callInt * 0.55})`
    : putInt > callInt
    ? `rgba(255,77,109,${0.08 + putInt * 0.55})`
    : "rgba(255,255,255,0.04)";
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: 32, background: bg, borderRadius: 3, cursor: "default",
      transition: "background 0.3s",
    }} title={`$${strike} | C:${calls?.toLocaleString()} P:${puts?.toLocaleString()}`}>
      <span style={{ fontFamily: FM, fontSize: 8, color: "rgba(255,255,255,0.5)" }}>
        {strike}
      </span>
    </div>
  );
}

// ─── EARNINGS CARD ─────────────────────────────────────────────────────────────
function EarningsCard({ item, accent }) {
  const pct    = item.impliedMove?.pct;
  const isHigh = pct > 10;
  return (
    <div style={{
      padding: "12px 14px", background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: FM, fontSize: 14, fontWeight: 700, color: "#c8d8e8" }}>{item.symbol}</div>
          <div style={{ fontFamily: FM, fontSize: 9, color: "#3a4a5a", marginTop: 2 }}>
            Current: ${item.price?.toFixed(2) ?? "—"}
          </div>
        </div>
        {pct != null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: FM, fontSize: 22, fontWeight: 800,
              color: isHigh ? "#f7c948" : accent, lineHeight: 1 }}>
              ±{pct}%
            </div>
            <div style={{ fontFamily: FM, fontSize: 8, color: "#3a4a5a", marginTop: 2 }}>
              IMPLIED MOVE
            </div>
          </div>
        )}
      </div>
      {item.impliedMove && (
        <div style={{ fontFamily: FM, fontSize: 9, color: "#3a4a5a" }}>
          ATM straddle: ${item.impliedMove.straddle}
          {pct != null && (
            <span style={{ marginLeft: 8, color: isHigh ? "#f7c948" : accent }}>
              {isHigh ? "HIGH — consider spreads" : "NORMAL — straddle viable"}
            </span>
          )}
        </div>
      )}
      {item.maxPain != null && (
        <div style={{ fontFamily: FM, fontSize: 9, color: "#3a4a5a", marginTop: 4 }}>
          Max Pain: <span style={{ color: "#7eb8f7" }}>${item.maxPain}</span>
          <span style={{ marginLeft: 6, color: "#2a3a4a" }}>
            (market gravitates here near expiry)
          </span>
        </div>
      )}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function OptionsIntelligence({ accent = "#00d4aa", T, watchlistSymbols = [] }) {
  const [tab,       setTab]     = useState("uoa");
  const [data,      setData]    = useState(null);
  const [loading,   setLoading] = useState(false);
  const [error,     setError]   = useState("");
  const [lastFetch, setLast]    = useState(null);

  const bg      = T?.bg      ?? "#060910";
  const surface = T?.surface ?? "#0b1320";
  const border  = T?.border  ?? "#172030";
  const text    = T?.text    ?? "#c8d8e8";
  const dim     = T?.dim     ?? "#3a4a5a";

  // Use watchlist symbols or fallback
  const symbols = watchlistSymbols.length > 0
    ? watchlistSymbols.slice(0, 6).join(",")
    : "SPY,QQQ,NVDA,AAPL,TSLA,AMD";

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/options-flow?symbols=${symbols}`);
      if (!r.ok) throw new Error(`Error ${r.status}`);
      const d = await r.json();
      setData(d);
      setLast(new Date());
    } catch (e) {
      setError(e.message || "Failed to load options data");
    } finally {
      setLoading(false);
    }
  }, [symbols]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const TABS = [
    { id: "uoa",      label: "UNUSUAL ACTIVITY" },
    { id: "heatmap",  label: "FLOW HEATMAP"     },
    { id: "earnings", label: "IMPLIED MOVES"     },
  ];

  // Build heatmap data for first symbol
  const hmSymbol   = data?.bySymbol?.[0];
  const hmOptions  = hmSymbol ? (() => {
    const strikes = [...new Set([
      ...(hmSymbol.uoa.filter(u=>u.symbol===hmSymbol.symbol).map(u=>u.strike)),
    ])].sort((a,b)=>a-b).slice(0, 14);
    const maxVol = Math.max(...hmSymbol.uoa.map(u=>u.volume||0), 1);
    return { strikes, maxVol, symbol: hmSymbol.symbol };
  })() : null;

  return (
    <div style={{
      background: surface, border: `1px solid ${border}`,
      borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "12px 16px", borderBottom: `1px solid ${border}`,
      }}>
        <div>
          <div style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, color: text, letterSpacing: 1 }}>
            OPTIONS INTELLIGENCE
          </div>
          <div style={{ fontFamily: FM, fontSize: 8, color: dim, marginTop: 2, letterSpacing: 1 }}>
            {lastFetch ? `Updated ${lastFetch.toLocaleTimeString()}` : "Loading..."}
          </div>
        </div>
        <button onClick={fetchData} disabled={loading} style={{
          fontFamily: FM, fontSize: 8, color: loading ? dim : accent, letterSpacing: 2,
          background: "transparent", border: `1px solid ${loading ? border : accent + "30"}`,
          borderRadius: 6, padding: "5px 10px", cursor: loading ? "default" : "pointer",
        }}>
          {loading ? "LOADING..." : "REFRESH"}
        </button>
      </div>

      {/* Sub-tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${border}`, background: bg }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "8px 14px", fontFamily: FM, fontSize: 8, fontWeight: 700, letterSpacing: 2,
            color: tab === t.id ? accent : dim,
            background: "transparent", border: "none",
            borderBottom: `2px solid ${tab === t.id ? accent : "transparent"}`,
            cursor: "pointer", transition: "color 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 320 }}>
        {error && (
          <div style={{ padding: 16, fontFamily: FM, fontSize: 10, color: "#ff4d6d", textAlign: "center" }}>
            {error} — <button onClick={fetchData} style={{ color: accent, background:"none", border:"none", cursor:"pointer", fontFamily:FM }}>Retry</button>
          </div>
        )}

        {/* UOA TAB */}
        {tab === "uoa" && !error && (
          <div>
            {/* Column headers */}
            <div style={{
              display: "grid", gridTemplateColumns: "52px 48px 70px 60px 60px 52px 1fr",
              gap: 4, padding: "6px 10px",
              borderBottom: `1px solid ${border}`,
            }}>
              {["TICKER","TYPE","STRIKE","EXPIRY","VOL","RATIO","SIGNAL"].map(h=>(
                <span key={h} style={{ fontFamily:FM, fontSize:7, color:dim, letterSpacing:1, fontWeight:700 }}>{h}</span>
              ))}
            </div>
            {loading && !data && (
              <div style={{ padding:24, textAlign:"center", fontFamily:FM, fontSize:9, color:dim }}>
                Scanning options chains...
              </div>
            )}
            {data?.uoa?.length === 0 && (
              <div style={{ padding:24, textAlign:"center", fontFamily:FM, fontSize:9, color:dim }}>
                No unusual activity detected above threshold.
              </div>
            )}
            {(data?.uoa || []).map((item, i) => (
              <UOARow key={i} item={item} accent={accent} />
            ))}
            <div style={{ padding:"8px 10px", fontFamily:FM, fontSize:7, color:dim, borderTop:`1px solid ${border}` }}>
              Showing contracts where Volume &gt; 2.5x Open Interest and Volume &gt; 500. Source: Yahoo Finance.
            </div>
          </div>
        )}

        {/* HEATMAP TAB */}
        {tab === "heatmap" && !error && (
          <div style={{ padding: 14 }}>
            <div style={{ fontFamily:FM, fontSize:8, color:dim, marginBottom:12, letterSpacing:1 }}>
              GREEN = call volume intensity | RED = put volume intensity | By strike for {hmOptions?.symbol ?? symbols.split(",")[0]}
            </div>
            {loading && !data ? (
              <div style={{ textAlign:"center", fontFamily:FM, fontSize:9, color:dim, padding:24 }}>
                Building heatmap...
              </div>
            ) : hmOptions?.strikes.length > 0 ? (
              <div style={{
                display: "grid", gridTemplateColumns: `repeat(${Math.min(hmOptions.strikes.length,7)},1fr)`,
                gap: 4,
              }}>
                {hmOptions.strikes.map(strike => {
                  const callVol = data.uoa.filter(u=>u.type==="CALL"&&u.strike===strike).reduce((s,u)=>s+u.volume,0);
                  const putVol  = data.uoa.filter(u=>u.type==="PUT" &&u.strike===strike).reduce((s,u)=>s+u.volume,0);
                  return (
                    <HeatCell key={strike} strike={strike} calls={callVol} puts={putVol} maxVal={hmOptions.maxVol} />
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign:"center", fontFamily:FM, fontSize:9, color:dim, padding:24 }}>
                Not enough data to build heatmap. Try refreshing.
              </div>
            )}
            <div style={{ fontFamily:FM, fontSize:7, color:dim, marginTop:12, textAlign:"center" }}>
              Based on unusual activity data above. Full strike heatmap available with Tradier API.
            </div>
          </div>
        )}

        {/* IMPLIED MOVES TAB */}
        {tab === "earnings" && !error && (
          <div style={{ padding: 12, display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ fontFamily:FM, fontSize:8, color:dim, letterSpacing:1, marginBottom:4 }}>
              ATM straddle price / current stock price = options-implied earnings move
            </div>
            {loading && !data ? (
              <div style={{ textAlign:"center", fontFamily:FM, fontSize:9, color:dim, padding:16 }}>
                Calculating implied moves...
              </div>
            ) : (data?.bySymbol || []).filter(s=>s.impliedMove).length === 0 ? (
              <div style={{ textAlign:"center", fontFamily:FM, fontSize:9, color:dim, padding:16 }}>
                Unable to calculate implied moves. Options chain data unavailable.
              </div>
            ) : (
              (data?.bySymbol || [])
                .filter(s => s.impliedMove)
                .sort((a,b) => (b.impliedMove?.pct??0) - (a.impliedMove?.pct??0))
                .map((item,i) => <EarningsCard key={i} item={item} accent={accent} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}