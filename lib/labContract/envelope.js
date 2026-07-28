// VENDORED from kronos-lab@974f32f packages/contract/src/envelope.js
// DO NOT EDIT HERE. Source of truth is the kronos-lab repo; edit there and re-vendor.
// Verify with: node lib/labContract/verify-vendor.js

/**
 * Event envelope: construction, signing, and verification.
 *
 * Dependency-free (see canonical.js header) so the KRONOS emitter can import
 * it directly. The Lab layers Zod validation on top; this module deliberately
 * does not, so that the producer side stays install-free.
 */

import {
  canonicalize, sha256Canonical, hmacCanonical, safeEqualHex, uuidv7, rfc3339,
} from "./canonical.js";

export const ENVELOPE_VERSION = "1.0.0";

/**
 * Payload schemas are versioned INDEPENDENTLY of the envelope. A single
 * version field breaks the moment Signal v2 and Outcome v1 coexist, which
 * they will. CONTRACT.md section 2.
 */
export const EVENT_TYPES = Object.freeze({
  "signal.emitted":         { schema: "kronos.signal",         version: "1.0.0" },
  "signal.amended":         { schema: "kronos.signal",         version: "1.0.0" },
  "signal.superseded":      { schema: "kronos.supersession",   version: "1.0.0" },
  "outcome.resolved":       { schema: "kronos.outcome",        version: "1.0.0" },
  "model.version.deployed": { schema: "kronos.model_version",  version: "1.0.0" },
});

/** Majors the Lab will accept. Anything else goes to the dead-letter queue. */
export const ACCEPTED_MAJORS = Object.freeze({ "kronos.signal": [1], "kronos.outcome": [1], "kronos.supersession": [1], "kronos.model_version": [1] });

/**
 * A signal emitted more than this long after the decision was made is treated
 * as a replay rather than a live event, and is excluded from out-of-sample
 * evaluation by default. Historical backfills are where leakage hides, and
 * they are otherwise indistinguishable from live signals. CONTRACT.md 3.3.
 */
export const BACKFILL_THRESHOLD_MS = 5 * 60 * 1000;

export class ContractError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ContractError";
    this.code = code;
  }
}

function major(semver) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(semver);
  if (!m) throw new ContractError(`malformed version "${semver}"`, "BAD_VERSION");
  return Number(m[1]);
}

/**
 * Build a signed envelope.
 *
 * `occurredAt` is when the fact happened (for a signal, its decision time).
 * `sentAt` is when the emitter fired. They are separate so the receiver can
 * measure the gap and flag backfills; collapsing them destroys that signal.
 */
export function buildEnvelope({
  eventType, payload, idempotencyKey, producer, secret, keyId,
  occurredAt, sentAt, eventId,
}) {
  const spec = EVENT_TYPES[eventType];
  if (!spec) throw new ContractError(`unknown event_type "${eventType}"`, "UNKNOWN_EVENT_TYPE");
  if (!payload || typeof payload !== "object") {
    throw new ContractError("payload must be an object", "BAD_PAYLOAD");
  }
  if (!idempotencyKey) throw new ContractError("idempotency_key is required", "NO_IDEMPOTENCY_KEY");
  if (!secret) throw new ContractError("signing secret is required", "NO_SECRET");
  if (!keyId) throw new ContractError("key_id is required (rotation depends on it)", "NO_KEY_ID");

  const unsigned = {
    envelope_version: ENVELOPE_VERSION,
    event_id: eventId || uuidv7(),
    event_type: eventType,
    payload_schema: spec.schema,
    payload_version: spec.version,
    idempotency_key: idempotencyKey,
    producer: {
      system: producer?.system ?? "kronos",
      instance: producer?.instance ?? "unknown",
      emitter_sdk_version: producer?.emitter_sdk_version ?? "0.1.0",
    },
    occurred_at: occurredAt || rfc3339(),
    sent_at: sentAt || rfc3339(),
    payload,
    payload_sha256: sha256Canonical(payload),
  };

  // Signed over the whole envelope minus the signature block -- not just the
  // payload, or event_type would be tamperable.
  const value = hmacCanonical(unsigned, secret);
  return { ...unsigned, signature: { alg: "HMAC-SHA256", key_id: keyId, value } };
}

