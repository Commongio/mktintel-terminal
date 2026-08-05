"use client";
// Icons.jsx — V13.8 unified line-icon set.
//
// One consistent visual language across the whole terminal: monochromatic,
// stroke-based (never emoji), 24×24 grid, uniform 1.8 stroke, round caps/joins.
// Every icon draws with `currentColor`, so it inherits whatever color its
// context sets — which is how icons automatically defer to the single brand
// accent (or dim, or a semantic color) instead of each carrying its own hue.
//
// Usage: <Icon name="chart" size={16} />  — or import a specific glyph.

const S = ({ size = 16, children, viewBox = "0 0 24 24" }) => (
  <svg width={size} height={size} viewBox={viewBox} fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" style={{ display: "block", flexShrink: 0 }}>
    {children}
  </svg>
);

// ── glyph definitions (paths only; the wrapper supplies stroke/size) ──────────
export const GLYPHS = {
  // Primary destinations
  desk: (s) => <S {...s}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 20h8M12 17v3" /></S>,
  chart: (s) => <S {...s}><path d="M4 19V5M4 19h16" /><path d="M8 15l3-4 3 2 4-6" /></S>,
  news: (s) => <S {...s}><path d="M4 5h13v14H5a1 1 0 0 1-1-1V5z" /><path d="M17 8h3v9a2 2 0 0 1-2 2" /><path d="M7 9h7M7 12h7M7 15h4" /></S>,
  data: (s) => <S {...s}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></S>,
  overview: (s) => <S {...s}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></S>,
  bot: (s) => <S {...s}><rect x="4" y="8" width="16" height="11" rx="2.5" /><path d="M12 8V4M9 4h6" /><circle cx="9" cy="13" r="1" /><circle cx="15" cy="13" r="1" /></S>,
  list: (s) => <S {...s}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></S>,
  more: (s) => <S {...s}><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></S>,
  menu: (s) => <S {...s}><path d="M4 6h16M4 12h16M4 18h16" /></S>,

  // Quick actions
  discovery: (s) => <S {...s}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></S>,
  whale: (s) => <S {...s}><path d="M3 15c3 0 3-3 6-3s3 3 6 3 3-3 6-3" /><path d="M3 19c3 0 3-3 6-3s3 3 6 3 3-3 6-3" /></S>,
  analysis: (s) => <S {...s}><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7" y="12" width="3" height="5" /><rect x="12" y="8" width="3" height="9" /><rect x="17" y="5" width="3" height="12" /></S>,
  bolt: (s) => <S {...s}><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" /></S>,

  // Controls / actions
  gear: (s) => <S {...s}><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></S>,
  message: (s) => <S {...s}><path d="M4 5h16v11H9l-4 3v-3H4V5z" /></S>,
  bell: (s) => <S {...s}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></S>,
  trash: (s) => <S {...s}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12" /></S>,
  edit: (s) => <S {...s}><path d="M4 20h4l10-10-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></S>,
  external: (s) => <S {...s}><path d="M14 4h6v6M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></S>,
  compass: (s) => <S {...s}><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" /></S>,
  star: (s) => <S {...s}><path d="M12 3l2.6 5.5L20 9.3l-4 4 1 5.7-5-2.8-5 2.8 1-5.7-4-4 5.4-.8L12 3z" /></S>,
  refresh: (s) => <S {...s}><path d="M20 11a8 8 0 1 0-.9 4.7" /><path d="M20 5v6h-6" /></S>,
  close: (s) => <S {...s}><path d="M6 6l12 12M18 6L6 18" /></S>,
  send: (s) => <S {...s}><path d="M4 12l16-8-6 16-3-6-7-2z" /></S>,

  // ── added to retire the emoji ────────────────────────────────────────────
  // Every glyph below replaced a literal emoji character. Emoji are a font, not
  // artwork: they render differently on every OS, carry their own colour that
  // ignores the surrounding context, and sit on a baseline that never quite
  // aligns with adjacent text. These inherit currentColor and the 1.8 stroke
  // like the rest of the set, so a row of them reads as one typeface.
  warning: (s) => <S {...s}><path d="M12 4.5L21 19H3L12 4.5z" /><path d="M12 10v4M12 17h.01" /></S>,
  check: (s) => <S {...s}><path d="M4 12.5l5 5L20 6.5" /></S>,
  calendar: (s) => <S {...s}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></S>,
  idea: (s) => <S {...s}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z" /></S>,
  target: (s) => <S {...s}><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></S>,
  rocket: (s) => <S {...s}><path d="M12 3c3.5 2 5.5 5.5 5.5 9.5L12 18l-5.5-5.5C6.5 8.5 8.5 5 12 3z" /><circle cx="12" cy="10" r="1.8" /><path d="M8.5 16.5L6 21l4.5-2M15.5 16.5L18 21l-4.5-2" /></S>,
  bank: (s) => <S {...s}><path d="M3 10l9-6 9 6" /><path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18" /></S>,
  briefcase: (s) => <S {...s}><rect x="3" y="7.5" width="18" height="12" rx="2" /><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M3 13h18" /></S>,
  halt: (s) => <S {...s}><circle cx="12" cy="12" r="8.5" /><path d="M8.5 8.5l7 7" /></S>,
  scales: (s) => <S {...s}><path d="M12 4v16M7 20h10M12 7l-6 2M12 7l6 2" /><path d="M3 15a3 3 0 0 0 6 0l-3-6-3 6zM15 17a3 3 0 0 0 6 0l-3-6-3 6z" /></S>,
  monitor: (s) => <S {...s}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M9 20h6M12 16v4" /></S>,
  note: (s) => <S {...s}><path d="M5 4h9l5 5v11H5z" /><path d="M14 4v5h5M8 13h8M8 16.5h5" /></S>,
  lock: (s) => <S {...s}><rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></S>,
  unlock: (s) => <S {...s}><rect x="4.5" y="10" width="15" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-1.9" /></S>,
  search: (s) => <S {...s}><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.5-4.5" /></S>,
  clipboard: (s) => <S {...s}><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V3.5h6V5M9 11h6M9 15h4" /></S>,
  user: (s) => <S {...s}><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></S>,
  film: (s) => <S {...s}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 9h18M3 15h18M8 5v14M16 5v14" /></S>,
  // Not a galaxy. The orb is decorative; where an emoji labelled a *view* of it,
  // the honest icon is the thing it opens.
  orbit: (s) => <S {...s}><circle cx="12" cy="12" r="3" /><ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-20 12 12)" /></S>,
  sparkle: (s) => <S {...s}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" /></S>,
};

export default function Icon({ name, size = 16, color, style }) {
  const g = GLYPHS[name];
  if (!g) return null;
  return <span style={{ color, display: "inline-flex", lineHeight: 0, ...style }}>{g({ size })}</span>;
}
