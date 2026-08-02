import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const INCLUDE = {
  tier: true,
  entity: { select: { id: true, displayName: true, logoUrl: true, websiteUrl: true } },
};

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const sessionRecord = await prisma.session.findUnique({ where: { id }, select: { id: true, seriesId: true, inheritsSeriesSponsors: true } });
  if (!sessionRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [eventAssignments, seriesAssignments] = await Promise.all([
    prisma.sponsorAssignment.findMany({
      where: { scopeType: "EVENT", scopeId: id },
      include: INCLUDE,
      orderBy: [{ tier: { displayOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    sessionRecord.inheritsSeriesSponsors
      ? prisma.sponsorAssignment.findMany({
          where: { scopeType: "SERIES", scopeId: sessionRecord.seriesId },
          include: INCLUDE,
          orderBy: [{ tier: { displayOrder: "asc" } }, { sortOrder: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    eventAssignments,
    seriesAssignments,
    inheritsSeriesSponsors: sessionRecord.inheritsSeriesSponsors,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const dbUser = session.user?.email
    ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    : null;

  const assignment = await prisma.sponsorAssignment.create({
    data: {
      entityId: body.entityId,
      tierId: body.tierId,
      scopeType: "EVENT",
      scopeId: id,
      sortOrder: body.sortOrder ?? 0,
      logoUrl: body.logoUrl ?? null,
      logoVariant: body.logoVariant ?? "FULL_COLOR",
      displayNameOverride: body.displayNameOverride ?? null,
      websiteUrl: body.websiteUrl ?? null,
      showOnEventPage: body.showOnEventPage ?? true,
      showOnTicket: body.showOnTicket ?? true,
      showOnEmail: body.showOnEmail ?? true,
      showOnCheckInView: body.showOnCheckInView ?? false,
      notes: body.notes ?? null,
      createdByUserId: dbUser?.id ?? null,
    },
    include: INCLUDE,
  });
  return NextResponse.json({ assignment }, { status: 201 });
}
