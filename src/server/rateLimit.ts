// Per-key fixed-window rate limiter + honeypot helpers for public POST
// endpoints. Uses Redis (INCR + EXPIRE) when REDIS_URL is set so limits
// are shared across instances; falls back to an in-process Map for
// single-instance dev/preview environments.

import type { Redis as IORedis } from "ioredis";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const SWEEP_MS = 60_000;
let lastSweep = Date.now();

let redis: IORedis | null = null;
let redisInitTried = false;

function getRedis(): IORedis | null {
  if (redisInitTried) return redis;
  redisInitTried = true;
  if (!process.env.REDIS_URL) return null;
  try {
    // ioredis is already pulled in via bullmq; safe to require lazily.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IORedisCtor = require("ioredis").default ?? require("ioredis");
    redis = new IORedisCtor(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    redis!.on("error", (err: Error) => {
      // Don't crash the process; the next call will fall back to memory.
      console.error(JSON.stringify({ type: "rate_limit_redis_error", message: err.message }));
    });
    return redis;
  } catch {
    return null;
  }
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
  remaining: number;
}

/** Build the standard rate-limit response for routes that do not accept a body. */
export function rateLimitedResponse(result: RateLimitResult): Response {
  return Response.json(
    { ok: false, error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds ?? 60) },
    },
  );
}

function checkRateLimitInMemory(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > SWEEP_MS) {
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    lastSweep = now;
  }
  const b = buckets.get(opts.key);
  if (!b || b.resetAt < now) {
    buckets.set(opts.key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true, remaining: opts.limit - 1 };
  }
  if (b.count >= opts.limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((b.resetAt - now) / 1000)),
      remaining: 0,
    };
  }
  b.count += 1;
  return { ok: true, remaining: Math.max(0, opts.limit - b.count) };
}

async function checkRateLimitRedis(client: IORedis, opts: RateLimitOptions): Promise<RateLimitResult> {
  const windowSec = Math.max(1, Math.ceil(opts.windowMs / 1000));
  const k = `rl:${opts.key}`;
  // INCR returns the new count; on first hit we set the TTL.
  const count = await client.incr(k);
  if (count === 1) await client.expire(k, windowSec);
  if (count > opts.limit) {
    const ttl = await client.ttl(k);
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, ttl > 0 ? ttl : windowSec),
      remaining: 0,
    };
  }
  return { ok: true, remaining: Math.max(0, opts.limit - count) };
}

export async function checkRateLimitAsync(opts: RateLimitOptions): Promise<RateLimitResult> {
  const client = getRedis();
  if (!client) return checkRateLimitInMemory(opts);
  try {
    return await checkRateLimitRedis(client, opts);
  } catch {
    // Fail open to in-memory rather than failing the request.
    return checkRateLimitInMemory(opts);
  }
}

// Sync version retained for callers that can't await (none today).
// Always uses in-memory; prefer checkRateLimitAsync going forward.
export function checkRateLimit(opts: RateLimitOptions): RateLimitResult {
  return checkRateLimitInMemory(opts);
}

// XFF leftmost works correctly only behind a trusted edge proxy that
// strips client-supplied values (Replit's edge proxy does). If the
// origin gets exposed directly, swap this to read xff[length - hops].
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export const HONEYPOT_FIELD = "_company";

// Parses both application/json and form-encoded bodies. Used by public
// POST routes that may receive either JSON (from React fetch handlers)
// or form-encoded payloads (from native <form method="POST">).
export async function parseRequestBody(req: Request): Promise<Record<string, unknown>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return (await req.json().catch(() => ({}))) as Record<string, unknown>;
  }
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return {};
    const out: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) out[k] = typeof v === "string" ? v : "";
    return out;
  }
  return (await req.json().catch(() => ({}))) as Record<string, unknown>;
}

export function isBotSubmission(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const v = (body as Record<string, unknown>)[HONEYPOT_FIELD];
  return v !== undefined && v !== null && v !== "";
}

// Wraps the common pattern: silent 200 on bot hits, 429 on rate-limit
// with Retry-After. Returns ok=true when the caller should proceed.
// Synchronous (in-memory) variant — kept for backward-compatibility.
export function gatePublicPost(
  req: Request,
  body: unknown,
  routeKey: string,
  opts: { limit?: number; windowMs?: number; botSuccessBody?: unknown } = {},
): { ok: true } | { ok: false; response: Response } {
  const limit = opts.limit ?? 10;
  const windowMs = opts.windowMs ?? 60_000;

  if (isBotSubmission(body)) {
    return { ok: false, response: Response.json(opts.botSuccessBody ?? { ok: true }) };
  }

  const r = checkRateLimit({ key: `${routeKey}:${clientIp(req)}`, limit, windowMs });
  if (!r.ok) {
    return {
      ok: false,
      response: rateLimitedResponse(r),
    };
  }
  return { ok: true };
}

// Async variant — uses Redis when REDIS_URL is set so limits are
// shared across instances. Identical contract to gatePublicPost().
export async function gatePublicPostAsync(
  req: Request,
  body: unknown,
  routeKey: string,
  opts: { limit?: number; windowMs?: number; botSuccessBody?: unknown } = {},
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const limit = opts.limit ?? 10;
  const windowMs = opts.windowMs ?? 60_000;

  if (isBotSubmission(body)) {
    return { ok: false, response: Response.json(opts.botSuccessBody ?? { ok: true }) };
  }

  const r = await checkRateLimitAsync({ key: `${routeKey}:${clientIp(req)}`, limit, windowMs });
  if (!r.ok) {
    return {
      ok: false,
      response: rateLimitedResponse(r),
    };
  }
  return { ok: true };
}
