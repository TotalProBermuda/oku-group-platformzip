import { beforeEach, describe, expect, it, vi } from "vitest";

const occupancyMock = vi.hoisted(() => ({ createReservationConflictRecords: vi.fn() }));
vi.mock("@/server/events/eventOccupancyService", () => occupancyMock);

import {
  assertSeriesReadyForPublication,
  SeriesPublicationError,
  syncSeriesOccupanciesForStatus,
} from "@/server/series/publicationLifecycle";

function transactionMock() {
  return {
    series: { findUnique: vi.fn() },
    restaurantSpace: { findMany: vi.fn().mockResolvedValue([{ id: "space-1" }]) },
    eventSpaceOccupancy: { findMany: vi.fn(), update: vi.fn() },
    $executeRaw: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  occupancyMock.createReservationConflictRecords.mockResolvedValue([]);
});

describe("series publication lifecycle", () => {
  it("rejects publishing an incomplete series with actionable issues", async () => {
    const tx = transactionMock();
    tx.series.findUnique.mockResolvedValue({
      id: "series-1",
      venueId: null,
      hostType: "PARTNER",
      influencerId: null,
      partnerId: null,
      _count: { sessions: 0, ticketTypes: 0 },
    });
    await expect(assertSeriesReadyForPublication(tx as never, "series-1")).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.objectContaining({ field: "venueId" }),
        expect.objectContaining({ field: "sessions" }),
        expect.objectContaining({ field: "ticketTypes" }),
        expect.objectContaining({ field: "partnerId" }),
      ]),
    } satisfies Partial<SeriesPublicationError>);
  });

  it("accepts a configured series", async () => {
    const tx = transactionMock();
    tx.series.findUnique.mockResolvedValue({
      id: "series-1",
      venueId: "venue-1",
      hostType: "PARTNER",
      influencerId: null,
      partnerId: "partner-1",
      _count: { sessions: 1, ticketTypes: 1 },
    });
    await expect(assertSeriesReadyForPublication(tx as never, "series-1")).resolves.toMatchObject({ id: "series-1" });
  });

  it("activates draft occupancy and checks reservation conflicts when publishing", async () => {
    const tx = transactionMock();
    tx.eventSpaceOccupancy.findMany.mockResolvedValue([{ id: "occ-1", venueId: "venue-1", scope: "SPACE", spaceId: "space-1" }]);
    tx.eventSpaceOccupancy.update.mockResolvedValue({ id: "occ-1", venueId: "venue-1", scope: "SPACE", spaceId: "space-1", status: "ACTIVE", blockStartsAt: new Date(), blockEndsAt: new Date() });
    await syncSeriesOccupanciesForStatus(tx as never, "series-1", "PUBLISHED");
    expect(tx.eventSpaceOccupancy.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { in: ["DRAFT", "PAUSED"] } }) }));
    expect(tx.eventSpaceOccupancy.update).toHaveBeenCalledWith({ where: { id: "occ-1" }, data: { status: "ACTIVE" } });
    expect(occupancyMock.createReservationConflictRecords).toHaveBeenCalledOnce();
  });

  it("pauses active occupancy when a series is unpublished", async () => {
    const tx = transactionMock();
    tx.eventSpaceOccupancy.findMany.mockResolvedValue([{ id: "occ-1", venueId: "venue-1", scope: "VENUE", spaceId: null }]);
    tx.eventSpaceOccupancy.update.mockResolvedValue({});
    await syncSeriesOccupanciesForStatus(tx as never, "series-1", "DRAFT");
    expect(tx.eventSpaceOccupancy.update).toHaveBeenCalledWith({ where: { id: "occ-1" }, data: { status: "PAUSED" } });
  });
});
