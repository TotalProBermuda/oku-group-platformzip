import { prisma } from "@/lib/prisma";
import HostMobileDashboard from "@/components/host/HostMobileDashboard";
import type { ComponentProps } from "react";

export const dynamic = "force-dynamic";

async function getData() {
  const venue = await prisma.venue.findFirst({ where: { slug: "gold-house" } });
  if (!venue) return { handoffs: [], waitlist: [], zones: [] };

  const [handoffs, waitlist, zones] = await Promise.all([
    prisma.reservationHandoff.findMany({
      where: {
        handoffStatus: { in: ["PENDING", "ACKNOWLEDGED", "GUEST_EN_ROUTE", "GUEST_ARRIVED"] },
        reservation: { venueId: venue.id },
      },
      include: {
        reservation: {
          include: {
            zone: true,
            attributions: { include: { referrer: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.resWaitlistEntry.findMany({
      where: { venueId: venue.id, status: { in: ["ACTIVE", "READY"] } },
      include: { zone: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.zone.findMany({
      where: { venueId: venue.id, isBookable: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, slug: true, conceptKey: true, currentWaitMinutes: true, capacityCovers: true },
    }),
  ]);

  return { handoffs, waitlist, zones };
}

export default async function HostMobilePage() {
  const data = await getData();
  type Props = ComponentProps<typeof HostMobileDashboard>;
  const handoffs: Props["handoffs"] = data.handoffs.map((handoff) => ({
    id: handoff.id,
    handoffStatus: handoff.handoffStatus,
    createdAt: handoff.createdAt.toISOString(),
    reservation: {
      contactName: handoff.reservation.contactName ?? "Guest",
      partySize: handoff.reservation.partySize,
      conceptRequested: handoff.reservation.conceptRequested,
      zone: handoff.reservation.zone ? { name: handoff.reservation.zone.name } : null,
      attributions: handoff.reservation.attributions.map(({ referrer }) => ({
        referrer: referrer ? { fullName: referrer.fullName, referrerType: referrer.referrerType } : null,
      })),
    },
  }));
  const waitlist: Props["waitlist"] = data.waitlist.map((entry) => ({
    id: entry.id,
    contactName: entry.contactName ?? "Guest",
    partySize: entry.partySize,
    conceptRequested: entry.conceptRequested,
    estimatedWaitMinutes: entry.estimatedWaitMinutes,
    status: entry.status,
  }));
  const zones: Props["zones"] = data.zones.map((zone) => ({ ...zone, conceptKey: zone.conceptKey ?? "" }));
  return <HostMobileDashboard handoffs={handoffs} waitlist={waitlist} zones={zones} />;
}
