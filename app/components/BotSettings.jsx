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
  { id: "glass",   label: "Glass",    desc: "Tabs frosted; every other panel goes transparent with a faint glass edge" },
  { id: "outline", label: "Outline",  desc: "Tabs frosted + solid-ish; panels transparent with a glowing accent outline" },
  { id: "flat",    label: "Flat",     desc: "No borders, no chrome — just content" },
  { id: "neon",    label: "Neon",     desc: "Tabs frosted + solid-ish; panels transparent with a neon-glow accent outline" },
];

export const BOT_UI_DEFAULT = {
  // V10.5b: default is GLASS, not solid. "Solid" meant a brand-new user saw flat
  // square panels and no frost at all — the glass/outline/neon work was real but
  // nothing opted them into it, so it read as "the styling is missing."
  panelStyle: "glass",
  glassOpacity: 0.45,   // glass: tab frost fill · outline/neon: outline intensity
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

// ── V10.5 CORRECTED RECIPES ──────────────────────────────────────────────────
// Two different surfaces get two different treatments now — they used to share
// one recipe, which meant turning up "opacity" for a frosted tab bar also fogged
// up the signal feed / scanner / stat cards floating over the galaxy, which read
// as broken. The fix: tabs are the only thing allowed to carry real chrome.
//
//   PANEL BODY (feed/scanner columns, stat cards, conviction ladder, etc.):
//     solid  — unchanged, opaque.
//     flat   — unchanged, fully transparent, no border.
//     glass  — transparent. No accent/glow — just a faint, non-illuminated
//              "glass edge" so the panel still reads as a distinct surface.
//     outline/neon — transparent, but the BORDER illuminates in the accent
//              color, intensity driven by the opacity slider. Neon additionally
//              gets a soft glow (boxShadow) the outline style doesn't.
//
//   TAB BAR (the nav strip only):
//     solid/flat — unchanged (underline tabs).
//     glass  — frosted (blur) and MORE opaque than before — this is the one
//              place "opacity" still means "how filled-in".
//     outline/neon — frosted AND "somewhat solid" (partially filled, not just
//              a transparent line), with the same illuminating border/glow.
//
// `T` = active theme tokens, `accent` = user accent, `o` = the opacity slider
// (0.05–0.95), reused as "outline/glow intensity" for outline/neon.

// V10.5b: `radius` is part of the recipe now. Glass/Outline/Neon are explicitly
// specced as ROUNDED; solid/flat keep the flush terminal look. The docked columns
// used to hardcode `borderRadius: 0` at the call site and strip their borders,
// which silently defeated both the rounded corners AND the glass edge/glow —
// the styles were correct but invisible. Call sites must NOT override radius.
export const PANEL_RADIUS = 14;
export const isFloatingStyle = (id) => id === "glass" || id === "outline" || id === "neon";

export function botPanelStyle(ui, T, accent) {
  const surface = T?.surface ?? "#0A1018";
  const border = T?.border ?? "#1A2535";
  const o = Math.max(0.05, Math.min(0.95, ui?.glassOpacity ?? 0.45));
  const radius = isFloatingStyle(ui?.panelStyle) ? PANEL_RADIUS : 0;

  switch (ui?.panelStyle) {
    case "glass":
      return {
        background: "transparent",
        border: `1px solid ${hexA(border, 0.55)}`, // non-illuminated glass edge — never accent-colored
        borderRadius: radius,
      };
    case "outline":
      return {
        background: "transparent",
        border: `1px solid ${hexA(accent, o)}`,
        borderRadius: radius,
      };
    case "flat":
      return {
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: 0,
      };
    case "neon":
      return {
        background: "transparent",
        border: `1px solid ${hexA(accent, o)}`,
        boxShadow: `0 0 ${6 + o * 20}px ${hexA(accent, o * 0.6)}`,
        borderRadius: radius,
      };
    case "solid":
    default:
      return { background: surface, border: `1px solid ${border}`, borderRadius: 0 };
  }
}

// The nav-tab strip's own surface — the one place chrome/fill survives.
export function botTabStyle(ui, T, accent) {
  const surface = T?.surface ?? "#0A1018";
  const border = T?.border ?? "#1A2535";
  const o = Math.max(0.05, Math.min(0.95, ui?.glassOpacity ?? 0.45));
  const radius = isFloatingStyle(ui?.panelStyle) ? PANEL_RADIUS : 0;

  switch (ui?.panelStyle) {
    case "glass":
      return {
        background: hexA(surface, o),
        border: `1px solid ${hexA(border, 0.55)}`,
        backdropFilter: "blur(14px) saturate(1.2)",
        WebkitBackdropFilter: "blur(14px) saturate(1.2)",
        borderRadius: radius,
      };
    case "outline":
      return {
        background: hexA(surface, Math.max(0.35, o * 0.7)), // "somewhat solid" — never fully transparent
        border: `1px solid ${hexA(accent, o)}`,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRadius: radius,
      };
    case "flat":
      return {
        background: "transparent",
        border: "1px solid transparent",
        borderRadius: 0,
      };
    case "neon":
      return {
        background: hexA(surface, Math.max(0.35, o * 0.7)),
        border: `1px solid ${hexA(accent, o)}`,
        boxShadow: `0 0 ${6 + o * 20}px ${hexA(accent, o * 0.5)}`,
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRadius: radius,
      };
    case "solid":
    default:
      return { background: surface, border: `1px solid ${border}`, borderRadius: 0 };
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

  const usesOpacity = ui.panelStyle === "glass" || ui.panelStyle === "outline" || ui.panelStyle === "neon";
  const preview = botPanelStyle(ui, T, accent);
  const tabPreview = botTabStyle(ui, T, accent);

  const Section = ({ title, children, first }) => (
    <div style={{ marginBottom: 18, paddingTop: first ? 0 : 14, borderTop: first ? "none" : `1px solid ${border}` }}>
      <div style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2, fontWeight: 700, marginBottom: 9 }}>{title}</div>
      {children}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Shares .kronos-settings-sheet with the main settings drawer (defined in
          page.js): 310px rail on desktop, full-width sheet under 768px. */}
      <div className="kronos-settings-sheet" style={{ background: panel, borderLeft: `1px solid ${border}`, padding: 22, overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontFamily: FM, fontSize: 11, fontWeight: 700, color: accent, letterSpacing: 3 }}>⚙ KRONOS BOT</span>
          <button onClick={onClose} aria-label="Close bot settings" style={{ color: dim, fontSize: 17, cursor: "pointer", background: "none", border: "none", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>✕</button>
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
                <span style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1 }}>
                  {ui.panelStyle === "glass" ? "TAB FROST OPACITY" : "OUTLINE INTENSITY"}
                </span>
                <span style={{ fontFamily: FM, fontSize: 9, color: accent, fontWeight: 700 }}>{Math.round(ui.glassOpacity * 100)}%</span>
              </div>
              <input type="range" min={5} max={95} value={Math.round(ui.glassOpacity * 100)}
                onChange={(e) => update({ glassOpacity: Number(e.target.value) / 100 })}
                style={{ width: "100%", accentColor: accent }} />
              <div style={{ fontFamily: FC, fontSize: 8.5, color: dim, marginTop: 5, lineHeight: 1.4 }}>
                {ui.panelStyle === "glass"
                  ? "Only affects the tab bar's frosted fill — every other panel stays transparent."
                  : "Controls how bright the glowing outline is, on both the tabs and every panel's border."}
              </div>
            </div>
          )}

          {/* Live preview — TWO swatches, since tabs and panels now look different
              on purpose: tabs carry the chrome, panels stay see-through. */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontFamily: FM, fontSize: 7, color: dim, letterSpacing: 2, marginBottom: 5 }}>PREVIEW</div>
            <div style={{
              position: "relative", padding: 12, borderRadius: 10, overflow: "hidden",
              backgroundImage: `radial-gradient(circle at 30% 40%, ${accent}22, transparent 60%), radial-gradient(circle at 75% 70%, #7eb8f722, transparent 55%)`,
              backgroundColor: "#05080F",
            }}>
              <div style={{ ...tabPreview, borderRadius: 8, padding: "6px 12px", marginBottom: 8, display: "flex", gap: 10 }}>
                <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 700, letterSpacing: 1, color: accent }}>TAB</span>
                <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 700, letterSpacing: 1, color: dim }}>TAB</span>
              </div>
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
