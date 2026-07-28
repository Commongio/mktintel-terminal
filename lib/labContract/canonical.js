// VENDORED from kronos-lab@974f32f packages/contract/src/canonical.js
// DO NOT EDIT HERE. Source of truth is the kronos-lab repo; edit there and re-vendor.
// Verify with: node lib/labContract/verify-vendor.js

/**
 * RFC 8785 (JCS) JSON canonicalization + SHA-256 content addressing.
 *
 * Dependency-free on purpose: this file is dropped verbatim into KRONOS
 * (mktintel-terminal), which is plain JavaScript with no build step. Only
 * node:crypto is used, which both sides already have.
 *
 * The strict-number rule below is the single most important thing here.
 * Python and JavaScript disagree about how to render some IEEE-754 doubles
 * as text. If a float ever reaches the hasher, the two sides produce
 * different bytes, and every content hash silently stops matching. So raw
 * non-integer numbers are a hard error, not a coercion: decimals travel as
 * strings (see CONTRACT.md section 4).
 */

import { createHash, createHmac, timingSafeEqual, randomBytes } from "node:crypto";

/** Thrown when a value cannot be canonicalized deterministically. */
export class CanonicalizationError extends Error {
  constructor(message, path) {
    super(path ? `${message} (at ${path || "$"})` : message);
    this.name = "CanonicalizationError";
    this.path = path;
  }
}

// JSON string escaping per RFC 8785 section 3.2.2.2: the two-char escapes it
// names, control chars as \u00XX, everything else literal. Note that '/' is
// NOT escaped and non-ASCII is NOT escaped -- output is UTF-8.
const ESCAPES = {
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0c: "\\f",
  0x0d: "\\r",
  0x22: '\\"',
  0x5c: "\\\\",
};

function canonicalString(str) {
  let out = '"';
  for (const ch of str) {
    const cp = ch.codePointAt(0);
    const esc = ESCAPES[cp];
    if (esc !== undefined) out += esc;
    else if (cp < 0x20) out += "\\u" + cp.toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

/**
 * RFC 8785 orders object keys by their UTF-16 code units. Array.prototype.sort
 * with no comparator already compares UTF-16 code units, but it also coerces
 * via toString, so we compare explicitly to keep the intent obvious and to
 * avoid surprises with keys that are numeric-looking strings.
 */
function sortKeys(a, b) {
  if (a === b) return 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ca = a.charCodeAt(i);
    const cb = b.charCodeAt(i);
    if (ca !== cb) return ca - cb;
  }
  return a.length - b.length;
}

function serialize(value, path) {
  if (value === null) return "null";

  const t = typeof value;

  if (t === "boolean") return value ? "true" : "false";

  if (t === "string") return canonicalString(value);

  if (t === "number") {
    // The strict-number rule. See the file header.
    if (!Number.isFinite(value)) {
      throw new CanonicalizationError(
        `non-finite number ${String(value)} cannot be canonicalized`, path
      );
    }
    if (!Number.isInteger(value)) {
      throw new CanonicalizationError(
        `non-integer number ${value} is forbidden in hashed payloads -- ` +
        `transmit decimals as strings (CONTRACT.md section 4)`, path
      );
    }
    if (!Number.isSafeInteger(value)) {
      throw new CanonicalizationError(
        `integer ${value} exceeds 2^53-1 and must be transmitted as a string`, path
      );
    }
    // -0 and 0 must not produce different bytes.
    return Object.is(value, -0) ? "0" : String(value);
  }

  if (t === "bigint") {
    throw new CanonicalizationError("bigint must be transmitted as a string", path);
  }
  if (t === "undefined" || t === "function" || t === "symbol") {
    throw new CanonicalizationError(`${t} is not serializable`, path);
  }

  if (Array.isArray(value)) {
    const parts = value.map((v, i) => {
      if (v === undefined) {
        throw new CanonicalizationError("undefined array element", `${path}[${i}]`);
      }
      return serialize(v, `${path}[${i}]`);
    });
    return "[" + parts.join(",") + "]";
  }

  if (t === "object") {
    if (value instanceof Date) {
      throw new CanonicalizationError(
        "Date must be pre-formatted as an RFC 3339 UTC string", path
      );
    }
    const keys = Object.keys(value).sort(sortKeys);
    const parts = [];
    for (const k of keys) {
      const v = value[k];
      // Absent and null are semantically distinct in this contract, so an
      // explicit `undefined` is dropped (it means absent) while `null` is
      // preserved (it means known-to-be-empty). CONTRACT.md section 4 rule 4.
      if (v === undefined) continue;
      parts.push(canonicalString(k) + ":" + serialize(v, `${path}.${k}`));
    }
    return "{" + parts.join(",") + "}";
  }

  throw new CanonicalizationError(`unsupported type ${t}`, path);
}

/** Canonical JSON text (RFC 8785) for `value`. */
export function canonicalize(value) {
  return serialize(value, "$");
}

/** Canonical UTF-8 bytes for `value`. */
export function canonicalBytes(value) {
  return Buffer.from(canonicalize(value), "utf8");
}

/** Lowercase hex SHA-256 of the canonical form of `value`. */
export function sha256Canonical(value) {
  return createHash("sha256").update(canonicalBytes(value)).digest("hex");
}

/** Lowercase hex HMAC-SHA256 over the canonical form of `value`. */
export function hmacCanonical(value, secret) {
  return createHmac("sha256", secret).update(canonicalBytes(value)).digest("hex");
}

/**
 * Constant-time comparison of two hex digests. Returns false rather than
 * throwing on a length mismatch, because timingSafeEqual throws on unequal
 * lengths and that throw is itself an oracle.
 */
export function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

/**
 * UUIDv7 -- time-ordered, so event ids sort by creation and index well as a
 * primary key. 48-bit big-endian ms timestamp, 4-bit version, 12 bits random,
 * 2-bit variant, 62 bits random.
 */
export function uuidv7(now = Date.now()) {
  const b = randomBytes(16);
  b[0] = (now / 2 ** 40) & 0xff;
  b[1] = (now / 2 ** 32) & 0xff;
  b[2] = (now / 2 ** 24) & 0xff;
  b[3] = (now / 2 ** 16) & 0xff;
  b[4] = (now / 2 ** 8) & 0xff;
  b[5] = now & 0xff;
  b[6] = (b[6] & 0x0f) | 0x70; // version 7
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** RFC 3339 UTC, millisecond precision, always Z. */
export function rfc3339(d = new Date()) {
  return new Date(d).toISOString();
}