/**
 * Verify an envelope. `resolveSecret(keyId)` returns the secret for that key
 * id, or null/undefined if unknown -- this is what makes rotation possible
 * without downtime.
 *
 * Returns { ok: true, envelope, backfilled, lagMs } or { ok: false, code, message }.
 * Errors are returned rather than thrown so a bad event can be dead-lettered
 * with its reason instead of taking down the ingest handler.
 */
export function verifyEnvelope(env, resolveSecret, { now = Date.now() } = {}) {
  const fail = (code, message) => ({ ok: false, code, message });

  if (!env || typeof env !== "object") return fail("MALFORMED", "envelope is not an object");
  if (env.envelope_version !== ENVELOPE_VERSION) {
    return fail("ENVELOPE_VERSION", `unsupported envelope_version "${env.envelope_version}"`);
  }

  const spec = EVENT_TYPES[env.event_type];
  if (!spec) return fail("UNKNOWN_EVENT_TYPE", `unknown event_type "${env.event_type}"`);
  if (env.payload_schema !== spec.schema) {
    return fail("SCHEMA_MISMATCH",
      `event_type ${env.event_type} expects ${spec.schema}, got ${env.payload_schema}`);
  }

  // Unknown MAJOR goes to the DLQ with an explicit reason. It is never
  // coerced, because silently reading a v2 payload as v1 is how you get
  // plausible, wrong data. A newer MINOR is accepted: unknown fields are
  // preserved by the storage layer for forward compatibility.
  const accepted = ACCEPTED_MAJORS[env.payload_schema] || [];
  let maj;
  try { maj = major(env.payload_version); }
  catch (e) { return fail("BAD_VERSION", e.message); }
  if (!accepted.includes(maj)) {
    return fail("UNSUPPORTED_MAJOR",
      `${env.payload_schema} v${env.payload_version} major ${maj} not in [${accepted.join(",")}]`);
  }

  const sig = env.signature;
  if (!sig || sig.alg !== "HMAC-SHA256" || !sig.key_id || !sig.value) {
    return fail("BAD_SIGNATURE_BLOCK", "signature block missing or malformed");
  }

  const secret = resolveSecret(sig.key_id);
  if (!secret) return fail("UNKNOWN_KEY_ID", `unknown key_id "${sig.key_id}"`);

  const { signature: _omit, ...unsigned } = env;
  let expected;
  try { expected = hmacCanonical(unsigned, secret); }
  catch (e) { return fail("CANONICALIZATION", e.message); }

  if (!safeEqualHex(expected, sig.value)) {
    return fail("BAD_SIGNATURE", "HMAC mismatch -- payload or headers were altered");
  }

  // Recompute independently of the signature: a correct HMAC over a payload
  // whose declared hash is wrong still means the two disagree.
  let actualHash;
  try { actualHash = sha256Canonical(env.payload); }
  catch (e) { return fail("CANONICALIZATION", e.message); }
  if (actualHash !== env.payload_sha256) {
    return fail("HASH_MISMATCH",
      `payload_sha256 declared ${env.payload_sha256}, computed ${actualHash}`);
  }

  const occurred = Date.parse(env.occurred_at);
  const sent = Date.parse(env.sent_at);
  if (!Number.isFinite(occurred) || !Number.isFinite(sent)) {
    return fail("BAD_TIMESTAMP", "occurred_at / sent_at must be RFC 3339");
  }

  const lagMs = sent - occurred;
  return { ok: true, envelope: env, lagMs, backfilled: lagMs > BACKFILL_THRESHOLD_MS, receivedAt: rfc3339(new Date(now)) };
}

/** Canonical form of an envelope, for storage or debugging. */
export function envelopeCanonical(env) {
  return canonicalize(env);
}
