import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { order: { findUnique: vi.fn() } } }));
vi.mock("@/server/auth/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn() }));
vi.mock("@/server/commerce/commissions", () => ({ reverseCommissionForRefund: vi.fn() }));
vi.mock("@/server/commerce/capacity", () => ({ releaseCapacity: vi.fn() }));
vi.mock("@/server/payments/providers", () => ({ getProviderAdapterSafe: vi.fn() }));

import { POST } from "@/app/api/v1/admin/orders/refund/route";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { getProviderAdapterSafe } from "@/server/payments/providers";

const request = (body: string) => new Request("http://localhost/api/v1/admin/orders/refund", {
  method: "POST", headers: { "Content-Type": "application/json" }, body,
});

describe("ticket refund boundary — isolated, no gateway", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireSession).mockResolvedValue({ userId: "test_admin", roles: ["SUPERADMIN"] });
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null);
  });

  it.each([
    "{", "null", "[]", "{}",
    JSON.stringify({ orderId: "", amountCents: 100 }),
    JSON.stringify({ orderId: "   ", amountCents: 100 }),
    JSON.stringify({ orderId: "test", amountCents: "100" }),
    JSON.stringify({ orderId: "test", amountCents: 0 }),
    JSON.stringify({ orderId: "test", amountCents: -1 }),
    JSON.stringify({ orderId: "test", amountCents: 0.5 }),
    JSON.stringify({ orderId: "test", amountCents: Number.MAX_SAFE_INTEGER + 1 }),
    JSON.stringify({ orderId: "test", amountCents: 100, amount: 10000 }),
  ])("rejects invalid or ambiguous request %s before DB/gateway access", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(getProviderAdapterSafe).not.toHaveBeenCalled();
  });

  it("accepts the existing valid contract and keeps permission enforcement", async () => {
    const response = await POST(request(JSON.stringify({ orderId: " test_order ", amountCents: 100, reason: "Test" })));
    expect(response.status).toBe(404);
    expect(prisma.order.findUnique).toHaveBeenCalledWith({ where: { id: "test_order" }, include: { payment: true, lineItems: true } });
    expect(requirePermission).toHaveBeenCalledWith(["SUPERADMIN"], "admin:payments:refund");
    expect(getProviderAdapterSafe).not.toHaveBeenCalled();
  });

  it("does not inspect orders when permission is denied", async () => {
    vi.mocked(requirePermission).mockImplementation(() => { throw new Error("Forbidden"); });
    await expect(POST(request('{"orderId":"test","amountCents":100}'))).rejects.toThrow("Forbidden");
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
    expect(getProviderAdapterSafe).not.toHaveBeenCalled();
  });
});
