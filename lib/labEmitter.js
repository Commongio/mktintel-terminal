/**
 * KRONOS Lab emitter.
 *
 * Sends signal and outcome events to the Lab's ingest API. Exists because
 * runSignalEngine returns far more than writeIfChanged persists — structure,
 * confirmation, bullWeight/bearWeight, risk, price, candleCount, degraded, and
 * each agent's `data`. Those never reach the table, so no post-hoc reader can
 * recover them. Only capture at emit time, inside the engine run, sees the
 * whole object.
 *
 * ── SAFETY CONTRACT ────────────────────────────────────────────────────────
 * This module runs inside a live trading engine. It therefore:
 *   1. NEVER throws into the signal path. Every entry point is total.
 *   2. NEVER blocks generation. Requests are fire-and-forget with a hard timeout.
 *   3. Fails OPEN. If the Lab is down, misconfigured, or slow, KRONOS behaves
 *      exactly as it did before this file existed.
 *   4. No-ops silently when unconfigured, so preview and local dev are unaffected.
 *
 * If you ever find yourself adding an `await` that the caller depends on, or a
 * throw that can escape, you have broken the contract above.
 */

import { buildEnvelope } from "./labContract/envelope.js";

// Trailing slash stripped: `${LAB_URL}/api/ingest` with a trailing slash
// yields a double slash, which some routers 404. That failure is swallowed by
// the fire-and-forget catch below, so it presents as complete silence -- no
// rows in the Lab, no dead letters, nothing to point at.
const LAB_URL = (process.env.KRONOS_LAB_URL || "").trim().replace(/\/+$/, "");
const LAB_KEY = (process.env.KRONOS_LAB_HMAC_KEY || "").trim();
const LAB_KEY_ID = process.env.KRONOS_LAB_KEY_ID || "k1";
const INSTANCE = process.env.VERCEL_ENV || "local";
const EMITTER_VERSION = "0.1.0";
// 2500ms was too tight: the Lab's ingest cold-starts a serverless function and
// makes several Supabase round-trips before responding. Every emit failed.
// Still bounded, and still awaited only once at the end of a run, so this
// cannot stall signal generation.
const TIMEOUT_MS = 9000;

// The last transport error, exposed so the cron response can name it. A
// fire-and-forget emitter that fails is otherwise completely silent.
let LAST_ERROR = null;
export function labLastError() { return LAST_ERROR; }

/** Configured only when both URL and key are present. Never half-on. */
export function labEnabled() {
  return Boolean(LAB_URL && LAB_KEY);
}

// Logged once per cold start. Without this, "not configured" and "configured
// but every request fails" look identical from the outside: both produce zero
// rows in the Lab and zero dead letters. The key is never logged, only whether
// one is present and how long it is -- enough to catch a truncated paste.
console.log(
  `[lab] emitter ${labEnabled() ? "ENABLED" : "DISABLED"} ` +
  `url=${LAB_URL || "(unset)"} keyLen=${LAB_KEY.length} keyId=${LAB_KEY_ID}`
);

// ── setup identity ─────────────────────────────────────────────────────────
// Mirrors the engine's own dedup comparison (generate-signals:119). A family
// continues while asset_class, symbol, interval, direction and status all hold.

export function continuesFamily(prev, next) {
  if (!prev) return false;
  return prev.asset_class === next.asset_class &&
         prev.symbol === next.symbol &&
         prev.interval === next.interval &&
         prev.direction === next.direction &&
         prev.status === next.status;
}

export function setupIdFor({ asset_class, symbol, interval, direction, status, streak_started_at }) {
  const anchor = new Date(streak_started_at).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `su_${asset_class}_${symbol}_${interval}_${direction}_${status}_${anchor}`;
}

/**
 * Derive this row's place in its re-write family from the previous row.
 * `last` is the row writeIfChanged already fetched — no extra query needed,
 * provided the select is widened to include setup_id/streak_started_at/revision.
 */
