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
  const assignments = await prisma.sponsorAssignment.findMany({
    where: { scopeType: "SERIES", scopeId: id },
    include: INCLUDE,
    orderBy: [{ tier: { displayOrder: "asc" } }, { sortOrder: "asc" }],
  });
  return NextResponse.json({ assignments });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  // Resolve the DB user ID from session email to avoid FK violations
  const dbUser = session.user?.email
    ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
    : null;

  const assignment = await prisma.sponsorAssignment.create({
    data: {
      entityId: body.entityId,
      tierId: body.tierId,
      scopeType: "SERIES",
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
