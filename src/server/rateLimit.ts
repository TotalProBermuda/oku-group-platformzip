// Per-key fixed-window rate limiter + honeypot helpers for public POST
// endpoints. Production prefers Redis because the counter increment and TTL
// are handled in one small, atomic operation across every app instance. The
// existing Postgres limiter remains a safe, shared fallback if Redis has a
// short outage; public routes never silently become per-instance limited.

import { createHmac, randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import type { Redis as IORedis } from "ioredis";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();
const SWEEP_MS = 60_000;
let lastSweep = Date.now();

const PRUNE_INTERVAL_MS = 10 * 60_000;
let nextPruneAt = 0;

let redis: IORedis | null = null;
let redisUnavailableUntil = 0;
const REDIS_RETRY_DELAY_MS = 30_000;

function getRedis(): IORedis | null {
  if (!process.env.REDIS_URL || Date.now() < redisUnavailableUntil) return null;
  if (redis) return redis;
  try {
    // ioredis is already a production dependency through BullMQ. Require it
    // lazily so local tooling does not make a network connection on import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const IORedisCtor = require("ioredis").default ?? require("ioredis");
    redis = new IORedisCtor(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    redis.on("error", () => {
      // The database fallback below remains authoritative during a temporary
      // Redis failure. Do not log a request key, IP address, or connection URL.
      redis = null;
      redisUnavailableUntil = Date.now() + REDIS_RETRY_DELAY_MS;
    });
    return redis;
  } catch {
    redisUnavailableUntil = Date.now() + REDIS_RETRY_DELAY_MS;
    return null;
  }
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
  /** In production, reject instead of silently falling back to per-instance memory. */
  requireDistributed?: boolean;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds?: number;
  remaining: number;
  unavailable?: boolean;
}

/** Build the standard rate-limit response for routes that do not accept a body. */
export function rateLimitedResponse(result: RateLimitResult): Response {
  return Response.json(
    {
      ok: false,
      error: result.unavailable
        ? "Request protection is temporarily unavailable. Please try again shortly."
        : "Too many requests. Please try again shortly.",
    },
    {
      status: result.unavailable ? 503 : 429,
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

function stableRateLimitSecret(): string | null {
  // APP_ENCRYPTION_KEY is already mandatory for encrypted production data.
  // Auth secrets are a safe compatibility fallback for older environments.
  return process.env.APP_ENCRYPTION_KEY ?? process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? null;
}

function hashRateLimitKey(key: string): string | null {
  const secret = stableRateLimitSecret();
  return secret ? createHmac("sha256", secret).update(key).digest("hex") : null;
}

async function checkRateLimitRedis(client: IORedis, opts: RateLimitOptions): Promise<RateLimitResult> {
  const keyHash = hashRateLimitKey(opts.key);
  if (!keyHash) throw new Error("No stable secret available for Redis rate-limit key hashing");

  // A Lua script prevents the INCR/EXPIRE split that can leave a counter
  // without an expiry if a process stops between two separate commands.
  const reply = (await client.eval(
    `local count = redis.call("INCR", KEYS[1])\n` +
      `if count == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]) end\n` +
      `return { count, redis.call("PTTL", KEYS[1]) }`,
    1,
    `oku:rate-limit:${keyHash}`,
    String(Math.max(1, opts.windowMs)),
  )) as [number, number];
  const [count, ttlMs] = reply;
  if (!Number.isInteger(count)) throw new Error("Redis rate-limit counter did not return a count");
  if (count > opts.limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((ttlMs > 0 ? ttlMs : opts.windowMs) / 1000)),
      remaining: 0,
    };
  }
  return { ok: true, remaining: Math.max(0, opts.limit - count) };
}

function pruneExpiredBuckets(now: Date) {
  if (now.getTime() < nextPruneAt) return;
  nextPruneAt = now.getTime() + PRUNE_INTERVAL_MS;
  // Best effort only. Expired buckets never affect a new window because the
  // uniqueness key includes windowStart; this keeps cleanup off the hot path.
  void prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: now } } }).catch(() => {});
}

async function checkRateLimitDatabase(opts: RateLimitOptions): Promise<RateLimitResult | null> {
  const keyHash = hashRateLimitKey(opts.key);
  if (!keyHash) return null;

  const now = new Date();
  const windowStartMs = Math.floor(now.getTime() / opts.windowMs) * opts.windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + opts.windowMs);
  pruneExpiredBuckets(now);

  // PostgreSQL performs this upsert atomically, including under simultaneous
  // requests from separate Replit instances. The raw request key is HMACed
  // before it reaches the database, so this table never holds an IP address.
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket"
      ("id", "keyHash", "windowStart", "count", "expiresAt", "createdAt", "updatedAt")
    VALUES
      (${randomUUID()}, ${keyHash}, ${windowStart}, 1, ${expiresAt}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT ("keyHash", "windowStart")
    DO UPDATE SET
      "count" = "RateLimitBucket"."count" + 1,
      "updatedAt" = CURRENT_TIMESTAMP
    RETURNING "count";
  `;
  const count = rows[0]?.count;
  if (!Number.isInteger(count)) throw new Error("Rate limit counter did not return a count");
  if (count > opts.limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
      remaining: 0,
    };
  }
  return { ok: true, remaining: Math.max(0, opts.limit - count) };
}

export async function checkRateLimitAsync(opts: RateLimitOptions): Promise<RateLimitResult> {
  const mustBeDistributed = opts.requireDistributed && process.env.NODE_ENV === "production";

  const redisClient = getRedis();
  if (redisClient) {
    try {
      return await checkRateLimitRedis(redisClient, opts);
    } catch {
      redis = null;
      redisUnavailableUntil = Date.now() + REDIS_RETRY_DELAY_MS;
    }
  }
  try {
    const databaseResult = await checkRateLimitDatabase(opts);
    if (databaseResult) return databaseResult;
  } catch {
    // The caller below decides whether a local fallback is acceptable.
  }
  // Authentication, public chat, and payment routes must not become
  // per-instance limited in production if the shared database is unavailable.
  return mustBeDistributed
    ? { ok: false, retryAfterSeconds: 60, remaining: 0, unavailable: true }
    : checkRateLimitInMemory(opts);
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
  opts: { limit?: number; windowMs?: number; botSuccessBody?: unknown; requireDistributed?: boolean } = {},
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

// Async variant — uses the production database so limits are shared across
// instances. Identical contract to gatePublicPost().
export async function gatePublicPostAsync(
  req: Request,
  body: unknown,
  routeKey: string,
  opts: {
    limit?: number;
    windowMs?: number;
    botSuccessBody?: unknown;
    /** Fail closed in production when the shared database limiter is unavailable. */
    requireDistributed?: boolean;
  } = {},
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const limit = opts.limit ?? 10;
  const windowMs = opts.windowMs ?? 60_000;

  if (isBotSubmission(body)) {
    return { ok: false, response: Response.json(opts.botSuccessBody ?? { ok: true }) };
  }

  const r = await checkRateLimitAsync({
    key: `${routeKey}:${clientIp(req)}`,
    limit,
    windowMs,
    requireDistributed: opts.requireDistributed,
  });
  if (!r.ok) {
    return {
      ok: false,
      response: rateLimitedResponse(r),
    };
  }
  return { ok: true };
}
