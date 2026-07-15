"use client";
// TickerLogo.jsx — V10 instrument logo shown wherever a ticker appears.
// Tries the free Parqet logo CDN, falls back to a deterministic-color
// monogram badge (works for futures/crypto symbols with no corporate logo).
import { useState } from "react";

const FM = "'JetBrains Mono',monospace";
const PALETTE = ["#00d4aa", "#7eb8f7", "#a78bfa", "#f7c948", "#fb923c", "#f472b6", "#34d399", "#60a5fa"];
const hashColor = (s) => PALETTE[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
// Symbols that never have corporate logos — skip the network attempt.
const NO_LOGO = /^(NQ|MNQ|ES|MES|CL|GC|YM|ZB|6E|\^|BTC|ETH)/;

export default function TickerLogo({ symbol, size = 18, style }) {
  const sym = String(symbol || "?").toUpperCase();
  const [failed, setFailed] = useState(false);
  const c = hashColor(sym);
  const tryImg = !failed && !NO_LOGO.test(sym) && /^[A-Z.]{1,6}$/.test(sym);

  if (tryImg) {
    return (
      <img
        src={`https://assets.parqet.com/logos/symbol/${sym}?format=png&size=${size * 2}`}
        alt=""
        width={size} height={size}
        onError={() => setFailed(true)}
        style={{ width: size, height: size, borderRadius: size * 0.28, objectFit: "cover", flexShrink: 0, background: "#0c1420", ...style }}
        loading="lazy"
      />
    );
  }
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: `${c}1c`, border: `1px solid ${c}45`,
      fontFamily: FM, fontSize: size * 0.44, fontWeight: 800, color: c, letterSpacing: 0,
      ...style,
    }}>
      {sym.replace("^", "").slice(0, 2)}
    </span>
  );
}
