"use client";
import { useState, useEffect, useCallback } from "react";

const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";

const BROKERS = [
  { id: "tradier",    label: "Tradier",     live: true,  desc: "Free sandbox + live API. Fully automated." },
  { id: "ibkr",       label: "IBKR",        live: true,  desc: "Requires IBKR Gateway running locally. Fully automated." },
  { id: "schwab",     label: "Schwab / ThinkorSwim", live: true, desc: "Official Schwab OAuth2 API. Register at developer.schwab.com." },
  { id: "webull",     label: "Webull",      live: false, desc: "No official public API. Manual entry for now." },
  { id: "robinhood",  label: "Robinhood",   live: false, desc: "No official public API. Manual entry for now." },
  { id: "thinkorswim",label: "ThinkorSwim", live: false, desc: "Schwab API requires developer app approval. Manual entry for now." },
];

function Field({ label, value, onChange, type = "text", placeholder, dim, border, text }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1, marginBottom: 5 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", background: "#060910", border: `1px solid ${border}`,
          borderRadius: 7, padding: "9px 11px", color: text,
          fontFamily: FM, fontSize: 12,
        }}
      />
    </div>
  );
}

function PortfolioStat({ label, value, accent, dim }) {
  return (
    <div style={{ flex: 1, minWidth: 100 }}>
      <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: FM, fontSize: 16, fontWeight: 800, color: accent }}>{value}</div>
    </div>
  );
}

