"use client";
// LightweightChart.jsx — V10.6. Replaces the TradingView iframe embed.
//
// WHY THIS EXISTS: the old embed was a black box in an iframe. We could set a
// symbol and nothing else — no reading price, no drawing, no reacting. That made
// "the AI annotates the chart while it answers you" impossible by construction.
// This renders OUR candles (via the existing /api/candles failover layer) with
// TradingView's open-source lightweight-charts, so every pixel is ours to drive.
//
// API NOTE (v5 — differs from most docs/tutorials in the wild):
//   • chart.addSeries(CandlestickSeries, opts)   NOT chart.addCandlestickSeries()
//   • createSeriesMarkers(series, markers)       series.setMarkers() was REMOVED
//   • series.createPriceLine(opts) → IPriceLine  (used for entry/TP/SL/alerts)
// Verified directly against node_modules/lightweight-charts/dist/typings.d.ts.
//
// Annotations are declarative: this component renders the `annotations` prop and
// owns no drawing state of its own. See lib/chartAnnotations.js.

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries,
  createSeriesMarkers, ColorType, CrosshairMode, LineStyle,
} from "lightweight-charts";
import { LEVEL_KINDS, toUnix, snapToCandle } from "../../lib/chartAnnotations";

const FM = "'JetBrains Mono',monospace";

const STYLE_MAP = { solid: LineStyle.Solid, dashed: LineStyle.Dashed, dotted: LineStyle.Dotted };

// /api/candles returns ISO times; lightweight-charts needs UNIX SECONDS, strictly
// ascending and unique — duplicates or out-of-order rows make it throw and render
// nothing. Yahoo occasionally repeats a timestamp at session boundaries, so this
// guard is load-bearing, not defensive padding.
function toChartCandles(raw) {
  const out = [];
  let lastT = -Infinity;
  for (const c of raw || []) {
    const t = toUnix(c.time);
    if (t == null || t <= lastT) continue;
    if (c.open == null || c.high == null || c.low == null || c.close == null) continue;
    out.push({ time: t, open: +c.open, high: +c.high, low: +c.low, close: +c.close, volume: +c.volume || 0 });
    lastT = t;
  }
  return out;
}

