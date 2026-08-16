import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN","FB_DIRECTOR","ADMIN_COMMERCIAL"].includes(r));
}

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const series = await prisma.series.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      ticketTypes: { orderBy: { displayOrder: "asc" } },
      sessions: { orderBy: { startsAt: "asc" } },
      experienceInfluencer: { include: { influencer: { select: { displayName: true, handle: true } } } },
      addons: { where: { isActive: true } },
      operationalVenue: { select: { id: true, name: true, slug: true } },
      eventSpace: { select: { id: true, name: true, conceptKey: true } },
      _count: { select: { Order: true, waitlists: true } },
    },
  });
  return NextResponse.json({ series });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { slug, title, subtitle, description, category, venue, hostType, city, country, venueAddress,
          heroImageUrl, capacityTotal, availableSeatsMode, attendeeListMode, showCountdown, countdownLabel, venueId, spaceId,
          publicReleaseAt, earlyReleaseAt, newsletterCaptureEnabled, waitlistEnabled, membershipRuleMode,
          isFeatured, seoTitle, seoDescription, startsAt, endsAt } = body;

  if (!slug || !title || !hostType || !venueId) return NextResponse.json({ error: "slug, title, hostType, venueId required" }, { status: 400 });
  const operationalVenue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
  if (!operationalVenue) return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  const eventSpace = spaceId ? await prisma.restaurantSpace.findFirst({ where: { id: spaceId, venueId, isActive: true }, select: { conceptKey: true } }) : null;
  if (spaceId && !eventSpace) return NextResponse.json({ error: "Space must belong to the selected venue" }, { status: 400 });

  const series = await prisma.series.create({
    data: {
      slug, title, subtitle, description, category, venue: eventSpace?.conceptKey === "OKU" || eventSpace?.conceptKey === "CATCH" ? eventSpace.conceptKey : undefined, venueId, spaceId: spaceId ?? null, hostType,
      city, country, venueAddress, heroImageUrl,
      capacityTotal: capacityTotal ?? 0,
      availableSeatsMode: availableSeatsMode ?? "HIDDEN",
      attendeeListMode: attendeeListMode ?? "HIDDEN",
      showCountdown: showCountdown ?? false,
      countdownLabel,
      publicReleaseAt: publicReleaseAt ? new Date(publicReleaseAt) : undefined,
      earlyReleaseAt: earlyReleaseAt ? new Date(earlyReleaseAt) : undefined,
      newsletterCaptureEnabled: newsletterCaptureEnabled ?? false,
      waitlistEnabled: waitlistEnabled ?? true,
      membershipRuleMode: membershipRuleMode ?? "NONE",
      isFeatured: isFeatured ?? false,
      seoTitle, seoDescription,
      status: "DRAFT",
      startsAt: startsAt ? new Date(startsAt) : undefined,
      endsAt: endsAt ? new Date(endsAt) : undefined,
    },
  });

  await prisma.auditLog.create({ data: { actorId: session.user.id, action: "EXPERIENCE_CREATED", metadata: { seriesId: series.id, slug } } });

  return NextResponse.json({ series }, { status: 201 });
}
