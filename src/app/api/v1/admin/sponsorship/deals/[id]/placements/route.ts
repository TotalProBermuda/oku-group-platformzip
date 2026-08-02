import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(s: any) {
  return s?.user?.roles?.some((r: string) => ["SUPERADMIN", "ADMIN_COMMERCIAL"].includes(r));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: dealId } = await params;
  const placements = await prisma.sponsorPlacement.findMany({
    where: { dealId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ ok: true, placements });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: dealId } = await params;
  const body = await req.json().catch(() => ({}));
  const { placementType, label, assetUrl, altText, linkUrl, activatedAt, expiresAt, notes } = body;

  if (!placementType) return NextResponse.json({ error: "placementType required" }, { status: 400 });

  const placement = await prisma.sponsorPlacement.create({
    data: {
      dealId,
      placementType,
      label:       label      || null,
      assetUrl:    assetUrl   || null,
      altText:     altText    || null,
      linkUrl:     linkUrl    || null,
      activatedAt: activatedAt ? new Date(activatedAt) : null,
      expiresAt:   expiresAt   ? new Date(expiresAt)   : null,
      notes:       notes       || null,
    },
  });

  return NextResponse.json({ ok: true, placement }, { status: 201 });
}
