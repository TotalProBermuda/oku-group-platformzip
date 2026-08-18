import { beforeEach, describe, expect, it, vi } from "vitest";

const sessionMock = vi.hoisted(() => ({ requireSession: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ requireSession: sessionMock.requireSession }));
const occupancyMock = vi.hoisted(() => ({ createReservationConflictRecords: vi.fn(), lockOccupancySpaces: vi.fn() }));
vi.mock("@/server/events/eventOccupancyService", () => ({ createReservationConflictRecords: occupancyMock.createReservationConflictRecords }));
vi.mock("@/server/series/publicationLifecycle", () => ({ lockOccupancySpaces: occupancyMock.lockOccupancySpaces }));

const dbMock = vi.hoisted(() => {
  const tx = {
    session: { create: vi.fn() },
    eventSpaceOccupancy: { create: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { createMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      series: { findUnique: vi.fn() },
      $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: dbMock.prisma }));

import { POST } from "@/app/api/v1/admin/series/[id]/sessions/route";

const validBody = { title: "Terrace dinner", startsAt: "2026-09-01T18:00:00.000Z", endsAt: "2026-09-01T21:00:00.000Z", capacity: 40 };
const request = (body: unknown) => new Request("http://localhost/api/v1/admin/series/series-1/sessions", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const context = () => ({ params: Promise.resolve({ id: "series-1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  sessionMock.requireSession.mockResolvedValue({ userId: "fb-director-1", roles: ["FB_DIRECTOR"] });
  dbMock.prisma.series.findUnique.mockResolvedValue({ id: "series-1", venueId: "venue-1", spaceId: "space-1", status: "DRAFT" });
  dbMock.tx.session.create.mockResolvedValue({ id: "event-1", seriesId: "series-1", ...validBody });
  dbMock.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  dbMock.tx.eventSpaceOccupancy.create.mockResolvedValue({ id: "occupancy-1", venueId: "venue-1", scope: "SPACE", spaceId: "space-1" });
  dbMock.tx.user.findMany.mockResolvedValue([]);
  dbMock.tx.notification.createMany.mockResolvedValue({ count: 0 });
  occupancyMock.createReservationConflictRecords.mockResolvedValue([]);
});

describe("POST /api/v1/admin/series/[id]/sessions", () => {
  it("creates an event and records the action", async () => {
    const response = await POST(request(validBody), context());
    expect(response.status).toBe(201);
    expect(dbMock.tx.session.create).toHaveBeenCalledWith({ data: expect.objectContaining({ seriesId: "series-1", capacity: 40, status: "SCHEDULED" }) });
    expect(dbMock.tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "EXPERIENCE_SESSION_CREATED" }) });
  });

  it("rejects invalid timing without writing", async () => {
    const response = await POST(request({ ...validBody, endsAt: "2026-09-01T17:00:00.000Z" }), context());
    expect(response.status).toBe(400);
    expect(dbMock.tx.session.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the series does not exist", async () => {
    dbMock.prisma.series.findUnique.mockResolvedValue(null);
    const response = await POST(request(validBody), context());
    expect(response.status).toBe(404);
  });

  it("creates a linked draft dining block in the same transaction", async () => {
    const response = await POST(request({ ...validBody, occupancyScope: "SPACE", setupMinutes: 30, resetMinutes: 15 }), context());
    expect(response.status).toBe(201);
    expect(occupancyMock.lockOccupancySpaces).toHaveBeenCalledWith(dbMock.tx, "venue-1", "SPACE", "space-1");
    expect(dbMock.tx.eventSpaceOccupancy.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        seriesId: "series-1",
        sessionId: "event-1",
        status: "DRAFT",
        scope: "SPACE",
        setupMinutes: 30,
        resetMinutes: 15,
      }),
    });
  });
});