export default function BrokerConnect({ accent, T, onClose }) {
  const surface = T?.surface ?? "#0b1320";
  const border  = T?.border  ?? "#172030";
  const text    = T?.text    ?? "#c8d8e8";
  const dim     = T?.dim     ?? "#3a4a5a";

  const [selectedBroker, setSelectedBroker] = useState(null);
  const [creds,          setCreds]          = useState({});
  const [connected,      setConnected]      = useState(null); // { broker, portfolio }
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState("");
  const [manual,         setManual]         = useState({ balance: "", pnl: "", margin: "", optionsBP: "" });

  // Load saved connection on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("kronos_broker");
      if (saved) setConnected(JSON.parse(saved));
    } catch {}
  }, []);

  const connectTradier = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/broker/tradier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: creds.token, accountId: creds.accountId, sandbox: creds.sandbox !== "false" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Connection failed");
      const result = { broker: "tradier", portfolio: d, connectedAt: Date.now() };
      setConnected(result);
      localStorage.setItem("kronos_broker", JSON.stringify(result));
      // Save creds separately so we can refresh later (NOT secure for production — local dev only)
      localStorage.setItem("kronos_broker_creds", JSON.stringify({ broker: "tradier", ...creds }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [creds]);

  const connectIBKR = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/broker/ibkr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayUrl: creds.gatewayUrl || "https://localhost:5000/v1/api" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Connection failed — is IBKR Gateway running?");
      const result = { broker: "ibkr", portfolio: d, connectedAt: Date.now() };
      setConnected(result);
      localStorage.setItem("kronos_broker", JSON.stringify(result));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [creds]);

  const saveManual = useCallback(() => {
    const result = {
      broker: selectedBroker, manual: true,
      portfolio: {
        balance: Number(manual.balance) || 0,
        dayPnl:  Number(manual.pnl) || 0,
        margin:  Number(manual.margin) || 0,
        optionsBP: Number(manual.optionsBP) || 0,
      },
      connectedAt: Date.now(),
    };
    setConnected(result);
    localStorage.setItem("kronos_broker", JSON.stringify(result));
  }, [selectedBroker, manual]);

  const disconnect = () => {
    localStorage.removeItem("kronos_broker");
    localStorage.removeItem("kronos_broker_creds");
    setConnected(null);
    setSelectedBroker(null);
  };

  const refreshTradier = useCallback(async () => {
    setLoading(true);
    try {
      const saved = JSON.parse(localStorage.getItem("kronos_broker_creds") || "{}");
      const r = await fetch("/api/broker/tradier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: saved.token, accountId: saved.accountId, sandbox: saved.sandbox !== "false" }),
      });
      const d = await r.json();
      if (r.ok) {
        const result = { broker: "tradier", portfolio: d, connectedAt: Date.now() };
        setConnected(result);
        localStorage.setItem("kronos_broker", JSON.stringify(result));
      }
    } catch {} finally { setLoading(false); }
  }, []);

  // ── CONNECTED VIEW ──────────────────────────────────────────────────────────
  if (connected) {
    const p = connected.portfolio || {};
    const brokerLabel = BROKERS.find(b => b.id === connected.broker)?.label || connected.broker;
    return (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{
          width: 420, background: T?.panel ?? surface, border: `1px solid ${accent}35`,
          borderRadius: 16, padding: 24, boxShadow: `0 0 50px ${accent}18`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: FD, fontSize: 17, fontWeight: 700, color: text }}>Portfolio</div>
              <div style={{ fontFamily: FM, fontSize: 9, color: accent, marginTop: 2 }}>
                ◈ CONNECTED — {brokerLabel.toUpperCase()} {connected.manual ? "(MANUAL)" : ""}
              </div>
            </div>
            <button onClick={onClose} style={{ color: dim, fontSize: 18, cursor: "pointer", background: "none", border: "none" }}>✕</button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 16, padding: "14px 16px", background: "#060910", borderRadius: 10, border: `1px solid ${border}` }}>
            <PortfolioStat label="ACCOUNT BALANCE" value={p.balance != null ? `$${Number(p.balance).toLocaleString(undefined,{maximumFractionDigits:0})}` : "—"} accent={text} dim={dim} />
            <PortfolioStat label="DAY P&L" value={p.dayPnl != null ? `${p.dayPnl >= 0 ? "+" : ""}$${Number(p.dayPnl).toLocaleString(undefined,{maximumFractionDigits:0})}` : "—"} accent={p.dayPnl >= 0 ? "#00ff88" : "#ff4d6d"} dim={dim} />
            <PortfolioStat label="MARGIN USED" value={p.margin != null ? `$${Number(p.margin).toLocaleString(undefined,{maximumFractionDigits:0})}` : "—"} accent={text} dim={dim} />
            <PortfolioStat label="OPTIONS BP" value={p.optionsBP != null ? `$${Number(p.optionsBP).toLocaleString(undefined,{maximumFractionDigits:0})}` : "—"} accent={text} dim={dim} />
          </div>

          {p.positions && p.positions.length > 0 && (
            <div style={{ marginBottom: 16, maxHeight: 160, overflowY: "auto" }}>
              <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginBottom: 6 }}>OPEN POSITIONS</div>
              {p.positions.map((pos, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${border}` }}>
                  <span style={{ fontFamily: FM, fontSize: 11, color: text, fontWeight: 700 }}>{pos.symbol}</span>
                  <span style={{ fontFamily: FM, fontSize: 11, color: dim }}>{pos.quantity} @ ${pos.costBasis}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            {!connected.manual && connected.broker === "tradier" && (
              <button onClick={refreshTradier} disabled={loading} style={{
                flex: 1, padding: "10px 0", fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 2,
                color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8, cursor: "pointer",
              }}>
                {loading ? "REFRESHING..." : "REFRESH"}
              </button>
            )}
            <button onClick={disconnect} style={{
              flex: 1, padding: "10px 0", fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 2,
              color: "#ff4d6d", background: "rgba(255,77,109,0.08)", border: "1px solid rgba(255,77,109,0.25)", borderRadius: 8, cursor: "pointer",
            }}>
              DISCONNECT
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── BROKER SELECTION / CONNECTION FORM ─────────────────────────────────────
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 2000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: 420, maxHeight: "86vh", overflowY: "auto",
        background: T?.panel ?? surface, border: `1px solid ${accent}35`,
        borderRadius: 16, padding: 24, boxShadow: `0 0 50px ${accent}18`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontFamily: FD, fontSize: 17, fontWeight: 700, color: text }}>Connect Broker</div>
          <button onClick={onClose} style={{ color: dim, fontSize: 18, cursor: "pointer", background: "none", border: "none" }}>✕</button>
        </div>

        {!selectedBroker ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {BROKERS.map(b => (
              <button key={b.id} onClick={() => setSelectedBroker(b.id)} style={{
                textAlign: "left", padding: "12px 14px", borderRadius: 10,
                background: "transparent", border: `1px solid ${border}`,
                cursor: "pointer", transition: "all 0.15s",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, color: text }}>{b.label}</span>
                  <span style={{
                    fontFamily: FM, fontSize: 7, fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                    color: b.live ? "#00ff88" : "#f7c948",
                    background: b.live ? "rgba(0,255,136,0.1)" : "rgba(247,201,72,0.1)",
                  }}>
                    {b.live ? "AUTOMATED" : "MANUAL"}
                  </span>
                </div>
                <div style={{ fontFamily: FM, fontSize: 9, color: dim, marginTop: 4 }}>{b.desc}</div>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <button onClick={() => { setSelectedBroker(null); setError(""); }} style={{
              fontFamily: FM, fontSize: 9, color: dim, background: "none", border: "none", cursor: "pointer", marginBottom: 14,
            }}>← Back</button>

            {selectedBroker === "tradier" && (
              <>
                <Field label="API ACCESS TOKEN" value={creds.token || ""} onChange={v => setCreds(c => ({...c, token: v}))} placeholder="Your Tradier API token" dim={dim} border={border} text={text} />
                <Field label="ACCOUNT ID" value={creds.accountId || ""} onChange={v => setCreds(c => ({...c, accountId: v}))} placeholder="e.g. VA00000000" dim={dim} border={border} text={text} />
                <div style={{ fontFamily: FM, fontSize: 8, color: dim, marginBottom: 12, lineHeight: 1.6 }}>
                  Get a free sandbox token at developer.tradier.com — no funding required for sandbox testing.
                </div>
                {error && <div style={{ fontFamily: FM, fontSize: 9, color: "#ff4d6d", marginBottom: 10 }}>⚠ {error}</div>}
                <button onClick={connectTradier} disabled={loading || !creds.token || !creds.accountId} style={{
                  width: "100%", padding: "11px 0", fontFamily: FM, fontSize: 11, fontWeight: 700, letterSpacing: 2,
                  color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8,
                  cursor: loading ? "default" : "pointer",
                }}>
                  {loading ? "CONNECTING..." : "CONNECT TRADIER"}
                </button>
              </>
            )}

            {selectedBroker === "ibkr" && (
              <>
                <Field label="GATEWAY URL" value={creds.gatewayUrl || ""} onChange={v => setCreds(c => ({...c, gatewayUrl: v}))} placeholder="https://localhost:5000/v1/api" dim={dim} border={border} text={text} />
                <div style={{ fontFamily: FM, fontSize: 8, color: dim, marginBottom: 12, lineHeight: 1.6 }}>
                  Requires IBKR Client Portal Gateway running locally and you logged in via its web login page first.
                </div>
                {error && <div style={{ fontFamily: FM, fontSize: 9, color: "#ff4d6d", marginBottom: 10 }}>⚠ {error}</div>}
                <button onClick={connectIBKR} disabled={loading} style={{
                  width: "100%", padding: "11px 0", fontFamily: FM, fontSize: 11, fontWeight: 700, letterSpacing: 2,
                  color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8,
                  cursor: loading ? "default" : "pointer",
                }}>
                  {loading ? "CONNECTING..." : "CONNECT IBKR"}
                </button>
              </>
            )}

            {selectedBroker === "schwab" && (
              <>
                <Field label="SCHWAB CLIENT ID" value={creds.clientId || ""} onChange={v => setCreds(c => ({...c, clientId: v}))} placeholder="Your Schwab Client ID" dim={dim} border={border} text={text} />
                <Field label="SCHWAB CLIENT SECRET" value={creds.clientSecret || ""} onChange={v => setCreds(c => ({...c, clientSecret: v}))} placeholder="Your Schwab Client Secret (optional)" dim={dim} border={border} text={text} />
                <Field label="REDIRECT URI" value={creds.redirectUri || "https://localhost:3000/auth/schwab/callback"} onChange={v => setCreds(c => ({...c, redirectUri: v}))} placeholder="https://yourapp.com/callback" dim={dim} border={border} text={text} />
                <div style={{ fontFamily: FM, fontSize: 8, color: dim, marginBottom: 12, lineHeight: 1.6 }}>
                  Schwab uses OAuth2. Register an app at developer.schwab.com and set the redirect URI. This will open the Schwab consent page to authorize Kronos.
                </div>
                {error && <div style={{ fontFamily: FM, fontSize: 9, color: "#ff4d6d", marginBottom: 10 }}>⚠ {error}</div>}
                <button onClick={async () => {
                  setLoading(true); setError("");
                  try {
                    const r = await fetch('/api/broker/schwab/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: creds.clientId, redirectUri: creds.redirectUri }) });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.error || 'Failed to start Schwab OAuth');
                    // open auth URL
                    window.open(d.authUrl, '_blank');
                    localStorage.setItem('kronos_broker_creds', JSON.stringify({ broker: 'schwab', clientId: creds.clientId }));
                  } catch (e) { setError(e.message); }
                  finally { setLoading(false); }
                }} disabled={loading || !creds.clientId} style={{
                  width: "100%", padding: "11px 0", fontFamily: FM, fontSize: 11, fontWeight: 700, letterSpacing: 2,
                  color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8, cursor: loading ? 'default' : 'pointer'
                }}>
                  {loading ? 'STARTING...' : 'CONNECT SCHWAB (OAUTH)'}
                </button>
              </>
            )}

            {["webull", "robinhood", "thinkorswim"].includes(selectedBroker) && (
              <>
                <div style={{ fontFamily: FM, fontSize: 8, color: "#f7c948", marginBottom: 14, lineHeight: 1.6, background: "rgba(247,201,72,0.06)", border: "1px solid rgba(247,201,72,0.2)", borderRadius: 8, padding: "10px 12px" }}>
                  {BROKERS.find(b => b.id === selectedBroker)?.label} doesn't offer a public retail API yet. Enter your numbers manually — Kronos will use them for context until automated sync is available.
                </div>
                <Field label="ACCOUNT BALANCE ($)" value={manual.balance} onChange={v => setManual(m => ({...m, balance: v.replace(/[^0-9.]/g,"")}))} placeholder="10000" dim={dim} border={border} text={text} />
                <Field label="TODAY'S P&L ($)" value={manual.pnl} onChange={v => setManual(m => ({...m, pnl: v.replace(/[^0-9.-]/g,"")}))} placeholder="150" dim={dim} border={border} text={text} />
                <Field label="MARGIN USED ($)" value={manual.margin} onChange={v => setManual(m => ({...m, margin: v.replace(/[^0-9.]/g,"")}))} placeholder="0" dim={dim} border={border} text={text} />
                <Field label="OPTIONS BUYING POWER ($)" value={manual.optionsBP} onChange={v => setManual(m => ({...m, optionsBP: v.replace(/[^0-9.]/g,"")}))} placeholder="5000" dim={dim} border={border} text={text} />
                <button onClick={saveManual} disabled={!manual.balance} style={{
                  width: "100%", padding: "11px 0", marginTop: 4, fontFamily: FM, fontSize: 11, fontWeight: 700, letterSpacing: 2,
                  color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8, cursor: "pointer",
                }}>
                  SAVE PORTFOLIO INFO
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}