export function deriveSetup(last, next, now = new Date()) {
  const continues = continuesFamily(last, next) && last?.streak_started_at;
  const streak_started_at = continues ? last.streak_started_at : now.toISOString();
  const revision = continues ? (Number(last.revision) || 0) + 1 : 0;
  return {
    setup_id: setupIdFor({ ...next, streak_started_at }),
    streak_started_at,
    revision,
  };
}

// ── provenance ─────────────────────────────────────────────────────────────

/**
 * Extract what the engine computed and the write path drops.
 *
 * `raw` is runSignalEngine's return BEFORE applyAggregateGate; `sig` is after.
 * Passing both is deliberate: the delta between them is the gate's action, and
 * signalStats moves, so it can never be replayed after the fact.
 */
export function buildProvenance(raw, sig, opts = {}) {
  const pm = raw?.postMortem ?? raw ?? {};

  // The cron mutates raw.status in place when the chop halt fires
  // (generate-signals:91), so raw.status at this point is already post-chop.
  // Callers pass `preGate` captured before that mutation; without it a FIRE
  // demoted by chop is indistinguishable from one that never fired.
  const pre = opts.preGate ?? { status: raw?.status ?? null, conviction: raw?.conviction ?? null };
  const gateApplied = Boolean(raw && sig && (raw.conviction !== sig.conviction || raw.status !== sig.status));
  const chopApplied = Boolean(opts.chopApplied) && pre.status === "FIRE" && raw?.status === "HOLD";

  return {
    // decomposition of conviction = min(100, |net|*100 + agreeing*12)
    bull_weight: raw?.bullWeight ?? pm.bullWeight ?? null,
    bear_weight: raw?.bearWeight ?? pm.bearWeight ?? null,
    uncapped_conviction: computeUncapped(raw),

    // the objects behind the verdict
    structure: raw?.structure ?? null,
    confirmation: raw?.confirmation ?? null,
    risk: raw?.risk ?? null,

    // data-quality provenance — bad call vs call on bad data
    data_source: raw?.dataSource ?? null,
    candle_count: raw?.candleCount ?? null,
    price_at_eval: raw?.price ?? null,

    // which gates actually ran. `source` alone will drift; booleans will not.
    gate: {
      applied: gateApplied,
      raw_conviction: raw?.conviction ?? null,
      raw_status: raw?.status ?? null,
      reason: opts.gateReason ?? null,
    },
    // Pre-chop, pre-gate: the engine's untouched verdict. Three stages are now
    // separable -- engine -> chop halt -> aggregate gate.
    pre_gate_status: pre.status,
    pre_gate_conviction: pre.conviction,
    chop_applied: chopApplied,
    chop_eligible: Boolean(opts.chopApplied),

    // the slider value in force at write time (refresh-feed:57 filters on it)
    min_conviction_at_write: opts.minConviction ?? null,

    // agents keep only 4 keys at write time; `data` is dropped
    agent_data: Array.isArray(raw?.agents)
      ? raw.agents.map((a) => ({ agent: a.agent, data: a.data ?? null }))
      : null,

    emitter_version: EMITTER_VERSION,
  };
}

/**
 * Recover the pre-clamp conviction. Math.min(100, ...) censors from above, so
 * a 101 and a 160 are indistinguishable in the stored column — which makes the
 * top bucket of any reliability curve a mixture of unknown composition.
 */
function computeUncapped(raw) {
  const bull = Number(raw?.bullWeight);
  const bear = Number(raw?.bearWeight);
  if (!Number.isFinite(bull) || !Number.isFinite(bear)) return null;
  const agreeing = Array.isArray(raw?.agents)
    ? raw.agents.filter((a) => {
        if (a.signal === "neutral" || !a.signal) return false;
        const net = bull - bear;
        return (net > 0 && a.signal === "bullish") || (net < 0 && a.signal === "bearish");
      }).length
    : 0;
  return Math.round(Math.abs(bull - bear) + agreeing * 12);
}

// ── payload ────────────────────────────────────────────────────────────────

/** Decimals travel as strings; the contract refuses raw floats. */
const dec = (v) => (v === null || v === undefined ? null : String(v));

