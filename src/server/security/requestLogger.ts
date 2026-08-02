// Server-side request logger. Every line is run through scrubLogPayload
// before serialization so a route that handles a beneficiary detail or
// signed-document URL cannot ever produce a request log line that leaks
// an account number, ciphertext blob, ID-card pattern, or auth header.
//
// This module is the *only* sanctioned path for logging request shapes.
// Direct console.log of a Request/headers/body is a defense-in-depth
// regression — use logRequest() / logRequestError() instead.

import { scrubLogPayload } from "./logScrub";

const RELEASE =
  process.env.RELEASE_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GIT_SHA ??
  "unknown";

const ENVIRONMENT = process.env.NODE_ENV ?? "development";

export interface RequestLogInput {
  method: string;
  url: string;
  /** Headers object (Headers, Map, plain) — values are scrubbed; sensitive
   * keys (Authorization / Cookie / set-cookie / proxy-authorization /
   * x-api-key) are replaced wholesale. */
  headers?: Headers | Record<string, string | string[] | undefined>;
  /** Optional structured body slice — pass only if you really need it. */
  body?: unknown;
  status?: number;
  durationMs?: number;
  userId?: string | null;
  extras?: Record<string, unknown>;
}

function headersToPlain(
  h: Headers | Record<string, string | string[] | undefined> | undefined,
): Record<string, unknown> | undefined {
  if (!h) return undefined;
  if (h instanceof Headers) {
    const out: Record<string, string> = {};
    h.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }
  return h as Record<string, unknown>;
}

/** Emit a single-line JSON request log to stdout. Always scrubbed. */
export function logRequest(input: RequestLogInput): void {
  const payload = scrubLogPayload({
    type: "request_log",
    timestamp: new Date().toISOString(),
    release: RELEASE,
    environment: ENVIRONMENT,
    method: input.method,
    url: input.url,
    status: input.status,
    durationMs: input.durationMs,
    userId: input.userId ?? null,
    headers: headersToPlain(input.headers),
    body: input.body,
    ...(input.extras ?? {}),
  });
  // stdout (not stderr) so request logs and error logs separate cleanly.
  console.log(JSON.stringify(payload));
}

/** Emit a single-line JSON error-with-request log. Always scrubbed. */
export function logRequestError(
  input: RequestLogInput & { error: unknown },
): void {
  const err = input.error;
  const norm =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { name: "Error", message: String(err) };
  const payload = scrubLogPayload({
    type: "request_error_log",
    timestamp: new Date().toISOString(),
    release: RELEASE,
    environment: ENVIRONMENT,
    method: input.method,
    url: input.url,
    status: input.status,
    durationMs: input.durationMs,
    userId: input.userId ?? null,
    headers: headersToPlain(input.headers),
    body: input.body,
    error: norm,
    ...(input.extras ?? {}),
  });
  console.error(JSON.stringify(payload));
}
