"use client";
import { useState, useEffect } from "react";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";
const FD = "'Fraunces',serif";

// ─── PROP FIRM RULE SETS ──────────────────────────────────────────────────────
export const PROP_FIRMS = {
  topstep: {
    name: "TopStep",
    color: "#7eb8f7",
    accounts: [
      { label: "$50K Express", balance: 50000, dailyLoss: 1000, trailingDD: 2000, profitTarget: 3000, maxContracts: { NQ: 3, MNQ: 30, ES: 3, MES: 30 } },
      { label: "$100K Express", balance: 100000, dailyLoss: 2000, trailingDD: 3000, profitTarget: 6000, maxContracts: { NQ: 6, MNQ: 60, ES: 6, MES: 60 } },
      { label: "$150K Express", balance: 150000, dailyLoss: 4500, trailingDD: 9000, profitTarget: 9000, maxContracts: { NQ: 10, MNQ: 100, ES: 10, MES: 100 } },
    ],
    rules: [
      "Max daily loss includes unrealized P&L",
      "Trailing drawdown follows highest account equity",
      "No single trading day can account for more than 40% of total profit",
      "Trading allowed Sunday 5PM - Friday 4PM ET",
      "Funded accounts trade on Rithmic platform",
    ],
    instruments: ["NQ", "MNQ", "ES", "MES", "CL", "GC", "6E", "ZB"],
    platform: "Rithmic",
  },
  apex: {
    name: "Apex Trader Funding",
    color: "#ff6b35",
    accounts: [
      { label: "$25K",  balance: 25000,  dailyLoss: null, trailingDD: 1500, profitTarget: 1500,  maxContracts: { NQ: 2, ES: 2 } },
      { label: "$50K",  balance: 50000,  dailyLoss: null, trailingDD: 2500, profitTarget: 2500,  maxContracts: { NQ: 5, ES: 5 } },
      { label: "$100K", balance: 100000, dailyLoss: null, trailingDD: 3000, profitTarget: 10000, maxContracts: { NQ: 10, ES: 10 } },
      { label: "$150K", balance: 150000, dailyLoss: null, trailingDD: 5000, profitTarget: 12500, maxContracts: { NQ: 14, ES: 14 } },
      { label: "$250K", balance: 250000, dailyLoss: null, trailingDD: 6500, profitTarget: 25000, maxContracts: { NQ: 20, ES: 20 } },
    ],
    rules: [
      "No daily loss limit during evaluation phase",
      "Static trailing drawdown based on starting balance",
      "Must reach profit target while respecting trailing DD",
      "News trading allowed — no time restrictions during eval",
      "Funded via Rithmic or NinjaTrader",
    ],
    instruments: ["NQ", "MNQ", "ES", "MES", "YM", "CL", "GC"],
    platform: "Rithmic",
  },
  ftmo: {
    name: "FTMO",
    color: "#00d4aa",
    accounts: [
      { label: "$10K Challenge",  balance: 10000,  dailyLoss: 500,  trailingDD: 1000, profitTarget: 1000, maxContracts: null },
      { label: "$25K Challenge",  balance: 25000,  dailyLoss: 1250, trailingDD: 2500, profitTarget: 2500, maxContracts: null },
      { label: "$50K Challenge",  balance: 50000,  dailyLoss: 2500, trailingDD: 5000, profitTarget: 5000, maxContracts: null },
      { label: "$100K Challenge", balance: 100000, dailyLoss: 5000, trailingDD: 10000,profitTarget: 10000,maxContracts: null },
      { label: "$200K Challenge", balance: 200000, dailyLoss: 10000,trailingDD: 20000,profitTarget: 20000,maxContracts: null },
    ],
    rules: [
      "Phase 1 (Challenge): 10% profit target, 5% max daily loss, 10% max loss",
      "Phase 2 (Verification): 5% profit target, same drawdown limits",
      "Funded account: same drawdown limits, no profit target",
      "70/80% profit split (upgradeable to 90%)",
      "Trades: forex, indices, commodities, crypto, stocks",
      "No holding over weekend or major news events (optional rule)",
    ],
    instruments: ["EUR/USD", "GBP/USD", "NASDAQ", "S&P500", "GOLD", "BTC", "ETH"],
    platform: "MetaTrader 4/5",
  },
  e8: {
    name: "E8 Funding",
    color: "#a78bfa",
    accounts: [
      { label: "$25K",  balance: 25000,  dailyLoss: 1250, trailingDD: 2000, profitTarget: 2000,  maxContracts: null },
      { label: "$50K",  balance: 50000,  dailyLoss: 2500, trailingDD: 4000, profitTarget: 4000,  maxContracts: null },
      { label: "$100K", balance: 100000, dailyLoss: 5000, trailingDD: 8000, profitTarget: 8000,  maxContracts: null },
      { label: "$250K", balance: 250000, dailyLoss: 12500,trailingDD: 20000,profitTarget: 20000, maxContracts: null },
    ],
    rules: [
      "Self-healing drawdown: 3 profitable days in a row recovers some drawdown",
      "8% trailing drawdown, 5% daily loss limit",
      "No minimum trading days required",
      "Weekend holding allowed",
      "80% profit split on funded accounts",
    ],
    instruments: ["Forex", "Indices", "Commodities", "Crypto"],
    platform: "MetaTrader 4/5",
  },
  the5ers: {
    name: "The5ers",
    color: "#f7c948",
    accounts: [
      { label: "Bootcamp $100K",     balance: 100000, dailyLoss: 4000, trailingDD: 8000,  profitTarget: 8000,  maxContracts: null },
      { label: "High Stakes $100K",  balance: 100000, dailyLoss: 5000, trailingDD: 10000, profitTarget: 10000, maxContracts: null },
    ],
    rules: [
      "Immediate funding after passing evaluation — no verification phase",
      "Scaling plan: reach target → account doubles",
      "No time limit on evaluation",
      "Weekend holding allowed",
      "Consistent trader rule: no single day >50% of target",
    ],
    instruments: ["Forex", "Indices", "Metals", "Crypto"],
    platform: "MetaTrader 5",
  },
  myfundedfx: {
    name: "MyFundedFX",
    color: "#ff4d6d",
    accounts: [
      { label: "$10K",  balance: 10000,  dailyLoss: 500,  trailingDD: 500,  profitTarget: 1000, maxContracts: null },
      { label: "$25K",  balance: 25000,  dailyLoss: 1250, trailingDD: 1250, profitTarget: 2500, maxContracts: null },
      { label: "$50K",  balance: 50000,  dailyLoss: 2500, trailingDD: 2500, profitTarget: 5000, maxContracts: null },
      { label: "$100K", balance: 100000, dailyLoss: 5000, trailingDD: 5000, profitTarget: 10000,maxContracts: null },
      { label: "$200K", balance: 200000, dailyLoss: 10000,trailingDD: 10000,profitTarget: 20000,maxContracts: null },
    ],
    rules: [
      "1-phase evaluation — pass once, get funded immediately",
      "No minimum trading days",
      "Static drawdown (not trailing)",
      "80% profit split",
      "News trading allowed",
    ],
    instruments: ["Forex", "Indices", "Commodities", "Crypto"],
    platform: "MetaTrader 4/5",
  },
  lucid: {
    name: "Lucid Funded",
    color: "#00e676",
    accounts: [
      { label: "$25K",  balance: 25000,  dailyLoss: 1250, trailingDD: 2500, profitTarget: 2500,  maxContracts: null },
      { label: "$50K",  balance: 50000,  dailyLoss: 2500, trailingDD: 5000, profitTarget: 5000,  maxContracts: null },
      { label: "$100K", balance: 100000, dailyLoss: 5000, trailingDD: 10000,profitTarget: 10000, maxContracts: null },
    ],
    rules: [
      "Verify current rules at lucid-funded.com — rules subject to change",
      "Standard 5% daily loss, 10% trailing drawdown structure",
      "Profit split: 80% to trader",
      "Evaluation required before funding",
    ],
    instruments: ["Forex", "Indices", "Commodities"],
    platform: "MetaTrader 4/5",
  },
};

