import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ create: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { orderEvent: db } }));
import { bindChallenge, requireBoundChallenge } from "@/server/cybersource/challengeBinding";
const context = { orderId: "order-1", amountCents: 227, currency: "USD", transientToken: "private-card-token", billing: { address1: "private-address" } };
beforeEach(() => vi.clearAllMocks());
describe("server-bound bank challenges", () => {
  it("binds the challenge without storing card tokens or billing", async () => {
    await bindChallenge(context, { authenticationTransactionId: "auth-1", cardType: "002" });
    const payload = db.create.mock.calls[0][0].data.eventPayload;
    expect(JSON.stringify(payload)).not.toContain("private");
    db.findFirst.mockResolvedValue({ eventPayload: payload });
    await expect(requireBoundChallenge(context, "auth-1")).resolves.toEqual({ authenticationTransactionId: "auth-1", cardType: "002" });
    for (const changed of [{ ...context, orderId: "other" }, { ...context, amountCents: 999 }, { ...context, transientToken: "other" }, { ...context, billing: {} }]) {
      await expect(requireBoundChallenge(changed, "auth-1")).rejects.toThrow();
    }
    await expect(requireBoundChallenge(context, "other-auth")).rejects.toThrow();
    db.findFirst.mockResolvedValue({ eventPayload: { ...payload, expiresAt: Date.now() - 1 } });
    await expect(requireBoundChallenge(context, "auth-1")).rejects.toThrow();
  });
});