export default function LightweightChart({
  symbol = "AAPL",
  interval = "1d",
  T,
  accent = "#00d4aa",
  annotations = [],
  onPriceUpdate,
}) {
  const wrapRef = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const volRef = useRef(null);
  const markersRef = useRef(null);
  const priceLinesRef = useRef([]);   // IPriceLine handles — must be removed explicitly
  const trendRef = useRef([]);        // trendline ISeriesApi handles
  const candlesRef = useRef([]);      // raw chart candles, for snapping

  const [state, setState] = useState("loading");
  const [meta, setMeta] = useState(null);

  const text = T?.text ?? "#E2EDF8";
  const dim = T?.dim ?? "#7A9AB5";
  const border = T?.border ?? "#1A2535";

  // ── create chart once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!wrapRef.current) return;
    const chart = createChart(wrapRef.current, {
      autoSize: true,
      layout: {
        // Transparent so the terminal's theme backdrop shows through — the whole
        // point of the theme work; an opaque chart would black it out.
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: dim,
        fontFamily: FM,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: `${border}55` },
        horzLines: { color: `${border}55` },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: border, scaleMargins: { top: 0.08, bottom: 0.26 } },
      timeScale: { borderColor: border, timeVisible: true, secondsVisible: false, rightOffset: 6 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#00e676", downColor: "#ff3d57",
      wickUpColor: "#00e676", wickDownColor: "#ff3d57",
      borderVisible: false,
    });

    // Volume as an overlay on its own invisible scale, pinned to the bottom.
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current = chart;
    candleRef.current = candleSeries;
    volRef.current = volSeries;
    markersRef.current = createSeriesMarkers(candleSeries, []);

    return () => { chart.remove(); chartRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── restyle on theme change (without rebuilding the chart) ─────────────────
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: { textColor: dim },
      grid: { vertLines: { color: `${border}55` }, horzLines: { color: `${border}55` } },
      rightPriceScale: { borderColor: border },
      timeScale: { borderColor: border },
    });
  }, [dim, border]);

  // ── load candles ───────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setState("loading");
    try {
      const r = await fetch(`/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Chart data unavailable");
      const candles = toChartCandles(d.candles);
      if (!candles.length) throw new Error("No candles returned");

      candlesRef.current = candles;
      candleRef.current?.setData(candles);
      volRef.current?.setData(candles.map((c) => ({
        time: c.time, value: c.volume,
        color: c.close >= c.open ? "rgba(0,230,118,0.28)" : "rgba(255,61,87,0.28)",
      })));
      chartRef.current?.timeScale().fitContent();

      const last = candles[candles.length - 1];
      const prev = candles[candles.length - 2];
      const price = d.currentPrice ?? last.close;
      const chg = prev ? ((price - prev.close) / prev.close) * 100 : null;
      setMeta({ price, chg, source: d.source, degraded: d.degraded, count: candles.length });
      onPriceUpdate?.(price);
      setState("live");
    } catch (e) {
      setState("error");
      setMeta({ error: String(e.message) });
    }
  }, [symbol, interval, onPriceUpdate]);

  useEffect(() => { load(); }, [load]);

  // Live-ish refresh. Intraday moves; a monthly candle does not — so don't burn
  // the free data tier polling a 1mo chart every 30s.
  useEffect(() => {
    const fast = ["1min", "5min", "15min", "1h"].includes(interval);
    const ms = fast ? 30_000 : 5 * 60_000;
    const t = setInterval(load, ms);
    return () => clearInterval(t);
  }, [load, interval]);

  // ── render annotations declaratively ───────────────────────────────────────
  // Full teardown + rebuild on every change. Annotation counts are tiny (single
  // digits), so diffing would be complexity for no measurable gain, and a rebuild
  // can't drift out of sync with the prop.
  useEffect(() => {
    const chart = chartRef.current, series = candleRef.current;
    if (!chart || !series || state !== "live") return;

    for (const pl of priceLinesRef.current) { try { series.removePriceLine(pl); } catch {} }
    priceLinesRef.current = [];
    for (const s of trendRef.current) { try { chart.removeSeries(s); } catch {} }
    trendRef.current = [];

    const markers = [];
    const mine = annotations.filter((a) => a.symbol === symbol);

    for (const a of mine) {
      if (a.type === "level") {
        const k = LEVEL_KINDS[a.kind] || LEVEL_KINDS.note;
        priceLinesRef.current.push(series.createPriceLine({
          price: a.price,
          color: k.color,
          lineWidth: 2,
          lineStyle: STYLE_MAP[k.style] ?? LineStyle.Dashed,
          axisLabelVisible: true,
          title: a.label || k.label,
        }));
      } else if (a.type === "trendline") {
        // No native trendline primitive in v5 — a 2-point LineSeries is the
        // supported way to draw one, and it stays glued to the time axis on zoom.
        const from = { time: snapToCandle(a.from.time, candlesRef.current), value: a.from.price };
        const to = { time: snapToCandle(a.to.time, candlesRef.current), value: a.to.price };
        if (from.time === to.time) continue; // degenerate — would throw
        const line = chart.addSeries(LineSeries, {
          color: a.color || "#a78bfa",
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        line.setData(from.time < to.time ? [from, to] : [to, from]);
        trendRef.current.push(line);
      } else if (a.type === "marker") {
        markers.push({
          time: snapToCandle(a.time, candlesRef.current),
          position: a.position,
          color: a.color || accent,
          shape: a.shape,
          text: a.text,
        });
      }
    }

    markers.sort((x, y) => x.time - y.time); // v5 requires ascending marker times
    markersRef.current?.setMarkers(markers);
  }, [annotations, symbol, state, accent]);

  const pos = meta?.chg != null && meta.chg >= 0;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", minHeight: 0 }}>
      {/* Read-out overlay — the embed gave us this for free; now it's ours. */}
      <div style={{
        position: "absolute", top: 8, left: 10, zIndex: 3, pointerEvents: "none",
        display: "flex", alignItems: "baseline", gap: 9,
      }}>
        <span style={{ fontFamily: FM, fontSize: 13, fontWeight: 800, color: text, letterSpacing: 1 }}>{symbol}</span>
        <span style={{ fontFamily: FM, fontSize: 8, color: dim, letterSpacing: 1 }}>{interval}</span>
        {meta?.price != null && (
          <>
            <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, color: text }}>
              {meta.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
            {meta.chg != null && (
              <span style={{ fontFamily: FM, fontSize: 10, fontWeight: 700, color: pos ? "#00e676" : "#ff3d57" }}>
                {pos ? "▲" : "▼"} {Math.abs(meta.chg).toFixed(2)}%
              </span>
            )}
          </>
        )}
        {meta?.degraded && (
          <span title="Primary data source failed; showing failover data"
            style={{ fontFamily: FM, fontSize: 7, color: "#f7c948", letterSpacing: 1 }}>⚠ FAILOVER</span>
        )}
      </div>

      {state === "loading" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>
          <span style={{ fontFamily: FM, fontSize: 9, color: dim, letterSpacing: 2 }}>LOADING {symbol}…</span>
        </div>
      )}
      {state === "error" && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", justifyContent: "center", zIndex: 2, padding: 20, textAlign: "center" }}>
          <span style={{ fontFamily: FM, fontSize: 10, color: "#ff3d57", letterSpacing: 1 }}>⚠ {meta?.error || "Chart unavailable"}</span>
          <button onClick={load} style={{
            fontFamily: FM, fontSize: 9, color: accent, background: `${accent}12`,
            border: `1px solid ${accent}30`, borderRadius: 6, padding: "5px 12px", cursor: "pointer", letterSpacing: 1,
          }}>RETRY</button>
        </div>
      )}

      <div ref={wrapRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