// ─── EVAL GAUGE ───────────────────────────────────────────────────────────────
function EvalGauge({ label, current, limit, color, invert = false }) {
  const pct = Math.min(100, Math.abs((current / limit) * 100));
  const danger = invert ? pct > 75 : pct > 75;
  const gc = danger ? "#ff4d6d" : pct > 50 ? "#f7c948" : color;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: FM, fontSize: 8, color: "#7A9AB5", letterSpacing: 1 }}>{label}</span>
        <span style={{ fontFamily: FM, fontSize: 10, fontWeight: 700, color: gc }}>
          ${Math.abs(current).toLocaleString()} / ${limit.toLocaleString()}
        </span>
      </div>
      <div style={{ height: 5, background: "#1A2535", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: `linear-gradient(90deg, ${gc}80, ${gc})`,
          borderRadius: 3,
          transition: "width 0.6s ease, background 0.3s",
          boxShadow: danger ? `0 0 8px ${gc}` : "none",
        }} />
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function PropFirmPanel({ accent, T, onFirmSelect }) {
  const bg      = T?.bg      ?? "#05080F";
  const surface = T?.surface ?? "#0A1018";
  const border  = T?.border  ?? "#1A2535";
  const text    = T?.text    ?? "#E2EDF8";
  const dim     = T?.dim     ?? "#7A9AB5";

  const [activeFirm,    setActiveFirm]    = useState(null);
  const [activeAccount, setActiveAccount] = useState(0);
  const [evalData,      setEvalData]      = useState({ dailyPnl: 0, totalPnl: 0, openTrades: 0 });
  const [expanded,      setExpanded]      = useState(false);

  // Load saved prop firm config
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kronos_propfirm");
      if (saved) {
        const { firmId, accountIdx } = JSON.parse(saved);
        setActiveFirm(firmId);
        setActiveAccount(accountIdx ?? 0);
      }
      const broker = localStorage.getItem("kronos_broker");
      if (broker) {
        const b = JSON.parse(broker);
        setEvalData({
          dailyPnl: b.portfolio?.dayPnl ?? 0,
          totalPnl: b.portfolio?.totalPnl ?? 0,
          openTrades: (b.portfolio?.positions ?? []).length,
        });
      }
    } catch {}
  }, []);

  const selectFirm = (firmId, accountIdx = 0) => {
    setActiveFirm(firmId);
    setActiveAccount(accountIdx);
    localStorage.setItem("kronos_propfirm", JSON.stringify({ firmId, accountIdx }));
    onFirmSelect?.({ firm: PROP_FIRMS[firmId], account: PROP_FIRMS[firmId].accounts[accountIdx] });
  };

  const firm    = activeFirm ? PROP_FIRMS[activeFirm] : null;
  const account = firm?.accounts[activeAccount];

  return (
    <div style={{
      background: surface, border: `1px solid ${border}`,
      borderRadius: 12, overflow: "hidden",
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 16px", cursor: "pointer",
          borderBottom: expanded ? `1px solid ${border}` : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: firm ? firm.color : "#2A3D52",
            boxShadow: firm ? `0 0 8px ${firm.color}` : "none",
          }} />
          <span style={{ fontFamily: FM, fontSize: 10, fontWeight: 700, color: text, letterSpacing: 1 }}>
            {firm ? `${firm.name} — ${account?.label}` : "PROP FIRM EVAL"}
          </span>
        </div>
        <span style={{ fontFamily: FM, fontSize: 10, color: dim }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div style={{ padding: 16 }}>

          {/* Firm Selector */}
          <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginBottom: 10 }}>
            SELECT PROP FIRM
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {Object.entries(PROP_FIRMS).map(([id, f]) => (
              <button key={id} onClick={() => selectFirm(id)} style={{
                padding: "5px 11px", borderRadius: 6, cursor: "pointer",
                fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 1,
                color: activeFirm === id ? f.color : dim,
                background: activeFirm === id ? `${f.color}12` : "transparent",
                border: `1px solid ${activeFirm === id ? f.color + "40" : border}`,
                transition: "all 0.15s",
              }}>{f.name}</button>
            ))}
          </div>

          {firm && (
            <>
              {/* Account Selector */}
              <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginBottom: 8 }}>
                ACCOUNT SIZE
              </div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 16 }}>
                {firm.accounts.map((acc, i) => (
                  <button key={i} onClick={() => selectFirm(activeFirm, i)} style={{
                    padding: "4px 10px", borderRadius: 5, cursor: "pointer",
                    fontFamily: FM, fontSize: 8, fontWeight: 700,
                    color: activeAccount === i ? firm.color : dim,
                    background: activeAccount === i ? `${firm.color}12` : "transparent",
                    border: `1px solid ${activeAccount === i ? firm.color + "35" : border}`,
                  }}>{acc.label}</button>
                ))}
              </div>

              {/* Eval Gauges */}
              {account && (
                <div style={{
                  background: bg, border: `1px solid ${border}`, borderRadius: 10,
                  padding: "12px 14px", marginBottom: 14,
                }}>
                  <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginBottom: 12 }}>
                    EVAL TRACKER — LIVE
                  </div>
                  {account.dailyLoss && (
                    <EvalGauge
                      label="DAILY LOSS USED"
                      current={Math.abs(Math.min(0, evalData.dailyPnl))}
                      limit={account.dailyLoss}
                      color={firm.color}
                      invert
                    />
                  )}
                  <EvalGauge
                    label="TRAILING DRAWDOWN USED"
                    current={Math.abs(Math.min(0, evalData.totalPnl))}
                    limit={account.trailingDD}
                    color={firm.color}
                    invert
                  />
                  <EvalGauge
                    label="PROFIT TARGET PROGRESS"
                    current={Math.max(0, evalData.totalPnl)}
                    limit={account.profitTarget}
                    color="#00e676"
                  />

                  {/* Key numbers */}
                  <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                    {account.maxContracts && Object.entries(account.maxContracts).slice(0, 4).map(([inst, max]) => (
                      <div key={inst} style={{ textAlign: "center" }}>
                        <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 1 }}>MAX {inst}</div>
                        <div style={{ fontFamily: FM, fontSize: 13, fontWeight: 800, color: firm.color }}>{max}</div>
                      </div>
                    ))}
                    {!account.maxContracts && (
                      <div style={{ fontFamily: FM, fontSize: 8, color: dim }}>
                        Platform: {firm.platform}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Rules */}
              <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginBottom: 8 }}>
                EVAL RULES
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {firm.rules.map((rule, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{
                      width: 4, height: 4, borderRadius: "50%",
                      background: firm.color, marginTop: 5, flexShrink: 0,
                    }} />
                    <span style={{ fontFamily: FC, fontSize: 10, color: dim, lineHeight: 1.5 }}>{rule}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}