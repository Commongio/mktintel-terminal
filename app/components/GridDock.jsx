"use client";
// GridDock.jsx — V9 drag-and-drop layout shell (react-grid-layout).
// Renders keyed panels on a 12-column grid. In edit mode panels get a grab
// header and resize handles; layout changes bubble up for per-user persistence.
import { useMemo, useRef, useState, useEffect } from "react";
import { GridLayout, useContainerWidth } from "react-grid-layout";
import "react-grid-layout/css/styles.css";

const FM = "'JetBrains Mono',monospace";

export const DEFAULT_TERMINAL_LAYOUT = [
  { i: "watchlist", x: 0, y: 0, w: 3, h: 12, minW: 2, minH: 4 },
  { i: "console",   x: 3, y: 0, w: 6, h: 12, minW: 3, minH: 6 },
  { i: "news",      x: 9, y: 0, w: 3, h: 12, minW: 2, minH: 4 },
];

export default function GridDock({ layout, onLayoutChange, editMode, items, accent = "#00d4aa", T, collapsed = {}, onToggleCollapse }) {
  const border = T?.border ?? "#1A2535";
  const dim = T?.dim ?? "#9DB4CC";
  const { width } = useContainerWidth();

  // ROBUSTNESS: never gate rendering on the library's internal `mounted` flag or
  // solely on its measured width. In some environments that measurement doesn't
  // complete and the WHOLE grid renders zero cards, blanking the Data page. We
  // measure our OWN outer ref (a guaranteed object ref, unlike the hook's ref
  // which may be a callback ref with no `.current`), and fall back to a sane
  // default width so the grid ALWAYS mounts — it self-corrects to the exact
  // width on the next measure. The hook's `width` is still preferred when present.
  const outerRef = useRef(null);
  const [measuredW, setMeasuredW] = useState(0);
  const effectiveWidth = width || measuredW || 800; // 800 = never-blank fallback

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const m = () => { const w = el.clientWidth; if (w > 0) setMeasuredW(w); };
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Row height derived from the dock's real rendered height so the default
  // 12-row layout fills exactly one screen (re-measured on window resize).
  // (outerRef is declared above and shared with the width measurement.)
  const [rowHeight, setRowHeight] = useState(52);
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h > 100) setRowHeight(Math.max(36, Math.floor((h - 16 - 11 * 8) / 12)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ensure every item key has a layout entry (e.g. freshly added notes).
  // Collapsed panels are forced to a 1-row header-only height (their real height
  // is preserved in the saved layout, so expanding restores it).
  const fullLayout = useMemo(() => {
    const known = new Set((layout || []).map((l) => l.i));
    const extras = Object.keys(items).filter((k) => !known.has(k))
      .map((k, idx) => ({ i: k, x: (idx * 3) % 12, y: 1000, w: 3, h: 4, minW: 2, minH: 2 }));
    return [...(layout || []), ...extras].map((l) =>
      collapsed[l.i] ? { ...l, h: 1, minH: 1, isResizable: false } : l
    );
  }, [layout, items, collapsed]);

  return (
    <div ref={outerRef} style={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex" }}>
    <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
      <style>{`
        .react-grid-item.react-grid-placeholder { background: ${accent} !important; opacity: 0.18 !important; border-radius: 12px; }
        .react-grid-item > .react-resizable-handle { z-index: 20; width: 26px !important; height: 26px !important; }
        .react-grid-item > .react-resizable-handle::after { border-color: ${accent} !important; border-width: 0 3px 3px 0 !important; width: 10px !important; height: 10px !important; }
        .react-grid-item > .react-resizable-handle-s { cursor: ns-resize; }
        .react-grid-item > .react-resizable-handle-e { cursor: ew-resize; }
      `}</style>
      {effectiveWidth > 0 && <GridLayout
        className="layout"
        width={effectiveWidth}
        layout={fullLayout}
        gridConfig={{ cols: 12, rowHeight, margin: [8, 8], containerPadding: [8, 8] }}
        dragConfig={{ enabled: editMode, handle: editMode ? ".grid-drag-handle" : undefined }}
        resizeConfig={{ enabled: editMode, handles: ["se", "s", "e"] }}
        onLayoutChange={(l) => onLayoutChange(l.map(({ i, x, y, w, h, minW, minH }) => ({ i, x, y, w, h, minW, minH })))}
      >
        {Object.entries(items).map(([key, node]) => {
          const isCollapsed = !!collapsed[key];
          return (
          <div key={key} style={{
            display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 12,
            border: `1px solid ${editMode ? `${accent}55` : border}`,
            boxShadow: editMode ? `0 0 14px ${accent}18` : "none",
            background: T?.panel ?? "#0A1018",
          }}>
            {/* header: shown in edit mode (drag handle) OR when collapsed, plus a
                collapse toggle that's always available */}
            {(editMode || isCollapsed) && (
              <div className={editMode ? "grid-drag-handle" : undefined} style={{
                padding: "4px 8px 4px 10px", cursor: editMode ? "grab" : "default", flexShrink: 0,
                background: `${accent}10`, borderBottom: isCollapsed ? "none" : `1px solid ${accent}30`,
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
              }}>
                <span style={{ fontFamily: FM, fontSize: 8, fontWeight: 700, letterSpacing: 2, color: accent }}>{editMode ? "⠿ " : ""}{key.toUpperCase()}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {editMode && !isCollapsed && <span style={{ fontFamily: FM, fontSize: 7, color: accent, opacity: 0.7 }}>DRAG · RESIZE ↘</span>}
                  {onToggleCollapse && (
                    <button onClick={(e) => { e.stopPropagation(); onToggleCollapse(key); }}
                      onMouseDown={(e) => e.stopPropagation()}
                      title={isCollapsed ? "Expand" : "Collapse"}
                      style={{ background: "transparent", border: "none", color: accent, cursor: "pointer", fontFamily: FM, fontSize: 11, padding: "0 2px" }}>
                      {isCollapsed ? "▸" : "▾"}
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* floating collapse button when NOT in edit mode and NOT collapsed */}
            {!editMode && !isCollapsed && onToggleCollapse && (
              <button onClick={() => onToggleCollapse(key)} title="Collapse panel"
                style={{ position: "absolute", top: 6, right: 8, zIndex: 15, width: 18, height: 18, borderRadius: 4, background: `${T?.panel ?? "#0A1018"}cc`, border: `1px solid ${border}`, color: dim, cursor: "pointer", fontFamily: FM, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
                ▾
              </button>
            )}
            {!isCollapsed && (
              <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
                {node}
              </div>
            )}
          </div>
          );
        })}
      </GridLayout>}
    </div>
    </div>
  );
}
