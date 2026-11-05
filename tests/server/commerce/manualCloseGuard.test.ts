import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), reservation: vi.fn(), manual: vi.fn(), transaction: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireSession: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  reservation: { findUnique: mocks.reservation }, tableSession: { findFirst: mocks.manual }, $transaction: mocks.transaction,
} }));
import { POST } from "@/app/api/v1/host/bookings/[id]/close/route";
const request = () => new NextRequest("http://localhost/test", { method: "POST", body: JSON.stringify({ tableTotalCents: 20000 }) });
beforeEach(() => { vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "admin", roles: ["SUPERADMIN"] });
  mocks.manual.mockResolvedValue(null);
});
it.each([0, 10000])("selects actual revenue and blocks overwriting an INVU close (%s cents)", async actualRevenueCents => {
  mocks.reservation.mockResolvedValue({ id: "booking", actualRevenueCents, attributionSession: null });
  const response = await POST(request(), { params: Promise.resolve({ id: "booking" }) });
  expect(response.status).toBe(409);
  expect(mocks.reservation.mock.calls[0][0].select.actualRevenueCents).toBe(true);
  expect((await response.json()).error).toContain("already closed from INVU");
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("preserves assigned-host authorization before any close operation", async () => {
  mocks.auth.mockResolvedValue({ userId: "other-host", roles: ["HOST"] });
  mocks.reservation.mockResolvedValue({ id: "booking", assignedHost: { userId: "assigned-host" } });
  expect((await POST(request(), { params: Promise.resolve({ id: "booking" }) })).status).toBe(403);
  expect(mocks.manual).not.toHaveBeenCalled(); expect(mocks.transaction).not.toHaveBeenCalled();
});
