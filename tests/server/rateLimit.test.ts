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
});
