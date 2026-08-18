import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { createSeriesInputSchema } from "@/server/series/createSeriesInput";

function failure(error: unknown) {
  const status = typeof (error as { status?: unknown })?.status === "number"
    ? (error as { status: number }).status
    : 500;
  if (status < 500) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Request denied" },
      { status },
    );
  }
  console.error("Unable to manage admin series", error);
  return NextResponse.json(
    { ok: false, error: "Unable to complete this request. Please try again." },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:orders:read");

    const series = await prisma.series.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sessions: {
          include: {
            _count: { select: { tickets: true } },
            occupancies: { select: { id: true, scope: true, status: true, space: { select: { id: true, name: true } } } },
          },
          orderBy: { startsAt: "asc" },
        },
        ticketTypes: true,
        influencer: { include: { user: { select: { id: true, name: true, email: true } } } },
        partner: { include: { user: { select: { id: true, name: true, email: true } } } },
        operationalVenue: { select: { id: true, name: true, slug: true } },
        eventSpace: { select: { id: true, name: true, conceptKey: true } },
      },
    });

    return NextResponse.json({ ok: true, data: series });
  } catch (e) {
    return failure(e);
  }
}

export async function POST(req: Request) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:experiences:write");

    const parsed = createSeriesInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: "Please correct the highlighted details.", fields: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const body = parsed.data;
    const venue = await prisma.venue.findUnique({ where: { id: body.venueId }, select: { id: true } });
    if (!venue) return NextResponse.json({ ok: false, error: "Venue not found" }, { status: 404 });
    const space = body.spaceId
      ? await prisma.restaurantSpace.findFirst({ where: { id: body.spaceId, venueId: body.venueId, isActive: true }, select: { conceptKey: true } })
      : null;
    if (body.spaceId && !space) return NextResponse.json({ ok: false, error: "Select an active space belonging to the chosen venue" }, { status: 400 });
    if (body.hostType === "INFLUENCER") {
      const influencer = await prisma.influencerProfile.findUnique({ where: { id: body.influencerId! }, select: { id: true } });
      if (!influencer) return NextResponse.json({ ok: false, error: "Select a valid influencer host." }, { status: 400 });
    }
    if (body.hostType === "PARTNER") {
      const partner = await prisma.partnerProfile.findUnique({ where: { id: body.partnerId! }, select: { id: true } });
      if (!partner) return NextResponse.json({ ok: false, error: "Select a valid partner host." }, { status: 400 });
    }
    const existing = await prisma.series.findUnique({ where: { slug: body.slug }, select: { id: true } });
    if (existing) return NextResponse.json({ ok: false, error: "That slug is already in use. Choose a different one." }, { status: 409 });
    const legacyVenue = space?.conceptKey === "OKU" || space?.conceptKey === "CATCH" ? space.conceptKey : undefined;
    const series = await prisma.$transaction(async (tx) => {
      const created = await tx.series.create({
        data: {
          ...body,
          influencerId: body.hostType === "INFLUENCER" ? body.influencerId : null,
          partnerId: body.hostType === "PARTNER" ? body.partnerId : null,
          spaceId: body.spaceId ?? null,
          venue: legacyVenue,
          status: "DRAFT",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "EXPERIENCE_CREATED",
          metadata: { seriesId: created.id, slug: created.slug },
        },
      });
      return created;
    });
    return NextResponse.json({ ok: true, data: series }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ ok: false, error: "That slug is already in use. Choose a different one." }, { status: 409 });
    }
    return failure(e);
  }
}
