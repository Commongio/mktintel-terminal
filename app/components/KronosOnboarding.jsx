import { useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// KRONOS V.7 — ADDITIONS TO BotDashboard.jsx
// Copy-paste these sections into BotDashboard.jsx at the indicated locations
// ─────────────────────────────────────────────────────────────────────────────

// ─── 1. KRONOS EXECUTOR PROMPT ────────────────────────────────────────────────
// Add this constant near the top of BotDashboard.jsx (after the font constants)

const KRONOS_PROMPT = (profile) => `You are KRONOS — an autonomous trading signal executor. You are NOT an analyst. You are a precision machine that evaluates conditions and fires or holds signals based on strict rules. Cold. Calculated. Data-driven. You do not narrate. You execute.

USER RISK PROFILE:
Experience: ${profile?.experience ?? "Unknown"}
Risk Tolerance: ${profile?.riskTolerance ?? "Balanced"}
Account Size: ${profile?.accountSize ?? "Unknown"}
Platform: ${profile?.platform ?? "Webull"}
Max Daily Loss: $${profile?.maxLoss ?? "500"}

CONVICTION THRESHOLD BASED ON PROFILE:
${profile?.riskTolerance === "Conservative"
  ? "FIRE only at 75%+ conviction. No 0DTE. Max 2% account risk. Spreads preferred."
  : profile?.riskTolerance === "Aggressive"
  ? "FIRE at 55%+ conviction. 0DTE allowed. Max 5% account risk. Outright options ok."
  : profile?.riskTolerance === "Adaptive"
  ? "Read VIX: >25 use Conservative rules, 18-25 use Balanced, <18 use Aggressive."
  : "FIRE at 65%+ conviction. Weekly options preferred. Max 3% account risk."}

SIGNAL FORMAT — use for every signal evaluation:
SIGNAL ID: #[number]
DIRECTION: LONG / SHORT
INSTRUMENT: [ticker/contract]
ENTRY: [exact price or zone]
STOP: [exact invalidation level]
T1: [first take profit — partial exit]
T2: [full exit target]
CONVICTION: [0-100]%
CONFIDENCE: HIGH / MEDIUM / CAUTION / SPECULATIVE
R:R: [ratio]
TIMEFRAME: 0DTE / WEEKLY / MONTHLY
STATUS: FIRE / HOLD / ABORT / COOLDOWN

DECISION LOGIC:
FIRE — all conditions met, conviction above profile threshold
HOLD — setup forming but not yet confirmed, watch closely
ABORT — setup invalidated, do not enter under any conditions
COOLDOWN — recent loss detected, reduce size 50%, wait for A-grade setup only

STRICT RULES:
- Never recommend more than 3 open positions simultaneously
- Never exceed max daily loss limit set in profile ($${profile?.maxLoss ?? "500"})
- Always state if platform (${profile?.platform ?? "Webull"}) supports the recommended order type
- If 0DTE and profile is not Aggressive, flag the risk explicitly
- End every response with: [KRONOS] Signal processed. Not financial advice. Trade your own risk.`;

// ─── 2. ONBOARDING COMPONENT ──────────────────────────────────────────────────
// Add this component BEFORE the BotDashboard export in BotDashboard.jsx

const ONBOARDING_STEPS = [
  {
    id:      "experience",
    label:   "What's your trading experience?",
    options: ["Beginner", "Intermediate", "Advanced"],
    icon:    "📈",
  },
  {
    id:      "riskTolerance",
    label:   "What's your risk tolerance?",
    options: ["Conservative", "Balanced", "Aggressive", "Adaptive"],
    icon:    "⚖️",
    hint:    "Adaptive = Kronos reads VIX and adjusts automatically",
  },
  {
    id:      "accountSize",
    label:   "What's your account size?",
    options: ["Under $5K", "$5K – $25K", "$25K – $100K", "$100K+"],
    icon:    "💼",
  },
  {
    id:      "platform",
    label:   "What platform do you trade on?",
    options: ["Robinhood", "Webull", "Tradier", "IBKR"],
    icon:    "🖥️",
  },
  {
    id:      "maxLoss",
    label:   "Max daily loss limit ($)",
    options: null, // text input
    icon:    "🛑",
    hint:    "Kronos will not recommend trades after you hit this limit",
  },
];

// Paste this entire function BEFORE the BotDashboard export:
function KronosOnboarding({ accent, T, onComplete }) {
  const [step,    setStep]    = useState(0);
  const [profile, setProfile] = useState({});
  const [input,   setInput]   = useState("");
  const [leaving, setLeaving] = useState(false);

  const FM = "'JetBrains Mono',monospace";
  const FD = "'Fraunces',serif";
  const surface = T?.surface ?? "#0b1320";
  const border  = T?.border  ?? "#172030";
  const dim     = T?.dim     ?? "#3a4a5a";
  const text    = T?.text    ?? "#c8d8e8";

  const currentStep = ONBOARDING_STEPS[step];
  const isLast      = step === ONBOARDING_STEPS.length - 1;
  const progress    = Math.round(((step) / ONBOARDING_STEPS.length) * 100);

  const handleSelect = (value) => {
    const updated = { ...profile, [currentStep.id]: value };
    setProfile(updated);
    if (!isLast) {
      setStep(s => s + 1);
    } else {
      localStorage.setItem("kronos_profile", JSON.stringify(updated));
      onComplete(updated);
    }
  };

  const handleTextSubmit = () => {
    if (!input.trim()) return;
    handleSelect(input.trim().replace(/[^0-9]/g, ""));
    setInput("");
  };

  return (
    <div style={{
      position: "absolute", inset: 0, background: "rgba(6,9,16,0.97)",
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", zIndex: 100, fontFamily: FM,
    }}>
      <style>{`@keyframes ob-appear{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}`}</style>

      <div style={{
        width: "100%", maxWidth: 420, padding: "0 24px",
        animation: "ob-appear 0.3s ease",
      }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 800, color: text, marginBottom: 4 }}>
            KRONOS SETUP
          </div>
          <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 3 }}>
            PERSONALIZE YOUR SIGNAL ENGINE
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          height: 3, background: border, borderRadius: 2, marginBottom: 24, overflow: "hidden",
        }}>
          <div style={{
            height: "100%", width: `${progress}%`, background: accent,
            borderRadius: 2, transition: "width 0.4s ease",
          }}/>
        </div>

        {/* Step card */}
        <div style={{
          background: surface, border: `1px solid ${border}`, borderRadius: 14, padding: "24px 22px",
        }}>
          <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, marginBottom: 6 }}>
            STEP {step + 1} OF {ONBOARDING_STEPS.length}
          </div>
          <div style={{ fontFamily: FM, fontSize: 15, fontWeight: 700, color: text, marginBottom: 4 }}>
            {currentStep.icon} {currentStep.label}
          </div>
          {currentStep.hint && (
            <div style={{ fontFamily: FM, fontSize: 9, color: dim, marginBottom: 14, lineHeight: 1.5 }}>
              {currentStep.hint}
            </div>
          )}

          {/* Option buttons */}
          {currentStep.options ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
              {currentStep.options.map(opt => (
                <button key={opt} onClick={() => handleSelect(opt)} style={{
                  padding: "11px 16px", textAlign: "left",
                  background: "transparent",
                  border: `1px solid ${profile[currentStep.id] === opt ? accent + "50" : border}`,
                  borderRadius: 9, color: profile[currentStep.id] === opt ? accent : text,
                  fontFamily: FM, fontSize: 11, fontWeight: 700, letterSpacing: 1,
                  cursor: "pointer", transition: "all 0.15s",
                }}>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            // Text input for max loss
            <div style={{ marginTop: 14 }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "#060910", border: `1px solid ${border}`,
                borderRadius: 9, padding: "11px 14px", marginBottom: 10,
              }}>
                <span style={{ color: dim, fontFamily: FM, fontSize: 13 }}>$</span>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value.replace(/[^0-9]/g, ""))}
                  onKeyDown={e => e.key === "Enter" && handleTextSubmit()}
                  placeholder="e.g. 500"
                  autoFocus
                  style={{
                    flex: 1, background: "transparent", border: "none",
                    color: text, fontFamily: FM, fontSize: 15, fontWeight: 700,
                  }}
                />
              </div>
              <button onClick={handleTextSubmit} disabled={!input.trim()} style={{
                width: "100%", padding: "12px 0",
                background: input.trim() ? `${accent}12` : "transparent",
                border: `1px solid ${input.trim() ? accent + "40" : border}`,
                borderRadius: 8, color: input.trim() ? accent : dim,
                fontFamily: FM, fontSize: 11, fontWeight: 700, letterSpacing: 3,
                cursor: input.trim() ? "pointer" : "default", transition: "all 0.15s",
              }}>
                LAUNCH KRONOS
              </button>
            </div>
          )}
        </div>

        {step > 0 && (
          <button onClick={() => setStep(s => s - 1)} style={{
            marginTop: 12, background: "transparent", border: "none",
            color: dim, fontFamily: FM, fontSize: 9, cursor: "pointer", letterSpacing: 2,
          }}>
            ← BACK
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 3. BOTDASHBOARD STATE ADDITIONS ─────────────────────────────────────────
// Add these to the BotDashboard component's useState section:
//
//   const [profile, setProfile] = useState(null);
//   const [showOnboarding, setShowOnboarding] = useState(false);
//
// Add this useEffect to load saved profile:
//
//   useEffect(() => {
//     const saved = localStorage.getItem("kronos_profile");
//     if (saved) {
//       try { setProfile(JSON.parse(saved)); }
//       catch { setShowOnboarding(true); }
//     } else {
//       setShowOnboarding(true);
//     }
//   }, []);
//
// Add this inside the BotDashboard return, as the FIRST child of the outer div:
//
//   {showOnboarding && (
//     <KronosOnboarding
//       accent={accent} T={T}
//       onComplete={(p) => { setProfile(p); setShowOnboarding(false); }}
//     />
//   )}
//
// Add a profile pill in the header (after the status pill):
//
//   {profile && (
//     <div style={{
//       padding:"3px 10px", borderRadius:20, border:`1px solid ${dim}25`,
//       fontFamily:FM, fontSize:8, color:dim, cursor:"pointer",
//     }} onClick={()=>setShowOnboarding(true)}>
//       {profile.riskTolerance?.toUpperCase()} · {profile.accountSize}
//     </div>
//   )}

// ─── 4. EXPORT THESE FOR USE IN BotDashboard.jsx ─────────────────────────────
export { KronosOnboarding, KRONOS_PROMPT, ONBOARDING_STEPS };