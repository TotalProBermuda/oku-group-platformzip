// Central log-scrubbing guardrail. Used by:
//   - src/server/errorReporting.ts (captureException / captureMessage)
//   - any future request logger / Sentry beforeSend
//
// Strips sensitive substrings from anything we are about to send to a log
// aggregator or stderr. The intent is defense-in-depth: structured audit
// rows are the canonical source of truth, but if a future code path
// accidentally logs a request body we must not leak account numbers,
// ciphertext blobs, ID-card numbers, or auth tokens.
//
// Patterns scrubbed:
//   - Long digit runs (≥ 9 consecutive digits) — bank account numbers,
//     IBAN-without-spaces, long card-like numbers.
//   - `iv.ct.tag` ciphertext shapes produced by @/server/security/encryption
//     (three base64url-ish segments separated by single dots, each ≥ 8
//     chars).
//   - Panama cedula and RUC formats, e.g. `8-123-1234`, `PE-12-345`,
//     `8-NT-123-4567`, `123-456-789012-1`.
//   - Header values whose key (case-insensitive) is `authorization`,
//     `cookie`, or `set-cookie`.

const REDACT_DIGITS = "[REDACTED:digits]";
const REDACT_CIPHER = "[REDACTED:cipher]";
const REDACT_IDCARD = "[REDACTED:idcard]";
const REDACT_HEADER = "[REDACTED]";

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "x-api-key",
]);

// `iv.ct.tag` — three url-safe base64 segments separated by single dots.
// We require ≥ 8 chars per segment to avoid mangling normal dotted text
// like "v1.2.3" or filenames "report.tar.gz".
const CIPHERTEXT_RE = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

// Long digit runs. We do this AFTER ciphertext + idcard scrubs so the
// digit-runs inside those patterns don't double-redact.
const LONG_DIGITS_RE = /\d{9,}/g;

// Panama cedula / RUC shapes. Two acceptable forms:
//   - `8-123-1234`            (cedula: 1-2 digits, 1-4 digits, 1-6 digits)
//   - `8-NT-123-4567`         (cedula prefixed PE / E / N / NT)
//   - `123-456-789012-1`      (RUC)
// We deliberately keep this conservative: only digit/letter groups
// separated by single hyphens with at least three groups.
const ID_CARD_RE =
  /\b(?:[A-Z]{1,3}-)?\d{1,4}-(?:[A-Z]{1,3}-)?\d{1,6}-\d{1,6}(?:-\d{1,4})?\b/g;

/** Apply all string-level scrubs in the documented order. */
export function scrubLogString(input: string): string {
  if (!input) return input;
  let out = input;
  // Order matters — longest / most-specific patterns first so a digit
  // run inside a ciphertext or id-card doesn't get partially redacted.
  out = out.replace(CIPHERTEXT_RE, REDACT_CIPHER);
  out = out.replace(ID_CARD_RE, REDACT_IDCARD);
  out = out.replace(LONG_DIGITS_RE, REDACT_DIGITS);
  return out;
}

/**
 * Recursively scrub a payload that may contain strings, arrays, plain
 * objects, or other primitives. Cycles are detected via a WeakSet.
 *
 * - String values are passed through `scrubLogString`.
 * - Object keys whose lowercased name is in SENSITIVE_HEADER_KEYS have
 *   their values fully replaced with `[REDACTED]` — do not recurse into
 *   them so a malicious cookie value can't escape via a nested string.
 * - Errors are reduced to `{name, message, stack}` with each field
 *   scrubbed.
 * - Anything else (numbers, bools, null, undefined, functions) is
 *   returned as-is.
 */
export function scrubLogPayload<T = unknown>(input: T): T {
  return scrub(input, new WeakSet()) as T;
}

function scrub(value: unknown, seen: WeakSet<object>): unknown {
  if (value == null) return value;
  if (typeof value === "string") return scrubLogString(value);
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (value instanceof Error) {
    return {
      name: value.name,
      message: scrubLogString(value.message),
      stack: value.stack ? scrubLogString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    return value.map(v => scrub(v, seen));
  }

  // Plain-object path. We treat any object key matching a sensitive
  // header as opaque and replace the entire value — even if it's a
  // structured object — to avoid leaking nested cookie attributes.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_HEADER_KEYS.has(k.toLowerCase())) {
      out[k] = REDACT_HEADER;
      continue;
    }
    out[k] = scrub(v, seen);
  }
  return out;
}

/**
 * Scrub an unknown thrown value down to a short, safe string suitable for
 * an HTTP response body. Routes that previously returned `e.message` raw
 * could leak sensitive substrings (account numbers, ciphertext, ID-card
 * patterns) when a service throws an error that quotes its input. This
 * helper returns the same scrubs as `scrubLogString` so the response and
 * the log line agree.
 */
export function scrubErrorMessage(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
      ? err
      : "Internal error";
  if (!raw) return "Internal error";
  return scrubLogString(raw);
}

/**
 * Redact the local-part of an email for log lines (`j***@example.com`).
 * Re-exported here so callers have one place to import all log-safe
 * helpers from. The original implementation lives in statusEmail.ts and
 * is kept identical to avoid changing legacy log shapes.
 */
export function redactEmailForLog(email: string | null | undefined): string {
  if (!email) return "***";
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local?.[0] ?? "";
  return `${head}***@${domain}`;
}
