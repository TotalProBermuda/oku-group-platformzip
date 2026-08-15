import { describe, expect, it } from "vitest";
import {
  checkRateLimitAsync,
  rateLimitedResponse,
} from "@/server/rateLimit";

describe("rate limiting", () => {
  it("blocks requests after the configured limit and supplies Retry-After", async () => {
    const key = `test:${crypto.randomUUID()}`;
    expect(await checkRateLimitAsync({ key, limit: 1, windowMs: 60_000 })).toMatchObject({
      ok: true,
      remaining: 0,
    });

    const blocked = await checkRateLimitAsync({ key, limit: 1, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);

    const response = rateLimitedResponse(blocked);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("fails closed for a protected production flow when Redis is absent", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousRedisUrl = process.env.REDIS_URL;
    process.env.NODE_ENV = "production";
    delete process.env.REDIS_URL;
    try {
      const result = await checkRateLimitAsync({
        key: `strict-test:${crypto.randomUUID()}`,
        limit: 1,
        windowMs: 60_000,
        requireDistributed: true,
      });
      expect(result).toMatchObject({ ok: false, unavailable: true });
      expect(rateLimitedResponse(result).status).toBe(503);
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
      else process.env.REDIS_URL = previousRedisUrl;
    }
  });
});
