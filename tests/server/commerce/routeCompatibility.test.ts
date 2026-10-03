import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), optional: vi.fn(), permission: vi.fn(), admin: vi.fn(),
  findOrders: vi.fn(), findReservation: vi.fn(),
}));
vi.mock("@/server/auth/session", () => ({ requireSession: mocks.session, getOptionalSession: mocks.optional }));
vi.mock("@/lib/rbac", () => ({ requirePermission: mocks.permission }));
vi.mock("@/server/auth/adminGuard", () => ({ requireAdminRoles: mocks.admin }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  order: { findMany: mocks.findOrders }, reservation: { findUnique: mocks.findReservation },
} }));
import { GET as customerOrders } from "@/app/api/v1/orders/route";
import { GET as seriesOrders } from "@/app/api/v1/admin/series/[id]/orders/route";
import { GET as userOrders } from "@/app/api/v1/admin/users/[id]/orders/route";
import { PATCH as partySize } from "@/app/api/v1/host/bookings/[id]/party-size/route";

const request = () => new NextRequest("http://localhost/test", {
  method: "PATCH", body: JSON.stringify({ partySize: 2 }),
});
describe("route compatibility and order query contracts", () => {
  beforeEach(() => { vi.resetAllMocks();
    mocks.session.mockResolvedValue({ userId: "staff", roles: ["SUPERADMIN"] });
    mocks.optional.mockResolvedValue({ userId: "customer" });
  });
  it("awaits host URL params before querying the reservation", async () => {
    mocks.findReservation.mockResolvedValue(null);
    expect((await partySize(request(), { params: Promise.resolve({ id: "booking-1" }) })).status).toBe(404);
    expect(mocks.findReservation).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "booking-1" } }));
  });
  it("keeps host permission enforcement before database access", async () => {
    mocks.permission.mockImplementation(() => { throw Object.assign(new Error("Forbidden"), { status: 403 }); });
    expect((await partySize(request(), { params: Promise.resolve({ id: "booking-1" }) })).status).toBe(403);
    expect(mocks.findReservation).not.toHaveBeenCalled();
  });
  it("queries singular payment while retaining payments array in customer response", async () => {
    mocks.findOrders.mockResolvedValue([{ id: "one", payment: { status: "SUCCEEDED", amountCents: 227 } }, { id: "two", payment: null }]);
    const response = await customerOrders(request());
    expect(mocks.findOrders).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "customer" }, include: expect.objectContaining({ payment: expect.any(Object) }) }));
    expect(mocks.findOrders.mock.calls[0][0].include).not.toHaveProperty("payments");
    expect((await response.json()).orders).toEqual([{ id: "one", payments: [{ status: "SUCCEEDED", amountCents: 227 }] }, { id: "two", payments: [] }]);
  });
  it("blocks unauthenticated customer order reads", async () => {
    mocks.optional.mockResolvedValue(null);
    expect((await customerOrders(request())).status).toBe(401);
    expect(mocks.findOrders).not.toHaveBeenCalled();
  });
  it.each([seriesOrders, userOrders])("queries ticketStatus and preserves status response", async handler => {
    mocks.findOrders.mockResolvedValue([{ id: "order", status: "PAID", totalCents: 227, tickets: [{ id: "ticket", ticketStatus: "ISSUED" }] }]);
    const response = await handler(request(), { params: Promise.resolve({ id: "scope" }) });
    expect(response.status).toBe(200);
    expect(mocks.findOrders.mock.calls[0][0].include.tickets.select).toEqual({ id: true, ticketStatus: true });
    const body = await response.json();
    expect((Array.isArray(body.data) ? body.data : body.data.orders)[0].tickets).toEqual([{ id: "ticket", status: "ISSUED" }]);
  });
});
