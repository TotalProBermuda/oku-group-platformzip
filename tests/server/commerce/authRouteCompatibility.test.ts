import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ handler: vi.fn(), rate: vi.fn() }));
vi.mock("next-auth", () => ({ default: () => mocks.handler }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/server/redis/config", () => ({ hasRedisConfig: () => true }));
vi.mock("@/server/rateLimit", () => ({
  checkRateLimitAsync: mocks.rate, clientIp: () => "test-ip",
  rateLimitedResponse: () => new Response(null, { status: 429 }),
}));
import { POST } from "@/app/api/auth/[...nextauth]/route";
beforeEach(() => vi.resetAllMocks());
it("passes asynchronous route context to NextAuth after rate limiting", async () => {
  mocks.rate.mockResolvedValue({ ok: true });
  mocks.handler.mockImplementation(async (_req, context) => Response.json(await context.params));
  const result = await POST(new NextRequest("http://localhost/api/auth/signin", { method: "POST" }), { params: Promise.resolve({ nextauth: ["signin"] }) });
  expect(await result.json()).toEqual({ nextauth: ["signin"] });
  expect(mocks.rate).toHaveBeenCalledWith({ key: "nextauth-post:test-ip", limit: 30, windowMs: 60000, requireDistributed: true });
});
it("does not invoke NextAuth when rate limited", async () => {
  mocks.rate.mockResolvedValue({ ok: false });
  const result = await POST(new NextRequest("http://localhost/api/auth/signin", { method: "POST" }), { params: Promise.resolve({ nextauth: ["signin"] }) });
  expect(result.status).toBe(429);
  expect(mocks.handler).not.toHaveBeenCalled();
});
