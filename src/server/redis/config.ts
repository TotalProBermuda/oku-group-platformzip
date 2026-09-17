/**
 * Central Redis connection configuration.
 *
 * REDIS_URL is supported for conventional Redis deployments. Upstash can be
 * configured without ever copying a combined password-bearing URL: save its
 * endpoint and token as separate Replit secrets instead. When those TCP
 * secrets are present we construct an in-memory rediss:// URL for BullMQ.
 * Neither value is logged or exposed by this module.
 */
export function getRedisUrl(): string | null {
  const explicitUrl = process.env.REDIS_URL?.trim();
  if (explicitUrl) return explicitUrl;

  const host = process.env.UPSTASH_REDIS_HOST?.trim();
  const token = process.env.UPSTASH_REDIS_TOKEN?.trim();
  if (!host || !token) return null;

  // Upstash's TCP endpoint requires TLS. The username for its Redis endpoint
  // is always `default`; encode the token because it may contain URL-reserved
  // characters. This value exists only in process memory.
  const normalizedHost = host
    .replace(/^rediss?:\/\//, "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  return `rediss://default:${encodeURIComponent(token)}@${normalizedHost}`;
}

/**
 * BullMQ opens several long-lived Redis connections as soon as its queue
 * modules are imported. Keep that optional infrastructure explicitly opt-in
 * in production: a quota-exhausted Redis plan must not prevent the web app
 * from starting. Commerce callers already have inline/database fallbacks.
 *
 * Set ENABLE_REDIS_QUEUE=true only after the Redis service has capacity and
 * the background worker is intended to run.
 */
export function getQueueRedisUrl(): string | null {
  return process.env.ENABLE_REDIS_QUEUE === "true" ? getRedisUrl() : null;
}

export interface UpstashRedisRestConfig {
  url: string;
  token: string;
}

export function getUpstashRedisRestConfig(): UpstashRedisRestConfig | null {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() || (() => {
    const host = process.env.UPSTASH_REDIS_HOST?.trim();
    return host ? `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}` : null;
  })();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.UPSTASH_REDIS_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

export function hasRedisConfig(): boolean {
  return getUpstashRedisRestConfig() !== null;
}
