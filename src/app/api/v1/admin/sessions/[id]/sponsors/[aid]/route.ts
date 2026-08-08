import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { aid } = await params;
  const body = await req.json();

  const assignment = await prisma.sponsorAssignment.update({
    where: { id: aid },
    data: {
      tierId: body.tierId,
      sortOrder: body.sortOrder,
      logoUrl: body.logoUrl,
      logoVariant: body.logoVariant,
      displayNameOverride: body.displayNameOverride,
      websiteUrl: body.websiteUrl,
      isActive: body.isActive,
      showOnEventPage: body.showOnEventPage,
      showOnTicket: body.showOnTicket,
      showOnEmail: body.showOnEmail,
      showOnCheckInView: body.showOnCheckInView,
      notes: body.notes,
    },
    include: {
      tier: true,
      entity: { select: { id: true, displayName: true, logoUrl: true, websiteUrl: true } },
    },
  });
  return NextResponse.json({ assignment });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { aid } = await params;
  await prisma.sponsorAssignment.delete({ where: { id: aid } });
  return NextResponse.json({ ok: true });
}
