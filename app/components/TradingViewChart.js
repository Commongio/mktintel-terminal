// app/components/TradingViewChart.js
"use client";
import { useEffect, useRef } from "react";

export default function TradingViewChart({ symbol = "AAPL", interval = "D", colorTheme = "dark" }) {
  const containerRef = useRef(null);
  const idRef = useRef(`tv_${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    if (!containerRef.current) return;
    const cid = idRef.current;
    containerRef.current.innerHTML = `<div id="${cid}" style="height:100%;width:100%;"></div>`;

    const init = () => {
      if (!window.TradingView || !document.getElementById(cid)) return;
      try {
        new window.TradingView.widget({
          container_id: cid,
          autosize: true,
          symbol,
          interval,
          timezone: "America/New_York",
          theme: colorTheme,
          style: "1",
          locale: "en",
          enable_publishing: false,
          withdateranges: true,
          hide_side_toolbar: false,
          allow_symbol_change: true,
          details: true,
          hotlist: false,
          calendar: false,
          save_image: false,
          studies: ["STD;MACD", "STD;Volume"],
        });
      } catch (e) {}
    };

    const existing = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]');
    if (window.TradingView) { init(); }
    else if (existing) { existing.addEventListener("load", init); return () => existing.removeEventListener("load", init); }
    else {
      const s = document.createElement("script");
      s.src = "https://s3.tradingview.com/tv.js";
      s.async = true; s.onload = init;
      document.head.appendChild(s);
    }
    return () => { if (containerRef.current) containerRef.current.innerHTML = ""; };
  }, [symbol, interval, colorTheme]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 0 }} />;
}