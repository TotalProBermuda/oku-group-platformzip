import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), updateMany: vi.fn(), release: vi.fn(), event: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { order: { findMany: mocks.findMany, updateMany: mocks.updateMany }, orderEvent: { create: mocks.event } } }));
vi.mock("@/server/commerce/capacity", () => ({ releaseCatalogCapacity: mocks.release }));
import { expireCheckoutHoldsForSession } from "@/server/commerce/checkoutHold";

describe("checkout hold cleanup", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.findMany.mockResolvedValue([{ id: "o", sessionId: "s", lineItems: [{ ticketTypeId: "t", addonId: null, qty: 1 }] }]); });
  it("excludes orders with payment claims in both lookup and conditional cancellation", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expireCheckoutHoldsForSession("s");
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ payment: { is: null } }) }));
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "o", status: "PENDING", payment: { is: null } } }));
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it("releases capacity only after successfully claiming expiry", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    await expireCheckoutHoldsForSession("s");
    expect(mocks.release).toHaveBeenCalledWith({ sessionId: "s", ticketItems: [{ id: "t", qty: 1 }], addonItems: [] });
    expect(mocks.event).toHaveBeenCalledOnce();
  });
});
