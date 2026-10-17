import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ requireSession: vi.fn() }));
const db = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    session: { findUnique: vi.fn(), updateMany: vi.fn() },
    ticket: { count: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    order: { count: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    eventSpaceOccupancy: { findMany: vi.fn(), update: vi.fn() },
    eventReservationConflict: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const prisma = { $transaction: vi.fn() };
  return { tx, prisma };
});
const occupancy = vi.hoisted(() => ({ lockOccupancySpaces: vi.fn(), createReservationConflictRecords: vi.fn() }));

vi.mock("@/server/auth/session", () => auth);
vi.mock("@/lib/prisma", () => ({ prisma: db.prisma }));
vi.mock("@/server/series/publicationLifecycle", () => occupancy);
vi.mock("@/server/events/eventOccupancyService", () => occupancy);

import { PATCH } from "@/app/api/v1/admin/sessions/[id]/schedule/route";
import { minimumSafeCapacity, updateSessionScheduleSchema } from "@/server/series/updateSessionSchedule";

const current = {
  id: "session-1",
  startsAt: new Date("2026-11-01T18:00:00.000Z"),
  endsAt: new Date("2026-11-01T21:00:00.000Z"),
  capacity: 100,
  soldCount: 0,
  status: "SCHEDULED",
};
const context = () => ({ params: Promise.resolve({ id: "session-1" }) });
const request = (body: unknown) => new NextRequest("http://localhost/api/v1/admin/sessions/session-1/schedule", {
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const body = {
  startsAt: "2026-11-02T18:00:00.000Z",
  endsAt: "2026-11-02T21:00:00.000Z",
  capacity: 120,
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireSession.mockResolvedValue({ userId: "admin-1", roles: ["SUPERADMIN"] });
  db.prisma.$transaction.mockImplementation((callback: (tx: typeof db.tx) => unknown) => callback(db.tx));
  db.tx.session.findUnique.mockResolvedValue(current);
  db.tx.session.updateMany.mockResolvedValue({ count: 1 });
  db.tx.ticket.count.mockResolvedValue(0);
  db.tx.order.count.mockResolvedValue(0);
  db.tx.eventSpaceOccupancy.findMany.mockResolvedValue([]);
  db.tx.eventReservationConflict.count.mockResolvedValue(0);
  db.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
});

describe("session schedule updates", () => {
  it("validates chronological dates and whole-number capacity", () => {
    expect(updateSessionScheduleSchema.safeParse(body).success).toBe(true);
    expect(updateSessionScheduleSchema.safeParse({ ...body, endsAt: "2026-11-02T17:00:00.000Z" }).success).toBe(false);
    expect(updateSessionScheduleSchema.safeParse({ ...body, capacity: 1.5 }).success).toBe(false);
  });

  it("uses the greater of sold seats and active tickets as the minimum capacity", () => {
    expect(minimumSafeCapacity(7, 5)).toBe(7);
    expect(minimumSafeCapacity(3, 8)).toBe(8);
  });

  it("saves schedule and capacity with audit history", async () => {
    const response = await PATCH(request(body), context());
    expect(response.status).toBe(200);
    expect(db.tx.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "session-1", status: "SCHEDULED", soldCount: { lte: 120 } },
      data: { startsAt: new Date(body.startsAt), endsAt: new Date(body.endsAt), capacity: 120 },
    }));
    expect(db.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "session.schedule.updated" }) }));
  });

  it("rejects non-superadmins", async () => {
    auth.requireSession.mockResolvedValue({ userId: "host-1", roles: ["HOST"] });
    expect((await PATCH(request(body), context())).status).toBe(403);
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("will not reduce capacity below seats sold or issued", async () => {
    db.tx.session.findUnique.mockResolvedValue({ ...current, soldCount: 7 });
    db.tx.ticket.count.mockResolvedValue(8);
    const response = await PATCH(request({ ...body, capacity: 7 }), context());
    expect(response.status).toBe(409);
    expect(db.tx.session.updateMany).not.toHaveBeenCalled();
  });

  it("requires the postponement workflow before changing time after ticket/order history", async () => {
    db.tx.session.findUnique.mockResolvedValue({ ...current, soldCount: 1 });
    db.tx.ticket.count.mockResolvedValue(1);
    const response = await PATCH(request(body), context());
    expect(response.status).toBe(409);
    expect(db.tx.session.updateMany).not.toHaveBeenCalled();
  });
});
