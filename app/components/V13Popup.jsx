"use client";
// V13Popup.jsx — one-time "what's new" popup for the V13 update.
// Content is dev-editable without a redeploy (Settings brain_config.v13_popup_content,
// via /admin → Brain Access) — this component just renders whatever it's given,
// falling back to a sensible default so the popup isn't blank before Gio edits it.
const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

const DEFAULT_CONTENT = {
  title: "What's New in V13",
  bullets: [
    "Mode switcher (top-right): Chatty AI vs Command Palette — instant, no reload",
    "SPX and major index options now get a guaranteed scan slot every run",
    "Futures scanning keeps running around the clock — the header now shows the real Globex session",
    "Signal Info now shows an exact timestamp in your own local timezone",
    "Chat: scroll-to-bottom button, delete history, and an auto-delete schedule (Settings → Personal)",
  ],
  links: [],
};

export default function V13Popup({ content, onClose, accent, T }) {
  const c = content && (content.title || content.bullets?.length) ? content : DEFAULT_CONTENT;
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={{ width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto", background: T.panel, border: `1px solid ${accent}45`, borderRadius: 18, boxShadow: `0 0 80px ${accent}20, 0 0 200px rgba(0,0,0,0.8)`, padding: "24px 28px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <span style={{ fontFamily: FM, fontSize: 9, fontWeight: 800, color: accent, letterSpacing: 3 }}>✦ V13 UPDATE</span>
          <button onClick={onClose} aria-label="Close" style={{ color: T.dim, fontSize: 16, cursor: "pointer", background: "none", border: "none" }}>✕</button>
        </div>
        <div style={{ fontFamily: "'Fraunces',serif", fontSize: 20, fontWeight: 700, color: T.text, marginBottom: 16 }}>{c.title}</div>
        <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10, marginBottom: c.links?.length ? 16 : 22 }}>
          {(c.bullets || []).map((b, i) => (
            <li key={i} style={{ display: "flex", gap: 9, fontFamily: FC, fontSize: 13, lineHeight: 1.55, color: T.textDim || T.dim }}>
              <span style={{ color: accent, flexShrink: 0 }}>•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        {c.links?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 22 }}>
            {c.links.map((l, i) => (
              <a key={i} href={l.url || l.href || "#"} target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: FM, fontSize: 10, color: accent, letterSpacing: 0.5 }}>
                {l.label || l.url || l.href} ↗
              </a>
            ))}
          </div>
        )}
        <button onClick={onClose}
          style={{ width: "100%", padding: "12px 0", background: `linear-gradient(135deg,${accent}28,${accent}12)`, border: `1px solid ${accent}50`, borderRadius: 10, color: accent, fontFamily: FM, fontSize: 11, fontWeight: 700, letterSpacing: 2, cursor: "pointer" }}>
          GOT IT
        </button>
      </div>
    </div>
  );
}
