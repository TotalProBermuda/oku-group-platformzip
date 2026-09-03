import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
  findAttribution: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/rbac", () => ({ requirePermission: vi.fn() }));
vi.mock("@/server/services/invu/invuAuditService", () => ({
  recordIntegrationAudit: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    attributionSession: { findFirst: mocks.findAttribution },
    restaurantHostProfile: { findUnique: vi.fn() },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/v1/host/table-open-bind/route";

function request() {
  return new NextRequest("http://localhost/api/v1/host/table-open-bind", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ attributionSessionId: "attr-1", invuOrderId: "4831" }),
  });
}

describe("INVU table-open binding service stage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({ roles: ["SUPERADMIN"], userId: "admin-1" });
  });

  it.each(["CAPTURED", "CANCELED", "EXPIRED"])(
    "rejects a first bind while attribution is %s",
    async (status) => {
      mocks.findAttribution.mockResolvedValue({
        id: "attr-1",
        venueId: "venue-1",
        bookingCode: "OKU-2026-TEST",
        status,
        hostUserId: null,
        createdByUserId: null,
        tableSession: { id: "table-session-1", openedInvuOrderId: null },
      });

      const response = await POST(request());

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        code: "INVU_BIND_REQUIRES_SEATED_GUEST",
      });
      expect(mocks.transaction).not.toHaveBeenCalled();
    }
  );

  it("allows an idempotent retry after the session has already been bound", async () => {
    mocks.findAttribution.mockResolvedValue({
      id: "attr-1",
      venueId: "venue-1",
      bookingCode: "OKU-2026-TEST",
      status: "POS_BIND_INTENT_RECORDED",
      hostUserId: null,
      createdByUserId: null,
      tableSession: { id: "table-session-1", openedInvuOrderId: "4831" },
    });
    mocks.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
      operationalBinding: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockResolvedValue({ id: "binding-1", bindingType: "TABLE_OPEN_BINDING" }),
      },
      tableSession: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn(),
      },
      attributionSession: { updateMany: vi.fn() },
    }));

    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ ok: true, bindingId: "binding-1" });
  });
});
