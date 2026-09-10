/**
 * Central Redis connection configuration.
 *
 * REDIS_URL is supported for conventional Redis deployments. Upstash can be
 * configured without ever copying a combined password-bearing URL: save its
 * endpoint and token as separate Replit secrets instead. Neither value is
 * logged or exposed by this module.
 */
export function getRedisUrl(): string | null {
  const directUrl = process.env.REDIS_URL?.trim();
  if (directUrl) return directUrl;

  const host = process.env.UPSTASH_REDIS_HOST?.trim();
  const token = process.env.UPSTASH_REDIS_TOKEN?.trim();
  if (!host || !token) return null;

  const normalizedHost = host.replace(/^rediss?:\/\//, "").replace(/\/$/, "");
  return `rediss://default:${encodeURIComponent(token)}@${normalizedHost}:6379`;
}

export function hasRedisConfig(): boolean {
  return getRedisUrl() !== null;
}
