import { redirect } from "next/navigation";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { INCLUDE_FULL } from "@/server/host/hostService";
import HostOperationsBoard from "@/components/host/HostOperationsBoard";

export const dynamic = "force-dynamic";

async function getData(venueId: string | null) {
  const include = { zones: { where: { isBookable: true }, include: { tables: { where: { isActive: true } } }, orderBy: { sortOrder: "asc" as const } } };
  const venue = venueId
    ? await prisma.venue.findUnique({ where: { id: venueId }, include })
    : await prisma.venue.findFirst({ include });
  if (!venue) return { reservations: [], waitlist: [], zones: [] };

  // Rolling window — must match getHostQueue() in src/server/host/hostService.ts.
  // The server runs in UTC and Venue has no timezone column, so a Panama
  // booking at 22:30 local (= 03:30 UTC next day) was being shoved into
  // "yesterday" by a midnight-bounded SSR window and rendered as an empty
  // board, even though the 20s client-side refresh (which uses the rolling
  // window) would have populated it. Aligning both bounds eliminates the
  // empty-on-first-paint flash and prevents users from thinking the queue
  // is broken when it isn't.
  const now = new Date();
  const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 30 * 60 * 60 * 1000);

  const [reservations, waitlist] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        venueId: venue.id,
        reservationDate: { gte: windowStart, lt: windowEnd },
        status: { notIn: ["CANCELLED"] },
      },
      include: INCLUDE_FULL,
      orderBy: { reservationDate: "asc" },
    }),
    prisma.resWaitlistEntry.findMany({
      where: { venueId: venue.id, status: { in: ["ACTIVE", "READY"] } },
      include: { zone: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return { reservations, waitlist, zones: venue.zones };
}

export default async function HostOperationsPage() {
  const session = await getOptionalSession();
  if (!session) redirect("/login?callbackUrl=/host/operations");
  const allowed = ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "RESTAURANT_HOST", "RESTAURANT_SUPERVISOR"];
  if (!(session.roles as string[]).some((r) => allowed.includes(r))) {
    redirect("/login");
  }

  const isSuperadmin = (session.roles as string[]).includes("SUPERADMIN");
  const profile = isSuperadmin
    ? null
    : await prisma.restaurantHostProfile.findUnique({ where: { userId: session.userId }, select: { venueId: true } });
  if (!isSuperadmin && !profile?.venueId) redirect("/login");

  const data = await getData(profile?.venueId ?? null);
  return <HostOperationsBoard reservations={data.reservations as any} waitlist={data.waitlist as any} zones={data.zones as any} />;
}
