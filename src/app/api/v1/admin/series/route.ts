import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

const Body = z.object({
  slug: z.string().min(3),
  title: z.string().min(3),
  hostType: z.enum(["OKU", "CATCH", "INFLUENCER", "PARTNER"]),
  venueId: z.string().min(1),
  spaceId: z.string().min(1).nullable().optional(),
  influencerId: z.string().optional(),
  partnerId: z.string().optional(),
  communityUrl: z.string().url().optional(),
});

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:orders:read");

    const series = await prisma.series.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        sessions: { include: { _count: { select: { tickets: true } } } },
        ticketTypes: true,
        influencer: { include: { user: { select: { id: true, name: true, email: true } } } },
        partner: { include: { user: { select: { id: true, name: true, email: true } } } },
        operationalVenue: { select: { id: true, name: true, slug: true } },
        eventSpace: { select: { id: true, name: true, conceptKey: true } },
      },
    });

    return NextResponse.json({ ok: true, data: series });
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:experiences:write");

    const body = Body.parse(await req.json());
    const venue = await prisma.venue.findUnique({ where: { id: body.venueId }, select: { id: true } });
    if (!venue) return NextResponse.json({ ok: false, error: "Venue not found" }, { status: 404 });
    const space = body.spaceId
      ? await prisma.restaurantSpace.findFirst({ where: { id: body.spaceId, venueId: body.venueId, isActive: true }, select: { conceptKey: true } })
      : null;
    if (body.spaceId && !space) return NextResponse.json({ ok: false, error: "Select an active space belonging to the chosen venue" }, { status: 400 });
    const legacyVenue = space?.conceptKey === "OKU" || space?.conceptKey === "CATCH" ? space.conceptKey : undefined;
    const series = await prisma.series.create({ data: { ...body, spaceId: body.spaceId ?? null, venue: legacyVenue, status: "DRAFT" } as any });
    return NextResponse.json({ ok: true, data: series });
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}