/**
 * The reward:risk actually being graded, computed from the plan's own geometry
 * rather than trusting `plan.rr`. Returns a decimal string, or null when the
 * geometry is incomplete or the risk leg is zero.
 */
function rrFromGeometry(entry, stop, t1) {
  // Number(null) and Number("") are both 0, and 0 is finite -- so coercing
  // first would turn a missing stop into a stop at zero and yield a plausible,
  // entirely wrong ratio. Reject absent values before any arithmetic.
  const nums = [entry, stop, t1].map((v) =>
    v === null || v === undefined || v === "" ? NaN : Number(v)
  );
  if (!nums.every(Number.isFinite)) return null;
  const [e, s, t] = nums;
  const risk = Math.abs(e - s);
  if (risk === 0) return null;
  return (Math.abs(t - e) / risk).toFixed(4);
}

/**
 * `source === "news"` rows are a different object: mcpFeed writes
 * `{agent:"NEWS", vote, conviction}` instead of `{agent, signal, confidence,
 * reasons}`, a plan with no trade geometry, a bare `conviction >= 65` status
 * with no SCAN, and a hardcoded interval. The weighted-vote formula never ran,
 * so conviction there is not decomposable and must not be treated as if it were.
 */
export function buildSignalPayload({ raw, sig, row, setup, provenance }) {
  const isNews = row.source === "news";

  return {
    signal_id: row.id ?? null,
    model_version_id: `mv_engine_${String(row.engine_version).replace(/\./g, "_")}`,
    setup,
    instrument: {
      asset_class: row.asset_class,
      symbol: row.symbol,
      interval: row.interval,
      // mcpFeed hardcodes interval "1h" and (historically) asset_class
      // "options" regardless of the real instrument. Flag rather than trust.
      interval_is_synthetic: isNews,
      asset_class_is_synthetic: isNews,
    },
    status: row.status,
    direction: row.direction,
    status_semantics: isNews ? "threshold_only" : "risk_and_confirmation_gated",
    plan: isNews ? { kind: "news", geometry: null } : {
      entry: dec(row.plan?.entry),
      stop: dec(row.plan?.stop),
      t1: dec(row.plan?.t1),
      t2: dec(row.plan?.t2),
      // `plan.rr` is hardcoded 3.0 and refers to t2 -- but signalLifecycle:79
      // grades t1 at 1.5R. Emitting that single scalar would put a
      // wrong-by-exactly-2x field in the Lab, which is worse than an absent
      // one. Emit the graded ratio computed from real geometry, and keep the
      // declared value only as a flagged audit trail.
      rr_graded: rrFromGeometry(row.plan?.entry, row.plan?.stop, row.plan?.t1),
      rr_declared: dec(row.plan?.rr),
      rr_declared_refers_to: "t2",
      rr_declared_is_graded: false,
    },
    prediction: {
      // t2 exists but is never graded — signalLifecycle:79 grades t1.
      predicate_id: isNews ? null : "t1_before_stop",
      value: null,
      scale: "score",
      calibrated: false,
      raw_value: dec(row.conviction),
      raw_scale_note: isNews
        ? "news scorer output; the weighted-vote formula did not run"
        : "conviction = min(100, round(|net|*100 + agreeing*12)); gated >=45",
      decomposable: !isNews,
    },
    quality: {
      degraded: provenance?.degraded ?? raw?.degraded ?? null,
      data_source: provenance?.data_source ?? null,
      candle_count: provenance?.candle_count ?? null,
    },
    evaluation: {
      // KRONOS never resolves by time: "never delete by time, keep until a
      // terminal state" (V12 lifecycle). Unresolved rows are censored
      // observations, not absent ones.
      horizon_id: "h_none_open_ended",
      horizon_spec: { kind: "open_ended" },
      resolution_rule_id: isNews ? null : "rr_t1_before_stop_v1",
    },
    agents: Array.isArray(row.agents) ? row.agents : [],
    agents_shape: isNews ? "news_v1" : "engine_v1",
    engine_version: String(row.engine_version),
    source: row.source ?? null,
    decision_time: row.decision_time ?? new Date().toISOString(),
    provenance,
  };
}

