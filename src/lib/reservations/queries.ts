import { prisma } from "@/lib/prisma";
import type { ReservationStatus, ConversionStage } from "@prisma/client";

export async function getVenueWithZones(slug = "gold-house") {
  return prisma.venue.findUnique({
    where: { slug },
    include: {
      zones: {
        orderBy: { sortOrder: "asc" },
        include: { tables: { where: { isActive: true } } },
      },
    },
  });
}

export async function getReservationsByDate(venueId: string, date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return prisma.reservation.findMany({
    where: {
      venueId,
      reservationDate: { gte: start, lte: end },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
    },
    include: {
      zone: true,
      guestProfile: true,
      handoffs: { orderBy: { createdAt: "desc" }, take: 1 },
      attributions: { include: { referrer: true } },
    },
    orderBy: { reservationDate: "asc" },
  });
}

export async function getPendingHandoffs(venueId: string) {
  return prisma.reservationHandoff.findMany({
    where: {
      reservation: { venueId },
      handoffStatus: { in: ["PENDING", "ACKNOWLEDGED", "GUEST_EN_ROUTE"] },
    },
    include: {
      reservation: {
        include: {
          zone: true,
          attributions: { include: { referrer: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getActiveWaitlist(venueId: string) {
  return prisma.resWaitlistEntry.findMany({
    where: { venueId, status: { in: ["ACTIVE", "READY"] } },
    include: { zone: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function generateConfirmationCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  // Ensure uniqueness
  const existing = await prisma.reservation.findUnique({ where: { confirmationCode: code } });
  if (existing) return generateConfirmationCode();
  return code;
}
