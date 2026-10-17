import { redirect } from "next/navigation";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { getHostQueue } from "@/server/host/hostService";
import { parseQueueSelection, type QueueSelection } from "@/server/host/queueSelection";
import HostOperationsBoard from "@/components/host/HostOperationsBoard";
import { getCurrentRoles } from "@/server/auth/currentRoles";

export const dynamic = "force-dynamic";

async function getData(venueId: string | null, selection: QueueSelection) {
  const include = { zones: { where: { isBookable: true }, include: { tables: { where: { isActive: true } } }, orderBy: { sortOrder: "asc" as const } } };
  const venue = venueId
    ? await prisma.venue.findUnique({ where: { id: venueId }, include })
    : await prisma.venue.findFirst({ include });
  if (!venue) return { reservations: [], waitlist: [], zones: [] };

  return getHostQueue(venue.id, selection);
}

export default async function HostOperationsPage({ searchParams }: { searchParams: Promise<{ date?: string; reservationId?: string }> }) {
  const selection = parseQueueSelection(await searchParams);
  const session = await getOptionalSession();
  if (!session) {
    const query = new URLSearchParams();
    if (selection.reservationId) query.set("reservationId", selection.reservationId);
    if (selection.date) query.set("date", selection.date);
    redirect(`/login?callbackUrl=${encodeURIComponent(`/host/operations?${query}`)}`);
  }
  const roles = await getCurrentRoles(session.userId);
  const allowed = ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL", "RESTAURANT_HOST", "RESTAURANT_SUPERVISOR"];
  if (!roles.some((r) => allowed.includes(r))) {
    redirect("/login");
  }

  const isSuperadmin = roles.includes("SUPERADMIN");
  const canOverrideCapacity = roles.some((role) =>
    ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"].includes(role),
  );
  const profile = isSuperadmin
    ? null
    : await prisma.restaurantHostProfile.findUnique({ where: { userId: session.userId }, select: { venueId: true } });
  if (!isSuperadmin && !profile?.venueId) redirect("/login");

  const linkedVenue = isSuperadmin && selection.reservationId
    ? await prisma.reservation.findUnique({ where: { id: selection.reservationId }, select: { venueId: true } })
    : null;
  const data = await getData(profile?.venueId ?? linkedVenue?.venueId ?? null, selection);
  return <HostOperationsBoard reservations={data.reservations as any} waitlist={data.waitlist as any} zones={data.zones as any} canOverrideCapacity={canOverrideCapacity} selectedDate={selection.date} />;
}