// ── transport ──────────────────────────────────────────────────────────────

/**
 * Fire-and-forget POST. Returns a promise the caller may ignore; it never
 * rejects. A failed emit is logged once and dropped — the Lab's job is to
 * observe KRONOS, never to be able to stop it.
 */
async function post(envelope) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${LAB_URL}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
      signal: ctrl.signal,
      // `keepalive` caps request bodies at 64KB. These payloads carry
      // structure, confirmation and agent data and can exceed that, which
      // fails the request outright. It is a page-unload beacon feature and
      // buys nothing server-side.
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      LAST_ERROR = `HTTP ${res.status} ${body.slice(0, 120)}`;
      console.warn(`[lab] ingest ${res.status} for ${envelope.event_type}: ${body.slice(0, 200)}`);
    } else {
      LAST_ERROR = null;
    }
    return res.ok;
  } catch (e) {
    // AbortError included: a slow Lab must never slow signal generation.
    LAST_ERROR = `${e?.name ?? "Error"}: ${e?.message ?? e}`;
    console.warn(`[lab] emit failed (${envelope.event_type}): ${LAST_ERROR}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Emit a signal. Total: returns false rather than throwing, whatever happens.
 * `occurredAt` is the decision time, distinct from send time so the Lab can
 * detect backfills by the gap.
 */
export function emitSignal({ raw, sig, row, last, opts = {} }) {
  if (!labEnabled()) return Promise.resolve(false);
  try {
    const setup = deriveSetup(last, row);
    const provenance = buildProvenance(raw, sig, opts);
    const payload = buildSignalPayload({ raw, sig, row, setup, provenance });

    const envelope = buildEnvelope({
      eventType: "signal.emitted",
      payload,
      idempotencyKey: `${setup.setup_id}:rev${setup.revision}`,
      producer: { system: "kronos", instance: INSTANCE, emitter_sdk_version: EMITTER_VERSION },
      secret: LAB_KEY,
      keyId: LAB_KEY_ID,
      occurredAt: payload.decision_time,
    });
    return post(envelope);
  } catch (e) {
    console.warn(`[lab] emitSignal skipped: ${e?.message ?? e}`);
    return Promise.resolve(false);
  }
}

/**
 * Emit an outcome. `mode` distinguishes engine grading from a human override —
 * never inferred, because manual reporting is discretionary and correlates with
 * judgement, and metrics must stay sliceable by it.
 */
export function emitOutcome({ signalId, setupId, state, plan, resolvedAt, mode = "engine", actor = null, reason = null }) {
  if (!labEnabled()) return Promise.resolve(false);
  try {
    const payload = {
      outcome_id: `out_${signalId}`,
      signal_id: signalId,
      setup_id: setupId ?? null,
      horizon_id: "h_none_open_ended",
      resolution_rule_id: "rr_t1_before_stop_v1",
      status: state,
      // `invalidated` was cut off before it could resolve, so its predicate has
      // no truth value. null, never false — recording false would count every
      // supersession as an engine mistake.
      predicate_outcome: state === "won" ? true : state === "lost" ? false : null,
      resolved_at: resolvedAt ?? new Date().toISOString(),
      resolution_reason: reason,
      plan_at_emit: plan ? { entry: dec(plan.entry), stop: dec(plan.stop), t1: dec(plan.t1), t2: dec(plan.t2) } : null,
      computed_by: { system: "kronos", version: EMITTER_VERSION },
      reported_by: { mode, actor, reported_at: new Date().toISOString(), tool_version: EMITTER_VERSION },
    };

    const envelope = buildEnvelope({
      eventType: "outcome.resolved",
      payload,
      idempotencyKey: `${signalId}:outcome:${state}`,
      producer: { system: "kronos", instance: INSTANCE, emitter_sdk_version: EMITTER_VERSION },
      secret: LAB_KEY,
      keyId: LAB_KEY_ID,
      occurredAt: payload.resolved_at,
    });
    return post(envelope);
  } catch (e) {
    console.warn(`[lab] emitOutcome skipped: ${e?.message ?? e}`);
    return Promise.resolve(false);
  }
}
