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
  return translated || "A special event is happening in this dining area at the selected time. You may still request it and our host team will review the best available seating with you.";
}

export function buildGuestEventCard(
  series: {
    slug: string;
    title: string;
    heroImageUrl: string | null;
    status: string;
    seriesVisibilityMode: string;
    ticketTypes: Array<{ id: string }>;
  },
  message: string,
  privateMessage = "A private event is happening in this dining area at the selected time. You may still request a reservation and our host team will review other seating or times with you.",
): PublicEventCard {
  const isPublic = series.status === "PUBLISHED" && series.seriesVisibilityMode === "PUBLIC";
  const canJoin = isPublic && series.ticketTypes.length > 0;
  return isPublic
    ? {
        kind: "PUBLIC_EVENT",
        title: series.title,
        imageUrl: series.heroImageUrl,
        href: canJoin ? `/series/${series.slug}` : undefined,
        message,
      }
    : { kind: "PRIVATE_BLOCK", message: privateMessage };
}

function privateEventMessage(locale = "en") {
  if (locale === "es") return "Hay un evento privado en esta área a la hora seleccionada. Aún puedes solicitar una reserva y nuestro equipo revisará otros espacios u horarios contigo.";
  if (locale === "pt") return "Há um evento privado nesta área no horário selecionado. Você ainda pode solicitar uma reserva e nossa equipe avaliará outros espaços ou horários com você.";
  return "A private event is happening in this dining area at the selected time. You may still request a reservation and our host team will review other seating or times with you.";
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
    include: {
      series: {
        select: {
          slug: true,
          title: true,
          heroImageUrl: true,
          status: true,
          seriesVisibilityMode: true,
          ticketTypes: {
            where: { ticketStatus: "ACTIVE", visibilityMode: "VISIBLE" },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!occupancy) return null;

  // An operational block can be public only when the underlying event is
  // actually public. An invite-only/private event must never reveal its name,
  // image or destination to a guest who is merely trying to make a reservation.
  const card = buildGuestEventCard(
    occupancy.series,
    localisedMessage(occupancy, input.locale),
    privateEventMessage(input.locale),
  );
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
