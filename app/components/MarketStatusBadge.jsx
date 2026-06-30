"use client";
import { useState, useEffect } from "react";

const FM = "'JetBrains Mono',monospace";

function getMarketStatus() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = now.getDay(); // 0 = Sun, 6 = Sat
  const mins = now.getHours() * 60 + now.getMinutes();

  if (day === 0 || day === 6) {
    return { label: "MARKET CLOSED", sub: "Weekend", color: "#3a4a5a" };
  }

  const PRE_OPEN   = 4 * 60;        // 4:00 AM
  const MKT_OPEN   = 9 * 60 + 30;   // 9:30 AM
  const MKT_CLOSE  = 16 * 60;       // 4:00 PM
  const AH_CLOSE   = 20 * 60;       // 8:00 PM

  if (mins >= MKT_OPEN && mins < MKT_CLOSE) {
    return { label: "MARKET OPEN", sub: "Regular hours", color: "#00ff88" };
  }
  if (mins >= PRE_OPEN && mins < MKT_OPEN) {
    return { label: "PRE-MARKET", sub: "Thin liquidity", color: "#f7c948" };
  }
  if (mins >= MKT_CLOSE && mins < AH_CLOSE) {
    return { label: "AFTER-HOURS", sub: "Thin liquidity", color: "#f7c948" };
  }
  return { label: "MARKET CLOSED", sub: "Next session ahead", color: "#3a4a5a" };
}

export default function MarketStatusBadge({ accent, T }) {
  const [status, setStatus] = useState(getMarketStatus());
  const dim = T?.dim ?? "#3a4a5a";

  useEffect(() => {
    const t = setInterval(() => setStatus(getMarketStatus()), 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      padding: "5px 12px", borderRadius: 20,
      border: `1px solid ${status.color}30`,
      background: `${status.color}0c`,
    }} title={status.sub}>
      <div style={{
        width: 7, height: 7, borderRadius: "50%",
        background: status.color, boxShadow: `0 0 7px ${status.color}`,
        animation: status.label === "MARKET OPEN" ? "pulse 1.6s ease-in-out infinite" : "none",
      }} />
      <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: status.color }}>
        {status.label}
      </span>
    </div>
  );
}