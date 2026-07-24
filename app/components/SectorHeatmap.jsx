"use client";
// SectorHeatmap.jsx — finviz-style sector treemap for the Data page.
// Uses TradingView's free stock-heatmap widget: tile size = market cap, color =
// % change (green/red), grouped by sector. Its built-in top bar carries the
// index switcher (S&P 500 / Nasdaq 100 / Dow …) and the size/color selectors,
// which is exactly the control set the reference calls for — no API key, no
// per-constituent data to maintain on our side.
import { useEffect, useRef } from "react";

const isDarkBg = (bg) => {
  const hex = (bg ?? "#060910").replace("#", "");
  if (hex.length !== 6) return true;
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 <= 0.55;
};

export default function SectorHeatmap({ T }) {
  const containerRef = useRef(null);
  const isDark = isDarkBg(T?.bg);

  useEffect(() => {
    const host = containerRef.current;
    if (!host) return;
    host.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    host.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      dataSource: "SPX500",         // default index; the top bar lets the user switch
      blockSize: "market_cap_basic", // tile size = market cap
      blockColor: "change",          // color = % change (green/red)
      grouping: "sector",            // sector-grouped treemap
      locale: "en",
      symbolUrl: "",
      colorTheme: isDark ? "dark" : "light",
      hasTopBar: true,               // index + size + color + grouping controls
      isDataSetEnabled: true,
      isZoomEnabled: true,
      isMonoSize: false,
      width: "100%",
      height: "100%",
    });
    host.appendChild(script);

    return () => { host.innerHTML = ""; };
  }, [isDark]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ width: "100%", height: "100%", minHeight: 0 }}
    />
  );
}
