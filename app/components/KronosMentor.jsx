"use client";
// KronosMentor.jsx — V10.2 "Coming Soon" placeholder.
// Concept stored here so it's ready to build out later: an AI mentor that teaches
// new traders, guiding them from barely profitable to a hedge-fund-style trader
// over time. No mentor logic yet — this is intentionally just the concept + copy.
const FM = "'JetBrains Mono',monospace";
const FD = "'Fraunces',serif";
const FC = "'Inter',sans-serif";

export const MENTOR_CONCEPT = {
  title: "Kronos Mentor",
  tagline: "Your personal path from break-even to hedge-fund grade.",
  blurb: "A future AI mentor built into the terminal — it learns how you trade, teaches the fundamentals you're missing, and coaches you step by step: risk discipline, reading structure, managing psychology, and scaling size responsibly. The goal is to take a brand-new trader who's barely profitable and, over months, develop the habits and judgment of a hedge-fund-style operator.",
  roadmap: [
    "Personalized skill assessment from your paper + live trade history",
    "Guided lessons that adapt to your weak spots",
    "Live trade reviews — what you did well, what to fix",
    "Milestone tracking from consistent break-even → funded-account discipline",
  ],
};

export default function KronosMentor({ onClose, accent = "#00d4aa", T }) {
  const panel = T?.panel ?? "#0A1018";
  const border = T?.border ?? "#1A2535";
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#7A9AB5";
  const c = MENTOR_CONCEPT;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: "100%", maxWidth: 460, background: panel, border: `1px solid ${accent}45`, borderRadius: 18, overflow: "hidden", boxShadow: `0 0 70px ${accent}22` }}>
        <div style={{ padding: "26px 28px 10px", textAlign: "center", position: "relative" }}>
          <button onClick={onClose} style={{ position: "absolute", top: 16, right: 18, color: dim, fontSize: 18, background: "none", border: "none", cursor: "pointer" }}>✕</button>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🤖</div>
          <div style={{ fontFamily: FD, fontSize: 24, fontWeight: 800, color: text, letterSpacing: 0.5 }}>{c.title}</div>
          <div style={{ display: "inline-block", marginTop: 8, padding: "3px 12px", borderRadius: 20, background: `${accent}14`, border: `1px solid ${accent}40` }}>
            <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, letterSpacing: 2, color: accent }}>COMING SOON</span>
          </div>
        </div>
        <div style={{ padding: "12px 28px 24px" }}>
          <div style={{ fontFamily: FC, fontSize: 12, color: accent, fontStyle: "italic", textAlign: "center", marginBottom: 16 }}>{c.tagline}</div>
          <div style={{ fontFamily: FC, fontSize: 12.5, color: "#C6D4E2", lineHeight: 1.7, marginBottom: 18 }}>{c.blurb}</div>
          <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 2, fontWeight: 700, marginBottom: 10 }}>WHAT'S PLANNED</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {c.roadmap.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                <span style={{ fontFamily: FM, fontSize: 10, color: accent, marginTop: 1 }}>◆</span>
                <span style={{ fontFamily: FC, fontSize: 11.5, color: dim, lineHeight: 1.55 }}>{r}</span>
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{ width: "100%", marginTop: 20, padding: "11px 0", borderRadius: 10, background: `linear-gradient(135deg,${accent}28,${accent}12)`, border: `1px solid ${accent}50`, color: accent, fontFamily: FM, fontSize: 10, fontWeight: 800, letterSpacing: 2, cursor: "pointer" }}>
            GOT IT
          </button>
        </div>
      </div>
    </div>
  );
}
