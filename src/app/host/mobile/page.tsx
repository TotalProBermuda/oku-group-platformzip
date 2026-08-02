import { prisma } from "@/lib/prisma";
import HostMobileDashboard from "@/components/host/HostMobileDashboard";

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
  return <HostMobileDashboard handoffs={data.handoffs as any} waitlist={data.waitlist as any} zones={data.zones} />;
}
