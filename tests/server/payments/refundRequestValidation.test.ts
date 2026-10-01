import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/auth/adminGuard", () => ({ requireAdminRoles: vi.fn() }));
vi.mock("@/server/payments/reservationPaymentService", () => ({ refundPayment: vi.fn() }));

import { POST } from "@/app/api/v1/admin/payments/intents/[id]/refund/route";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { refundPayment } from "@/server/payments/reservationPaymentService";
import { NextRequest } from "next/server";

const request = (body: string) => new NextRequest("http://localhost/api/v1/admin/payments/intents/test/refund", {
  method: "POST", headers: { "Content-Type": "application/json" }, body,
});
const params = { params: Promise.resolve({ id: "isolated_test_intent" }) };

describe("reservation refund request boundary (no real gateway)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(refundPayment).mockResolvedValue({ ok: true, failureCode: null, failureMessage: null });
  });

  it.each(['{', '', 'null', '[]', '{"amountCents":"100"}', '{"amount":100}',
    '{"amountCents":0}', '{"amountCents":-1}', '{"amountCents":0.5}', '{"amountCents":null}'])(
    "rejects %s rather than defaulting to a full refund", async (body) => {
      expect((await POST(request(body), params)).status).toBe(400);
      expect(refundPayment).not.toHaveBeenCalled();
    },
  );

  it("retains explicit full-refund and integer partial-refund requests", async () => {
    expect((await POST(request('{}'), params)).status).toBe(200);
    expect(refundPayment).toHaveBeenLastCalledWith({ paymentIntentId: "isolated_test_intent", amountCents: undefined });
    expect((await POST(request('{"amountCents":100}'), params)).status).toBe(200);
    expect(refundPayment).toHaveBeenLastCalledWith({ paymentIntentId: "isolated_test_intent", amountCents: 100 });
    expect(requireAdminRoles).toHaveBeenCalledWith(expect.anything(), ["SUPERADMIN", "ADMIN_FINANCE"]);
  });

  it("does not call the refund service when authorization fails", async () => {
    vi.mocked(requireAdminRoles).mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    expect((await POST(request('{}'), params)).status).toBe(403);
    expect(refundPayment).not.toHaveBeenCalled();
  });
});
