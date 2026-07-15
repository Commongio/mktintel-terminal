"use client";
// BotSettings.jsx — V10.5. The Kronos bot page owns its OWN look.
//
// Why this is separate from the terminal's SettingsPanel: opening settings on the
// bot page used to show watchlist widths, chat-box styling, terminal themes — none
// of which affect anything you can see from the bot. Settings you can't observe are
// just noise. So the gear is now scope-aware: bot page → these settings only.
//
// Everything here is persisted under its own key (`kronos_bot_ui`) and never
// touches the terminal's personalization.

import { useState, useEffect, useCallback } from "react";

const FM = "'JetBrains Mono',monospace";
const FC = "'Inter',sans-serif";

export const BOT_UI_KEY = "kronos_bot_ui";

// ── PANEL STYLES ──────────────────────────────────────────────────────────────
// Each style is a recipe, not a fixed colour — it's resolved against the active
// theme + accent at render time (see botPanelStyle below), so it works on any
// backdrop the user picks.
export const PANEL_STYLES = [
  { id: "solid",   label: "Solid",    desc: "Plain opaque panels — maximum readability" },
  { id: "glass",   label: "Glass",    desc: "Frosted translucent panels, blurred backdrop" },
  { id: "outline", label: "Outline",  desc: "Transparent with a crisp accent border" },
  { id: "flat",    label: "Flat",     desc: "No borders, no chrome — just content" },
  { id: "neon",    label: "Neon",     desc: "Dark panels with a glowing accent edge" },
];

export const BOT_UI_DEFAULT = {
  panelStyle: "solid",
  glassOpacity: 0.45,   // used by glass/neon
  fontScale: 1,         // 0.85 – 1.3, bot-page text size
  showGrid: true,       // the faint grid behind the orb
};

export function loadBotUI() {
  try {
    const raw = JSON.parse(localStorage.getItem(BOT_UI_KEY) || "null");
    return { ...BOT_UI_DEFAULT, ...(raw || {}) };
  } catch { return { ...BOT_UI_DEFAULT }; }
}
export function saveBotUI(ui) {
  try { localStorage.setItem(BOT_UI_KEY, JSON.stringify(ui)); } catch {}
  // Let an already-mounted BotDashboard react without a reload.
  try { window.dispatchEvent(new CustomEvent("kronos-bot-ui-change", { detail: ui })); } catch {}
}

// Live-updating hook used by the bot dashboard.
export function useBotUI() {
  const [ui, setUI] = useState(BOT_UI_DEFAULT);
  useEffect(() => {
    setUI(loadBotUI());
    const on = (e) => setUI(e.detail || loadBotUI());
    window.addEventListener("kronos-bot-ui-change", on);
    return () => window.removeEventListener("kronos-bot-ui-change", on);
  }, []);
  return ui;
}

// Resolve a panel style into real CSS for a surface.
// `T` = active theme tokens, `accent` = user accent.
export function botPanelStyle(ui, T, accent) {
  const surface = T?.surface ?? "#0A1018";
  const border = T?.border ?? "#1A2535";
  const o = Math.max(0.05, Math.min(0.95, ui?.glassOpacity ?? 0.45));

  switch (ui?.panelStyle) {
    case "glass":
      return {
        background: hexA(surface, o),
        border: `1px solid ${hexA(accent, 0.18)}`,
        backdropFilter: "blur(14px) saturate(1.2)",
        WebkitBackdropFilter: "blur(14px) saturate(1.2)",
      };
    case "outline":
      return {
        background: "transparent",
        border: `1px solid ${hexA(accent, 0.35)}`,
      };
    case "flat":
      return {
        background: "transparent",
        border: "1px solid transparent",
      };
    case "neon":
      return {
        background: hexA(surface, Math.max(o, 0.6)),
        border: `1px solid ${hexA(accent, 0.55)}`,
        boxShadow: `0 0 14px ${hexA(accent, 0.18)}, inset 0 0 22px ${hexA(accent, 0.06)}`,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      };
    case "solid":
    default:
      return { background: surface, border: `1px solid ${border}` };
  }
}

