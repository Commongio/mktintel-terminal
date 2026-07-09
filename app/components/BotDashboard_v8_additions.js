export const STUDIO_TAB_V8 = ({ accent, T, profile, onEditProfile, onOpenBroker, onOpenPropFirm, brokerData }) => {
  const surface = T?.surface ?? "#0b1320";
  const border  = T?.border  ?? "#172030";
  const text    = T?.text    ?? "#c8d8e8";
  const dim     = T?.dim     ?? "#3a4a5a";

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 500 }}>
        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: dim, letterSpacing: 2, marginBottom: 10 }}>BROKER CONNECTION</div>
          {brokerData ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: "#00ff88", fontWeight: 700 }}>
                ◈ {brokerData.broker?.toUpperCase()} CONNECTED
              </span>
              <button onClick={onOpenBroker} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: accent, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                View / Manage
              </button>
            </div>
          ) : (
            <button onClick={onOpenBroker} style={{ width: "100%", padding: "10px 0", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8, cursor: "pointer" }}>
              + CONNECT BROKER ACCOUNT
            </button>
          )}
        </div>

        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: dim, letterSpacing: 2, marginBottom: 10 }}>RISK PROFILE</div>
          {profile ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: text }}>
                {profile.riskTolerance} · {profile.experience} · {profile.accountSize}
              </div>
              <button onClick={onEditProfile} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: accent, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                Edit
              </button>
            </div>
          ) : (
            <button onClick={onEditProfile} style={{ width: "100%", padding: "10px 0", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8, cursor: "pointer" }}>
              SET UP RISK PROFILE
            </button>
          )}
        </div>

        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 16px" }}>
          <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, color: dim, letterSpacing: 2, marginBottom: 10 }}>PROP FIRM / EVAL</div>
          <button onClick={onOpenPropFirm} style={{ width: "100%", padding: "10px 0", fontFamily: "'JetBrains Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: 2, color: accent, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 8, cursor: "pointer" }}>
            OPEN PROP FIRM PANEL
          </button>
        </div>
      </div>
    </div>
  );
};
