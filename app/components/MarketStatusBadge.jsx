"use client";
import { useState, useEffect } from "react";

const FM = "'JetBrains Mono',monospace";

export function getMarketStatus() {
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

// V13: futures trade nearly around the clock (CME Globex: Sun 6PM ET open ->
// Fri 5PM ET close, with a daily Mon-Thu 5-6PM ET maintenance break) — a very
// different session shape than the equity badge above. The signal-generation
// code has NO market-hours gating for futures (confirmed in lib/universe.js /
// cron/generate-signals), so this is purely an honesty fix: a funded-futures
// trader watching the header in Futures mode should see THIS, not the equity
// "MARKET CLOSED" badge, which would wrongly imply the bot stopped scanning.
export function getFuturesSessionStatus() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const mins = now.getHours() * 60 + now.getMinutes();
  const M17 = 17 * 60, M18 = 18 * 60; // 5:00 PM / 6:00 PM ET

  if (day === 6) return { label: "SESSION CLOSED", sub: "Weekend — reopens Sunday 6PM ET", color: "#3a4a5a" };
  if (day === 0 && mins < M18) return { label: "SESSION CLOSED", sub: "Reopens Sunday 6PM ET", color: "#3a4a5a" };
  if (day === 5 && mins >= M17) return { label: "SESSION CLOSED", sub: "Weekend — reopens Sunday 6PM ET", color: "#3a4a5a" };
  if (day >= 1 && day <= 4 && mins >= M17 && mins < M18) return { label: "DAILY BREAK", sub: "Reopens 6PM ET", color: "#f7c948" };
  return { label: "GLOBEX ACTIVE", sub: "Futures scanning 24/5", color: "#00ff88" };
}

export function FuturesSessionBadge({ T }) {
  const [status, setStatus] = useState(getFuturesSessionStatus());
  useEffect(() => {
    const t = setInterval(() => setStatus(getFuturesSessionStatus()), 15000);
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
        animation: status.label === "GLOBEX ACTIVE" ? "pulse 1.6s ease-in-out infinite" : "none",
      }} />
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, fontWeight: 800, letterSpacing: 1.5, color: status.color }}>
        {status.label}
      </span>
    </div>
  );
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