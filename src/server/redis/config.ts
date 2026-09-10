/**
 * Central Redis connection configuration.
 *
 * REDIS_URL is supported for conventional Redis deployments. Upstash can be
 * configured without ever copying a combined password-bearing URL: save its
 * endpoint and token as separate Replit secrets instead. Neither value is
 * logged or exposed by this module.
 */
export function getRedisUrl(): string | null {
  return process.env.REDIS_URL?.trim() || null;
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
