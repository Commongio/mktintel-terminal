"use client";
import { useState, useEffect, useCallback } from "react";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

const convColor = (s) =>
  s >= 80 ? "#00e676" : s >= 60 ? "#f7c948" : s >= 40 ? "#ff6b35" : "#ff3d57";

const biasColor = (b) =>
  b === "BULLISH" ? "#00e676" : b === "BEARISH" ? "#ff3d57" : "#7A9AB5";

function SignalBadge({ label, active, color }) {
  return (
    <div style={{
      padding: "4px 8px", borderRadius: 5,
      background: active ? `${color}18` : "transparent",
      border: `1px solid ${active ? color + "40" : "#1A253588"}`,
      transition: "all 0.3s",
    }}>
      <div style={{ fontFamily: FM, fontSize: 8, fontWeight: 700, letterSpacing: 1, color: active ? color : "#2A3D52" }}>
        {label}
      </div>
    </div>
  );
}

function LevelRow({ label, price, color, dim }) {
  if (!price) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
      <span style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1 }}>{label}</span>
      <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, color }}>${Number(price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
    </div>
  );
}

export default function KronosSignalEngine({ accent, T, symbol = "NQ", interval = "15min" }) {
  const surface = T?.surface ?? "#0A1018";
  const border  = T?.border  ?? "#1A2535";
  const text    = T?.text    ?? "#E2EDF8";
  const dim     = T?.dim     ?? "#7A9AB5";

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [lastFetch, setLastFetch] = useState(null);

  const fetchSignal = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/signal-engine?symbol=${symbol}&interval=${interval}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Signal engine error");
      setData(d);
      setLastFetch(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [symbol, interval]);

  useEffect(() => {
    fetchSignal();
    // Auto-refresh every 2 minutes
    const t = setInterval(fetchSignal, 120000);
    return () => clearInterval(t);
  }, [fetchSignal]);

  const hasMSS  = data?.recentBOS?.some(b => b.type?.includes("MSS"));
  const hasBOS  = data?.recentBOS?.some(b => b.type?.includes("BOS"));
  const hasFVG  = (data?.activeFVGs?.length ?? 0) > 0;
  const hasSweep= (data?.recentSweeps?.length ?? 0) > 0;
  const hasKappa= !!data?.signal;
  const kappaHigh = data?.signal?.confidence === "HIGH";

  const bullBOS = data?.recentBOS?.some(b => b.type === "BOS_BULL");
  const bearBOS = data?.recentBOS?.some(b => b.type === "BOS_BEAR");
  const bullMSS = data?.recentBOS?.some(b => b.type === "MSS_BULL");
  const bearMSS = data?.recentBOS?.some(b => b.type === "MSS_BEAR");
  const bullFVG = data?.activeFVGs?.some(f => f.type === "BULL_FVG");
  const bearFVG = data?.activeFVGs?.some(f => f.type === "BEAR_FVG");

  return (
    <div style={{
      background: surface, border: `1px solid ${border}`,
      borderRadius: 12, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "10px 14px", borderBottom: `1px solid ${border}`,
      }}>
        <div>
          <div style={{ fontFamily: FM, fontSize: 9, fontWeight: 700, color: text, letterSpacing: 2 }}>
            KRONOS MAP — LIVE SIGNAL
          </div>
          <div style={{ fontFamily: FM, fontSize: 7, color: dim, marginTop: 2, letterSpacing: 1 }}>
            {symbol} · {interval} · {lastFetch ? lastFetch.toLocaleTimeString() : "loading..."}
          </div>
        </div>
        <button onClick={fetchSignal} disabled={loading} style={{
          fontFamily: FM, fontSize: 8, color: loading ? dim : accent,
          background: "transparent", border: `1px solid ${loading ? border : accent + "30"}`,
          borderRadius: 5, padding: "4px 9px", cursor: loading ? "default" : "pointer",
          letterSpacing: 1,
        }}>
          {loading ? "SCANNING..." : "REFRESH"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", fontFamily: FM, fontSize: 9, color: "#ff3d57" }}>
          ⚠ {error}
          {error.includes("TWELVE_DATA_API_KEY") && (
            <div style={{ marginTop: 4, color: dim, fontSize: 8 }}>
              Add TWELVE_DATA_API_KEY to .env.local — free at twelvedata.com
            </div>
          )}
        </div>
      )}

      {data && (
        <div style={{ padding: 14 }}>

          {/* Conviction + Bias */}
          <div style={{ display: "flex", gap: 12, marginBottom: 14, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1, marginBottom: 5 }}>
                SIGNAL CONVICTION
              </div>
              <div style={{ height: 6, background: "#1A2535", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${data.conviction}%`,
                  background: `linear-gradient(90deg, ${convColor(data.conviction)}60, ${convColor(data.conviction)})`,
                  borderRadius: 3, transition: "width 0.6s ease",
                  boxShadow: data.conviction >= 70 ? `0 0 8px ${convColor(data.conviction)}` : "none",
                }} />
              </div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontFamily: FM, fontSize: 20, fontWeight: 800, color: convColor(data.conviction), lineHeight: 1 }}>
                {data.conviction}%
              </div>
            </div>
          </div>

          {/* HTF + LTF Bias */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <div style={{
              flex: 1, padding: "7px 10px", borderRadius: 8,
              background: `${biasColor(data.htfBias)}10`,
              border: `1px solid ${biasColor(data.htfBias)}25`,
            }}>
              <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1, marginBottom: 3 }}>HTF STRUCTURE</div>
              <div style={{ fontFamily: FM, fontSize: 10, fontWeight: 700, color: biasColor(data.htfBias) }}>{data.htfBias}</div>
            </div>
            <div style={{
              flex: 1, padding: "7px 10px", borderRadius: 8,
              background: `${biasColor(data.bias)}10`,
              border: `1px solid ${biasColor(data.bias)}25`,
            }}>
              <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1, marginBottom: 3 }}>LTF BIAS</div>
              <div style={{ fontFamily: FM, fontSize: 10, fontWeight: 700, color: biasColor(data.bias) }}>{data.bias}</div>
            </div>
          </div>

          {/* Signal Condition Pills */}
          <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1, marginBottom: 8 }}>
            KRONOS MAP CONDITIONS
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
            <SignalBadge label="MSS BULL" active={bullMSS} color="#00e676" />
            <SignalBadge label="MSS BEAR" active={bearMSS} color="#ff3d57" />
            <SignalBadge label="BOS BULL" active={bullBOS} color="#7eb8f7" />
            <SignalBadge label="BOS BEAR" active={bearBOS} color="#ff6b35" />
            <SignalBadge label="BULL FVG" active={bullFVG} color="#00e676" />
            <SignalBadge label="BEAR FVG" active={bearFVG} color="#ff3d57" />
            <SignalBadge label="LIQ SWEEP" active={hasSweep} color="#f7c948" />
            <SignalBadge label={kappaHigh ? "KAPPA ★" : "KAPPA"} active={hasKappa} color={kappaHigh ? "#f7c948" : "#a78bfa"} />
          </div>

          {/* Active Kappa Signal */}
          {data.signal && (
            <div style={{
              padding: "10px 12px", borderRadius: 9, marginBottom: 14,
              background: data.signal.direction === "LONG" ? "rgba(0,230,118,0.07)" : "rgba(255,61,87,0.07)",
              border: `1px solid ${data.signal.direction === "LONG" ? "rgba(0,230,118,0.25)" : "rgba(255,61,87,0.25)"}`,
              borderLeft: `3px solid ${data.signal.direction === "LONG" ? "#00e676" : "#ff3d57"}`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1, marginBottom: 3 }}>
                    KAPPA SIGNAL ACTIVE
                  </div>
                  <div style={{ fontFamily: FM, fontSize: 13, fontWeight: 800, color: data.signal.direction === "LONG" ? "#00e676" : "#ff3d57" }}>
                    {data.signal.direction} {symbol}
                  </div>
                </div>
                <div style={{
                  padding: "3px 9px", borderRadius: 4,
                  fontFamily: FM, fontSize: 8, fontWeight: 700, letterSpacing: 1,
                  color: kappaHigh ? "#f7c948" : "#a78bfa",
                  background: kappaHigh ? "rgba(247,201,72,0.12)" : "rgba(167,139,250,0.12)",
                  border: `1px solid ${kappaHigh ? "rgba(247,201,72,0.3)" : "rgba(167,139,250,0.3)"}`,
                }}>
                  {data.signal.confidence}
                </div>
              </div>
            </div>
          )}

          {/* Key Levels */}
          <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1, marginBottom: 8 }}>
            KEY LEVELS
          </div>
          <div style={{
            padding: "10px 12px", borderRadius: 8, marginBottom: 12,
            background: "#05080F", border: `1px solid ${border}`,
          }}>
            <LevelRow label="CURRENT PRICE" price={data.currentPrice} color={text} dim={dim} />
            <LevelRow label="HTF SWING HIGH" price={data.keyLevels?.htfSwingHigh} color="#ff3d57" dim={dim} />
            <LevelRow label="HTF SWING LOW"  price={data.keyLevels?.htfSwingLow}  color="#00e676" dim={dim} />
            <LevelRow label="LTF SWING HIGH" price={data.keyLevels?.lastSwingHigh} color="#ff6b35" dim={dim} />
            <LevelRow label="LTF SWING LOW"  price={data.keyLevels?.lastSwingLow}  color="#7eb8f7" dim={dim} />
          </div>

          {/* Active FVGs */}
          {data.activeFVGs?.length > 0 && (
            <>
              <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1, marginBottom: 8 }}>
                ACTIVE FAIR VALUE GAPS ({data.activeFVGs.length})
              </div>
              {data.activeFVGs.slice(0, 3).map((fvg, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "5px 10px", borderRadius: 6, marginBottom: 5,
                  background: fvg.type === "BULL_FVG" ? "rgba(0,230,118,0.06)" : "rgba(255,61,87,0.06)",
                  border: `1px solid ${fvg.type === "BULL_FVG" ? "rgba(0,230,118,0.18)" : "rgba(255,61,87,0.18)"}`,
                }}>
                  <span style={{ fontFamily: FM, fontSize: 8, color: fvg.type === "BULL_FVG" ? "#00e676" : "#ff3d57", fontWeight: 700 }}>
                    {fvg.type === "BULL_FVG" ? "▲ BULL FVG" : "▼ BEAR FVG"}
                  </span>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontFamily: FM, fontSize: 8, color: dim }}>
                      ${Number(fvg.bot).toFixed(2)} – ${Number(fvg.top).toFixed(2)}
                    </div>
                    <div style={{ fontFamily: FM, fontSize: 7, color: fvg.type === "BULL_FVG" ? "#00e676" : "#ff3d57" }}>
                      mid ${Number(fvg.mid).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          <div style={{ fontFamily: FM, fontSize: 7, color: dim, marginTop: 8, opacity: 0.5 }}>
            Powered by Kronos Map · BOS/MSS + FVG + Liquidity Sweep + Kappa logic
          </div>
        </div>
      )}
    </div>
  );
}