// #rrggbb + alpha → rgba(). Tolerates a bad value rather than emitting "NaN".
function hexA(hex, a) {
  const h = String(hex || "").replace("#", "");
  if (h.length !== 6) return `rgba(10,16,24,${a})`;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return `rgba(10,16,24,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ── the panel ─────────────────────────────────────────────────────────────────
export default function BotSettings({ onClose, T, accent }) {
  const panel = T?.panel ?? "#0A1018";
  const surface = T?.surface ?? "#0A1018";
  const border = T?.border ?? "#1A2535";
  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#7A9AB5";

  const [ui, setUI] = useState(BOT_UI_DEFAULT);
  useEffect(() => { setUI(loadBotUI()); }, []);

  const update = useCallback((patch) => {
    setUI((prev) => { const next = { ...prev, ...patch }; saveBotUI(next); return next; });
  }, []);

  const usesOpacity = ui.panelStyle === "glass" || ui.panelStyle === "neon";
  const preview = botPanelStyle(ui, T, accent);

  const Section = ({ title, children, first }) => (
    <div style={{ marginBottom: 18, paddingTop: first ? 0 : 14, borderTop: first ? "none" : `1px solid ${border}` }}>
      <div style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, fontWeight: 700, marginBottom: 9 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 310, height: "100vh", background: panel, borderLeft: `1px solid ${border}`, padding: 22, overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 3 }}>⚙ KRONOS BOT</span>
          <button onClick={onClose} style={{ color: dim, fontSize: 17, cursor: "pointer", background: "none", border: "none" }}>✕</button>
        </div>
        <div style={{ fontFamily: FC, fontSize: 10, color: dim, lineHeight: 1.5, marginBottom: 18 }}>
          These settings only affect the bot page. Terminal appearance lives in the terminal's own settings.
        </div>

        <Section title="PANEL STYLE" first>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {PANEL_STYLES.map((s) => (
              <button key={s.id} onClick={() => update({ panelStyle: s.id })} style={{
                display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start",
                padding: "8px 11px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                color: ui.panelStyle === s.id ? accent : dim,
                background: ui.panelStyle === s.id ? `${accent}10` : "transparent",
                border: `1px solid ${ui.panelStyle === s.id ? `${accent}35` : border}`,
                transition: "all 0.15s",
              }}>
                <span style={{ fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>{s.label}</span>
                <span style={{ fontFamily: FC, fontSize: 8.5, color: dim, lineHeight: 1.35 }}>{s.desc}</span>
              </button>
            ))}
          </div>

          {usesOpacity && (
            <div style={{ marginTop: 11 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1 }}>PANEL OPACITY</span>
                <span style={{ fontFamily: FM, fontSize: 9, color: accent, fontWeight: 700 }}>{Math.round(ui.glassOpacity * 100)}%</span>
              </div>
              <input type="range" min={5} max={95} value={Math.round(ui.glassOpacity * 100)}
                onChange={(e) => update({ glassOpacity: Number(e.target.value) / 100 })}
                style={{ width: "100%", accentColor: accent }} />
            </div>
          )}

          {/* Live preview — so the choice is obvious without closing the panel. */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 2, marginBottom: 5 }}>PREVIEW</div>
            <div style={{
              position: "relative", padding: 12, borderRadius: 10, overflow: "hidden",
              backgroundImage: `radial-gradient(circle at 30% 40%, ${accent}22, transparent 60%), radial-gradient(circle at 75% 70%, #7eb8f722, transparent 55%)`,
              backgroundColor: "#05080F",
            }}>
              <div style={{ ...preview, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1.5, marginBottom: 4 }}>SIGNAL STATUS</div>
                <div style={{ fontFamily: FM, fontSize: 13, fontWeight: 800, color: text }}>⚡ FIRE — LONG</div>
              </div>
            </div>
          </div>
        </Section>

        <Section title="TEXT SIZE">
          <div style={{ display: "flex", gap: 6 }}>
            {[{ l: "S", v: 0.85 }, { l: "M", v: 1 }, { l: "L", v: 1.15 }, { l: "XL", v: 1.3 }].map(({ l, v }) => (
              <button key={l} onClick={() => update({ fontScale: v })} style={{
                flex: 1, padding: "7px 0", borderRadius: 7, cursor: "pointer",
                fontFamily: FM, fontSize: 10, fontWeight: 700,
                color: ui.fontScale === v ? accent : dim,
                background: ui.fontScale === v ? `${accent}12` : "transparent",
                border: `1px solid ${ui.fontScale === v ? `${accent}40` : border}`,
              }}>{l}</button>
            ))}
          </div>
          <div style={{ fontFamily: FC, fontSize: 9, color: dim, marginTop: 7, lineHeight: 1.5 }}>
            Scales all text on the bot page only — the terminal keeps its own size.
          </div>
        </Section>

        <Section title="BACKDROP">
          <button onClick={() => update({ showGrid: !ui.showGrid })} style={{
            width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "9px 12px", borderRadius: 8, cursor: "pointer",
            background: ui.showGrid ? `${accent}10` : "transparent",
            border: `1px solid ${ui.showGrid ? `${accent}30` : border}`,
          }}>
            <span style={{ fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 1, color: ui.showGrid ? accent : dim }}>GRID OVERLAY</span>
            <span style={{ fontFamily: FM, fontSize: 9, color: ui.showGrid ? accent : dim }}>{ui.showGrid ? "ON" : "OFF"}</span>
          </button>
        </Section>

        <button onClick={() => { const d = { ...BOT_UI_DEFAULT }; setUI(d); saveBotUI(d); }}
          style={{ width: "100%", padding: "9px", borderRadius: 7, background: "transparent", border: `1px solid ${border}`, color: dim, fontFamily: FM, fontSize: 10, fontWeight: 700, letterSpacing: 1, cursor: "pointer" }}>
          RESET BOT APPEARANCE
        </button>
      </div>
    </div>
  );
}
