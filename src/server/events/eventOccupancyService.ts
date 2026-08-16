import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export type PublicEventCard = {
  kind: "PUBLIC_EVENT" | "PRIVATE_BLOCK";
  title?: string;
  imageUrl?: string | null;
  href?: string;
  message: string;
};

export class EventOccupancyConflictError extends Error {
  constructor(public readonly card: PublicEventCard) {
    super("The selected space is unavailable because of an event.");
    this.name = "EventOccupancyConflictError";
  }
}

const activeReservationStatuses = [
  "PENDING",
  "CONFIRMED",
  "WAITLISTED",
  "ACKNOWLEDGED",
  "ARRIVED",
  "SEATED",
  "REQUEST_ONLY",
  "PENDING_APPROVAL",
  "PENDING_PAYMENT",
] as const;

function localisedMessage(
  occupancy: { guestMessageEn: string | null; guestMessageEs: string | null; guestMessagePt: string | null },
  locale = "en",
) {
  const translated = locale === "es" ? occupancy.guestMessageEs : locale === "pt" ? occupancy.guestMessagePt : occupancy.guestMessageEn;
  return translated || "This dining area is unavailable at the selected time. Please choose another available area.";
}

/** Half-open interval overlap: an arrival exactly at an event's end is valid. */
export function timeWindowsOverlap(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

/**
 * Finds an operational block applicable to a particular physical space.
 * Intervals are half-open: a booking ending exactly when an event begins does
 * not overlap. blockStartsAt/blockEndsAt already include setup/reset buffers.
 */
export async function findBlockingOccupancy(
  db: Db,
  input: { venueId: string; spaceId?: string | null; startAt: Date; endAt: Date; locale?: string },
) {
  const occupancy = await db.eventSpaceOccupancy.findFirst({
    where: {
      venueId: input.venueId,
      policy: "EXCLUSIVE",
      status: "ACTIVE",
      blockStartsAt: { lt: input.endAt },
      blockEndsAt: { gt: input.startAt },
      // A request without a selected physical space may wait for host review,
      // but it must never bypass an exclusive whole-restaurant block.
      OR: input.spaceId ? [{ scope: "VENUE" }, { scope: "SPACE", spaceId: input.spaceId }] : [{ scope: "VENUE" }],
    },
    orderBy: { blockStartsAt: "asc" },
    include: { series: { select: { slug: true, title: true, heroImageUrl: true, status: true, seriesVisibilityMode: true } } },
  });
  if (!occupancy) return null;

  // An operational block can be public only when the underlying event is
  // actually public. An invite-only/private event must never reveal its name,
  // image or destination to a guest who is merely trying to make a reservation.
  const isPublic = occupancy.series.status === "PUBLISHED" && occupancy.series.seriesVisibilityMode === "PUBLIC";
  const card: PublicEventCard = isPublic
    ? {
        kind: "PUBLIC_EVENT",
        title: occupancy.series.title,
        imageUrl: occupancy.series.heroImageUrl,
        href: `/series/${occupancy.series.slug}`,
        message: localisedMessage(occupancy, input.locale),
      }
    : { kind: "PRIVATE_BLOCK", message: localisedMessage(occupancy, input.locale) };
  return { occupancy, card };
}

export async function assertNoBlockingOccupancy(db: Db, input: Parameters<typeof findBlockingOccupancy>[1]) {
  const conflict = await findBlockingOccupancy(db, input);
  if (conflict) throw new EventOccupancyConflictError(conflict.card);
}

/** Records the reservations operational staff must contact/reaccommodate. */
export async function createReservationConflictRecords(
  tx: Prisma.TransactionClient,
  occupancy: { id: string; venueId: string; scope: "SPACE" | "VENUE"; spaceId: string | null; blockStartsAt: Date; blockEndsAt: Date },
) {
  const reservations = await tx.reservation.findMany({
    where: {
      venueId: occupancy.venueId,
      status: { in: [...activeReservationStatuses] },
      // Do not impose an arbitrary lower date bound here. A long reservation
      // that started earlier can still overlap the event window.
      reservationDate: { lt: occupancy.blockEndsAt },
      ...(occupancy.scope === "SPACE" && occupancy.spaceId
        ? { OR: [{ requestedSpaceId: occupancy.spaceId }, { assignedSpaceId: occupancy.spaceId }] }
        : {}),
    },
    select: { id: true, reservationDate: true, durationMinutes: true },
  });

  const overlapIds = reservations
    .filter((r) => {
      const endAt = new Date(r.reservationDate.getTime() + (r.durationMinutes ?? 120) * 60_000);
      return timeWindowsOverlap(r.reservationDate, endAt, occupancy.blockStartsAt, occupancy.blockEndsAt);
    })
    .map((r) => r.id);

  if (overlapIds.length) {
    await tx.eventReservationConflict.createMany({
      data: overlapIds.map((reservationId) => ({ occupancyId: occupancy.id, reservationId })),
      skipDuplicates: true,
    });
  }
  return overlapIds;
}
