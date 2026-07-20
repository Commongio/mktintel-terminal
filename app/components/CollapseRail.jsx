"use client";
// CollapseRail.jsx — V10.2 shared collapse chrome for side panels.
// When a panel is collapsed it renders as a thin vertical rail showing the
// panel's name (rotated) + an expand chevron, so users can reclaim screen space
// for a decluttered single-screen view while trading, then bring it back.
const FM = "'JetBrains Mono',monospace";

export function CollapseButton({ collapsed, onToggle, accent, T, title }) {
  const dim = T?.dim ?? "#9DB4CC";
  const border = T?.border ?? "#1A2535";
  return (
    <button onClick={onToggle} title={title || (collapsed ? "Expand panel" : "Collapse panel")}
      style={{
        width: 20, height: 20, flexShrink: 0, borderRadius: 5, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "transparent", border: `1px solid ${border}`, color: dim,
        fontFamily: FM, fontSize: 10, lineHeight: 1,
      }}>
      {collapsed ? "▸" : "▾"}
    </button>
  );
}

// A thin vertical rail shown in place of a collapsed side column.
export function CollapsedRail({ label, side = "left", onExpand, accent = "#00d4aa", T }) {
  const panel = T?.panel ?? "#0A1018";
  const border = T?.border ?? "#1A2535";
  const dim = T?.dim ?? "#9DB4CC";
  return (
    <div
      onClick={onExpand}
      title={`Expand ${label}`}
      style={{
        width: 30, flexShrink: 0, background: panel, cursor: "pointer",
        borderRight: side === "left" ? `1px solid ${border}` : "none",
        borderLeft: side === "right" ? `1px solid ${border}` : "none",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "space-between", padding: "10px 0",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${accent}0e`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = panel; }}
    >
      <span style={{ fontFamily: FM, fontSize: 11, color: accent }}>{side === "left" ? "▸" : "◂"}</span>
      <span style={{
        fontFamily: FM, fontSize: 9, fontWeight: 700, letterSpacing: 2, color: dim,
        writingMode: "vertical-rl", transform: side === "left" ? "rotate(180deg)" : "none",
        textTransform: "uppercase",
      }}>{label}</span>
      <span style={{ fontFamily: FM, fontSize: 9, color: dim, opacity: 0.6 }}>⊕</span>
    </div>
  );
}
