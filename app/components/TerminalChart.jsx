"use client";
import { useEffect, useRef, useState } from "react";

const FM = "'JetBrains Mono',monospace";

const QUICK_SYMS = ["SPY", "QQQ", "NVDA", "AAPL", "TSLA"];

export default function TerminalChart({ accent, T, defaultSymbol = "SPY" }) {
  const containerRef = useRef(null);
  const [symbol, setSymbol] = useState(defaultSymbol);
  const isDark = (() => {
    // crude luminance check on T.bg
    const hex = (T?.bg ?? "#060910").replace("#", "");
    if (hex.length !== 6) return true;
    const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
    return (0.299*r+0.587*g+0.114*b)/255 <= 0.55;
  })();

  const border  = T?.border  ?? "#172030";
  const surface = T?.surface ?? "#0b1320";
  const dim     = T?.dim     ?? "#3a4a5a";
  const text    = T?.text    ?? "#c8d8e8";

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    containerRef.current.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src  = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol: `${symbol.includes(":") ? symbol : `NASDAQ:${symbol}`}`,
      width: "100%",
      height: 220,
      locale: "en",
      dateRange: "1D",
      colorTheme: isDark ? "dark" : "light",
      isTransparent: true,
      autosize: true,
      largeChartUrl: "",
    });
    containerRef.current.appendChild(script);
  }, [symbol, isDark]);

  return (
    <div style={{
      borderTop: `1px solid ${border}`, background: surface,
      flexShrink: 0, padding: "10px 16px 14px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, fontWeight: 700 }}>QUICK CHART</span>
          <div style={{ display: "flex", gap: 4 }}>
            {QUICK_SYMS.map(s => (
              <button key={s} onClick={() => setSymbol(s)} style={{
                fontFamily: FM, fontSize: 9, fontWeight: 700,
                color: symbol === s ? accent : dim,
                background: symbol === s ? `${accent}12` : "transparent",
                border: `1px solid ${symbol === s ? `${accent}28` : border}`,
                padding: "2px 8px", borderRadius: 5, cursor: "pointer",
              }}>{s}</button>
            ))}
          </div>
        </div>
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
          placeholder="TICKER"
          style={{
            width: 80, background: "#060910", border: `1px solid ${border}`,
            borderRadius: 6, padding: "3px 8px", color: text,
            fontFamily: FM, fontSize: 10, fontWeight: 700, textAlign: "center",
          }}
        />
      </div>
      <div ref={containerRef} style={{ width: "100%", minHeight: 220, borderRadius: 8, overflow: "hidden" }} />
    </div>
  );
}