import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createReservationConflictRecords } from "@/server/events/eventOccupancyService";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN","FB_DIRECTOR","ADMIN_COMMERCIAL"].includes(r));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const series = await prisma.series.findUnique({
    where: { id },
    include: {
      ticketTypes: { include: { pricingRules: true }, orderBy: { displayOrder: "asc" } },
      sessions: { orderBy: { startsAt: "asc" } },
      addons: { orderBy: { displayOrder: "asc" } },
      experienceInfluencer: { include: { influencer: { select: { id: true, displayName: true, handle: true } } } },
      operationalVenue: { select: { id: true, name: true, slug: true } },
      eventSpace: { select: { id: true, name: true, conceptKey: true } },
      _count: { select: { Order: true, waitlists: true, analyticsDays: true } },
    },
  });
  if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ series });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as { id: string }).id;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const allowed = ["title","subtitle","description","category","venue","venueId","spaceId","hostType","city","country","venueAddress",
    "heroImageUrl","capacityTotal","availableSeatsMode","attendeeListMode","showCountdown","countdownLabel",
    "publicReleaseAt","earlyReleaseAt","newsletterCaptureEnabled","waitlistEnabled","membershipRuleMode",
    "isFeatured","seoTitle","seoDescription","status","startsAt","endsAt","communityUrl"];
  const data: any = {};
  for (const k of allowed) if (k in body) data[k] = body[k];
  const existing = await prisma.series.findUnique({ where: { id }, select: { venueId: true, spaceId: true } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const targetVenueId = data.venueId ?? existing.venueId;
  if ("venueId" in data) {
    const venue = await prisma.venue.findUnique({ where: { id: data.venueId }, select: { id: true } });
    if (!venue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }
  // Switching the restaurant must never carry a space from the old venue.
  if ("venueId" in data && !Object.prototype.hasOwnProperty.call(data, "spaceId")) data.spaceId = null;
  let selectedSpace: { conceptKey: string } | null = null;
  if (data.spaceId) {
    if (!targetVenueId) return NextResponse.json({ error: "Select an operational venue first" }, { status: 400 });
    selectedSpace = await prisma.restaurantSpace.findFirst({ where: { id: data.spaceId, venueId: targetVenueId, isActive: true }, select: { conceptKey: true } });
    if (!selectedSpace) return NextResponse.json({ error: "Space must belong to the selected venue" }, { status: 400 });
  }
  // The legacy concept is derived from the selected physical-space data, never
  // trusted from the browser. This prevents a Terrace event being labelled CATCH.
  if (Object.prototype.hasOwnProperty.call(data, "spaceId")) {
    data.venue = selectedSpace?.conceptKey === "OKU" || selectedSpace?.conceptKey === "CATCH" ? selectedSpace.conceptKey : null;
  }
  if (data.publicReleaseAt) data.publicReleaseAt = new Date(data.publicReleaseAt);
  if (data.earlyReleaseAt)  data.earlyReleaseAt  = new Date(data.earlyReleaseAt);
  if (data.startsAt)        data.startsAt        = new Date(data.startsAt);
  if (data.endsAt)          data.endsAt          = new Date(data.endsAt);

  // Publishing activates its deliberate occupancy blocks only after the admin
  // has created them. Pausing/postponing immediately releases future public
  // availability while preserving the event and its reservation-conflict audit.
  const series = await prisma.$transaction(async (tx) => {
    const updated = await tx.series.update({ where: { id }, data });
    if (data.status) {
      const occupancies = await tx.eventSpaceOccupancy.findMany({
        where: { seriesId: id, status: data.status === "PUBLISHED" ? "DRAFT" : "ACTIVE" },
        orderBy: { spaceId: "asc" },
      });
      for (const occupancy of occupancies) {
        // Same category-2 space lock used by reservation creation/assignment.
        // Venue-wide blocks lock every physical space, preventing a booking
        // from slipping through while the series state changes.
        const ids = occupancy.scope === "VENUE"
          ? (await tx.restaurantSpace.findMany({ where: { venueId: occupancy.venueId }, select: { id: true }, orderBy: { id: "asc" } })).map((s) => s.id)
          : occupancy.spaceId ? [occupancy.spaceId] : [];
        for (const spaceId of ids) await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${spaceId}))`;
        if (data.status === "PUBLISHED") {
          await tx.eventSpaceOccupancy.update({ where: { id: occupancy.id }, data: { status: "ACTIVE" } });
          await createReservationConflictRecords(tx, occupancy);
        } else {
          // Any non-public series state releases its dining block. Preserve a
          // deliberate postpone/cancel decision; otherwise treat it as paused.
          await tx.eventSpaceOccupancy.update({ where: { id: occupancy.id }, data: { status: data.status === "POSTPONED" ? "POSTPONED" : data.status === "CANCELLED" ? "CANCELLED" : "PAUSED" } });
        }
      }
    }
    await tx.auditLog.create({ data: { actorId, action: "EXPERIENCE_UPDATED", metadata: { seriesId: id, fields: Object.keys(data) } } });
    return updated;
  });
  return NextResponse.json({ series });
}
