import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  findIntent: vi.fn(), findPayment: vi.fn(), update: vi.fn(), audit: vi.fn(),
  enqueue: vi.fn(), verify: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  paymentIntent: { findFirst: mocks.findIntent },
  payment: { findFirst: mocks.findPayment, updateMany: mocks.update },
  auditLog: { create: mocks.audit },
} }));
vi.mock("@/server/services/ledger/ledgerOutboxService", () => ({ enqueueLedgerEvent: mocks.enqueue }));
vi.mock("@/server/cybersource/webhookSignature", () => ({ verifyCybersourceWebhookSignature: mocks.verify }));
let POST: typeof import("@/app/api/v1/hooks/cybersource/route").POST;
beforeAll(async () => {
  vi.stubEnv("CYBERSOURCE_WEBHOOK_SECRET", "isolated-test-secret");
  ({ POST } = await import("@/app/api/v1/hooks/cybersource/route"));
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockReturnValue(true);
  mocks.findIntent.mockResolvedValue(null);
  mocks.findPayment.mockResolvedValue({ id: "payment-test", status: "INITIATED", order: { id: "order-test", status: "PENDING" } });
  mocks.update.mockResolvedValue({ count: 1 });
  mocks.enqueue.mockResolvedValue(undefined);
  mocks.audit.mockResolvedValue({});
});
const deliver = (type: string) => POST(new NextRequest("http://localhost/api/v1/hooks/cybersource", {
  method: "POST", body: JSON.stringify({ eventType: type, payload: { id: "txn-test" } }),
}));

describe("gateway notification state guards (isolated mocks only)", () => {
  it("rejects invalid signatures before database access", async () => {
    mocks.verify.mockReturnValue(false);
    expect((await deliver("payments.payments.captured")).status).toBe(401);
    expect(mocks.findPayment).not.toHaveBeenCalled();
  });
  it("ignores unknown events without inventing an authorization ledger entry", async () => {
    expect(await (await deliver("payments.future.captured")).json()).toMatchObject({ skipped: "unsupported_event_type" });
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.findPayment).not.toHaveBeenCalled();
  });
  it.each(["REFUNDED", "VOIDED"])("does not revive %s on a delayed capture", async (status) => {
    mocks.findPayment.mockResolvedValue({ id: "payment-test", status, order: { status: "PAID" } });
    expect((await deliver("payments.payments.captured")).status).toBe(200);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not replace success with a delayed decline", async () => {
    mocks.findPayment.mockResolvedValue({ id: "payment-test", status: "SUCCEEDED", order: { status: "PAID" } });
    await deliver("payments.payments.declined");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not call a pending-review authorization successful", async () => {
    await deliver("payments.payments.authorized_pending_review");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("scopes lookup to CyberSource and uses compare-and-set for updates", async () => {
    await deliver("payments.payments.captured");
    expect(mocks.findPayment.mock.calls[0][0].where.provider).toBe("CYBERSOURCE");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "payment-test", provider: "CYBERSOURCE", status: "INITIATED" },
      data: { status: "SUCCEEDED", gatewayTransactionId: "txn-test" },
    });
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it("does not claim an update after a competing state transition", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    expect((await deliver("payments.payments.captured")).status).toBe(503);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
  it("returns retryable failure when durable recording fails", async () => {
    mocks.enqueue.mockRejectedValue(new Error("isolated outbox failure"));
    expect((await deliver("payments.payments.captured")).status).toBe(503);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("can reconcile a duplicate already recorded in the outbox", async () => {
    mocks.enqueue.mockRejectedValue({ code: "P2002" });
    expect((await deliver("payments.payments.captured")).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });
});
