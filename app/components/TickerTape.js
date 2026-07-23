"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import TickerLogo from "./TickerLogo";
import { COMPANY_NAMES } from "../../lib/companyNames";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

const DEFAULT_TAPE = ["SPY","QQQ","NVDA","AAPL","TSLA","META","AMD","MSFT","JPM","AMZN","GOOGL","PLTR","MSTR","BTC-USD","GC=F","CL=F"];

function TapeEditModal({ onClose, symbols, setSymbols, accent, T }) {
  const [val, setVal] = useState(symbols.join(", "));
  const save = () => {
    const s = val.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean).slice(0, 24);
    setSymbols(s);
    try {
      localStorage.setItem("kronos_tape", JSON.stringify(s));
    } catch {}
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.8)",
        zIndex: 9000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 420,
          background: T?.panel ?? "#0A1018",
          border: `1px solid ${accent}40`,
          borderRadius: 14,
          padding: 24,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 2 }}>
            ✎ EDIT TICKER TAPE
          </span>
          <button onClick={onClose} style={{ color: T?.dim ?? "#3a4a5a", fontSize: 18, background: "none", border: "none", cursor: "pointer" }}>
            ✕
          </button>
        </div>
        <div style={{ fontFamily: FM, fontSize: 8, color: T?.dim ?? "#3a4a5a", letterSpacing: 1, marginBottom: 10, lineHeight: 1.6 }}>
          Symbols separated by commas. Max 24.
          <br />
          Futures: NQ=F, ES=F, GC=F, CL=F &nbsp;|&nbsp; Crypto: BTC-USD, ETH-USD
        </div>
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          rows={4}
          style={{
            width: "100%",
            background: T?.surface ?? "#060910",
            border: `1px solid ${T?.border ?? "#172030"}`,
            borderRadius: 8,
            padding: "10px 12px",
            color: T?.text ?? "#E2EDF8",
            fontFamily: FM,
            fontSize: 12,
            letterSpacing: 1,
            marginBottom: 14,
            resize: "none",
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px 0",
              fontFamily: FM,
              fontSize: 10,
              fontWeight: 700,
              color: T?.dim ?? "#3a4a5a",
              background: "transparent",
              border: `1px solid ${T?.border ?? "#172030"}`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            CANCEL
          </button>
          <button
            onClick={save}
            style={{
              flex: 1,
              padding: "10px 0",
              fontFamily: FM,
              fontSize: 10,
              fontWeight: 700,
              color: accent,
              background: `${accent}12`,
              border: `1px solid ${accent}35`,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            SAVE TAPE
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TickerTape({ accent = "#00d4aa", T, speed = 60 }) {
  const [symbols, setSymbols] = useState(() => {
    try {
      const s = localStorage.getItem("kronos_tape");
      return s ? JSON.parse(s) : DEFAULT_TAPE;
    } catch {
      return DEFAULT_TAPE;
    }
  });
  const [quotes, setQuotes] = useState({});
  const [showEdit, setShowEdit] = useState(false);
  const [tickerBg, setTickerBg] = useState("transparent");

  const trackRef = useRef(null);
  const posRef = useRef(0);
  const rafRef = useRef(null);
  const lastRef = useRef(null);

  const border = T?.border ?? "#1A2535";
  const dim = T?.dim ?? "#9DB4CC";

  const fetchQuotes = useCallback(async () => {
    if (!symbols.length) return;
    const BATCH = 8;
    const merged = {};
    for (let i = 0; i < symbols.length; i += BATCH) {
      const batch = symbols.slice(i, i + BATCH);
      try {
        // V13: yf-quotes (not the Finnhub-only /api/quote) — it's the redundant
        // multi-provider layer AND the only one that carries a company `name`,
        // which the new LED-strip layout needs next to every symbol.
        const r = await fetch(`/api/yf-quotes?symbols=${batch.join(",")}`);
        if (r.ok) {
          const d = await r.json();
          (d.data || []).forEach((q) => {
            merged[q.symbol] = q;
          });
        }
      } catch {}
      if (i + BATCH < symbols.length) await new Promise((res) => setTimeout(res, 1100));
    }
    setQuotes(merged);

    const vals = Object.values(merged).filter((q) => q?.changePercent != null);
    if (vals.length > 0) {
      const bulls = vals.filter((q) => q.changePercent >= 0).length;
      const pct = bulls / vals.length;
      setTickerBg(pct >= 0.60 ? "rgba(0,230,118,0.05)" : pct <= 0.40 ? "rgba(255,61,87,0.05)" : "transparent");
    }
  }, [symbols]);

  useEffect(() => {
    fetchQuotes();
    const t = setInterval(fetchQuotes, 60000);
    return () => clearInterval(t);
  }, [fetchQuotes]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const animate = (timestamp) => {
      if (!lastRef.current) lastRef.current = timestamp;
      const delta = timestamp - lastRef.current;
      lastRef.current = timestamp;

      posRef.current -= (speed * delta) / 1000;
      const half = track.scrollWidth / 2;
      if (Math.abs(posRef.current) >= half) {
        posRef.current = 0;
      }

      track.style.transform = `translateX(${posRef.current}px)`;
      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
    };
  }, [speed, symbols]);

  const items = [...symbols, ...symbols, ...symbols];

  return (
    <>
      {showEdit && (
        <TapeEditModal onClose={() => setShowEdit(false)} symbols={symbols} setSymbols={setSymbols} accent={accent} T={T} />
      )}

      {/* V13: LED trading-floor ticker strip — one unbroken illuminated tape.
          Deliberately near-black regardless of the app theme (that's the point
          of the reference look), no per-item border/background, so entries
          read as a single continuous strip instead of segmented cards. */}
      <div
        style={{
          height: 56,
          flexShrink: 0,
          borderBottom: `1px solid ${border}`,
          backgroundColor: "#05070a",
          backgroundImage: tickerBg && tickerBg !== "transparent" ? `linear-gradient(${tickerBg}, ${tickerBg})` : "none",
          display: "flex",
          alignItems: "center",
          overflow: "hidden",
          transition: "background-image 1.5s ease",
          position: "relative",
        }}
      >
        <div ref={trackRef} style={{ display: "inline-flex", alignItems: "center", height: "100%", willChange: "transform" }}>
          {items.map((sym, i) => {
            const q = quotes[sym];
            const up = q && (q.change ?? q.changePercent ?? 0) >= 0;
            const clr = up ? "#00e676" : "#ff3d57";
            // Live provider name first (Yahoo shortName/longName); if the quote
            // hasn't loaded yet or a failover provider degraded to name===symbol
            // (common from datacenter IPs — see lib/marketData.js), fall back to
            // the curated static map rather than showing a blank/duplicate name.
            const name = (q?.name && q.name !== sym ? q.name : null) || COMPANY_NAMES[sym] || null;
            return (
              <div
                key={`${sym}-${i}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "0 24px",
                  height: "100%",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <TickerLogo symbol={sym} size={26} />
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 3, lineHeight: 1 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                    <span style={{ fontFamily: FM, fontSize: 12.5, fontWeight: 800, color: "#fff", letterSpacing: 0.5 }}>
                      {sym}
                    </span>
                    {name && (
                      <span style={{ fontFamily: FC, fontSize: 9.5, color: "#8a97a8", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 130 }}>
                        {name}
                      </span>
                    )}
                  </div>
                  {q?.price != null ? (
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontFamily: FM, fontSize: 15, fontWeight: 800, color: clr }}>
                        {Number(q.price).toFixed(2)}
                      </span>
                      {q.change != null && (
                        <span style={{ fontFamily: FM, fontSize: 10.5, fontWeight: 700, color: clr }}>
                          {q.change >= 0 ? "+" : ""}{Number(q.change).toFixed(2)}
                          {q.changePercent != null && <>&nbsp; {q.change >= 0 ? "+" : ""}{Number(q.changePercent).toFixed(2)}%</>}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontFamily: FM, fontSize: 11, color: dim }}>—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={() => setShowEdit(true)}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            padding: "0 12px",
            fontFamily: FM,
            fontSize: 8,
            color: dim,
            letterSpacing: 1,
            background: "#05070a",
            border: "none",
            borderLeft: `1px solid ${border}`,
            cursor: "pointer",
            zIndex: 2,
          }}
        >
          ✎
        </button>
      </div>
    </>
  );
}
