// Error capture sink. Writes single-line structured JSON to stderr with
// release + environment tags so log aggregators ingest directly. To swap
// in Sentry: install @sentry/nextjs, set SENTRY_DSN, replace the bodies
// of captureException/captureMessage with Sentry equivalents.
//
// Every payload is run through scrubLogPayload before serialization so
// long digit runs, ciphertext blobs, ID-card numbers, and Authorization
// / Cookie headers are stripped — defense-in-depth for accidental
// request-body logging.

import { scrubLogPayload } from "@/server/security/logScrub";

const RELEASE =
  process.env.RELEASE_SHA ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GIT_SHA ??
  "unknown";

const ENVIRONMENT = process.env.NODE_ENV ?? "development";

export interface ErrorContext {
  source?: string;
  url?: string;
  method?: string;
  userId?: string;
  tags?: Record<string, string | number | boolean>;
  extras?: Record<string, unknown>;
}

function normalizeError(err: unknown): { name: string; message: string; stack?: string } {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
  if (typeof err === "string") return { name: "Error", message: err };
  try {
    return { name: "Error", message: JSON.stringify(err) };
  } catch {
    return { name: "Error", message: String(err) };
  }
}

export function captureException(err: unknown, ctx: ErrorContext = {}): void {
  const norm = normalizeError(err);
  console.error(
    JSON.stringify(
      scrubLogPayload({
        type: "error_capture",
        timestamp: new Date().toISOString(),
        release: RELEASE,
        environment: ENVIRONMENT,
        name: norm.name,
        message: norm.message,
        stack: norm.stack,
        ...ctx,
      }),
    ),
  );
}

export function captureMessage(message: string, ctx: ErrorContext = {}): void {
  console.warn(
    JSON.stringify(
      scrubLogPayload({
        type: "message_capture",
        timestamp: new Date().toISOString(),
        release: RELEASE,
        environment: ENVIRONMENT,
        message,
        ...ctx,
      }),
    ),
  );
}
