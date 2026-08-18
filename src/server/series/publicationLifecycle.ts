import type { Prisma, SeriesStatus } from "@prisma/client";
import { createReservationConflictRecords } from "@/server/events/eventOccupancyService";

export type PublicationIssue = {
  field: "venueId" | "sessions" | "ticketTypes" | "influencerId" | "partnerId";
  message: string;
};

export class SeriesPublicationError extends Error {
  status = 409;
  constructor(public issues: PublicationIssue[]) {
    super(issues[0]?.message ?? "This series is not ready to publish.");
    this.name = "SeriesPublicationError";
  }
}

export async function assertSeriesReadyForPublication(tx: Prisma.TransactionClient, seriesId: string) {
  const series = await tx.series.findUnique({
    where: { id: seriesId },
    select: {
      id: true,
      venueId: true,
      hostType: true,
      influencerId: true,
      partnerId: true,
      _count: { select: { sessions: true, ticketTypes: true } },
    },
  });
  if (!series) {
    const error = new Error("Series not found.") as Error & { status: number };
    error.status = 404;
    throw error;
  }

  const issues: PublicationIssue[] = [];
  if (!series.venueId) issues.push({ field: "venueId", message: "Select an operational venue before publishing." });
  if (series._count.sessions < 1) issues.push({ field: "sessions", message: "Create at least one event session before publishing." });
  if (series._count.ticketTypes < 1) issues.push({ field: "ticketTypes", message: "Create at least one ticket type before publishing." });
  if (series.hostType === "INFLUENCER" && !series.influencerId) {
    issues.push({ field: "influencerId", message: "Select the influencer hosting this series before publishing." });
  }
  if (series.hostType === "PARTNER" && !series.partnerId) {
    issues.push({ field: "partnerId", message: "Select the partner hosting this series before publishing." });
  }
  if (issues.length) throw new SeriesPublicationError(issues);
  return series;
}

export async function lockOccupancySpaces(
  tx: Prisma.TransactionClient,
  venueId: string,
  scope: "SPACE" | "VENUE",
  spaceId: string | null,
) {
  const ids = scope === "VENUE"
    ? (await tx.restaurantSpace.findMany({ where: { venueId }, select: { id: true }, orderBy: { id: "asc" } })).map((space) => space.id)
    : spaceId ? [spaceId] : [];
  for (const id of ids) await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${id}))`;
}

export async function syncSeriesOccupanciesForStatus(
  tx: Prisma.TransactionClient,
  seriesId: string,
  status: SeriesStatus,
) {
  const activating = status === "PUBLISHED";
  const occupancies = await tx.eventSpaceOccupancy.findMany({
    where: {
      seriesId,
      status: activating ? { in: ["DRAFT", "PAUSED"] } : "ACTIVE",
    },
    orderBy: [{ venueId: "asc" }, { spaceId: "asc" }],
  });

  for (const occupancy of occupancies) {
    await lockOccupancySpaces(tx, occupancy.venueId, occupancy.scope, occupancy.spaceId);
    if (activating) {
      const active = await tx.eventSpaceOccupancy.update({ where: { id: occupancy.id }, data: { status: "ACTIVE" } });
      await createReservationConflictRecords(tx, active);
    } else {
      const occupancyStatus = status === "POSTPONED"
        ? "POSTPONED"
        : status === "CANCELLED" || status === "ARCHIVED"
          ? "CANCELLED"
          : "PAUSED";
      await tx.eventSpaceOccupancy.update({ where: { id: occupancy.id }, data: { status: occupancyStatus } });
    }
  }
}
