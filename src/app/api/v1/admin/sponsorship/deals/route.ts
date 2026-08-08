import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(s: any) {
  return s?.user?.roles?.some((r: string) => ["SUPERADMIN", "FB_DIRECTOR"].includes(r));
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const paymentStatus = searchParams.get("paymentStatus") ?? "";

  const deals = await prisma.sponsorDeal.findMany({
    where: {
      ...(paymentStatus ? { paymentStatus: paymentStatus as any } : {}),
    },
    include: {
      entity:      { select: { id: true, displayName: true, logoUrl: true, type: true } },
      slot:        { select: { id: true, title: true, category: true, series: { select: { id: true, title: true } } } },
      application: { select: { id: true, brandName: true, contactEmail: true } },
      payments:    { orderBy: { paidAt: "desc" }, take: 5 },
      _count:      { select: { placements: true, payments: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, deals });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { applicationId, slotId, entityId, agreedPriceCents, internalNotes, activationDeadline } = body;

  if (!applicationId) return NextResponse.json({ error: "applicationId required" }, { status: 400 });
  if (!agreedPriceCents) return NextResponse.json({ error: "agreedPriceCents required" }, { status: 400 });

  const deal = await prisma.sponsorDeal.create({
    data: {
      applicationId,
      slotId:            slotId            || null,
      entityId:          entityId          || null,
      agreedPriceCents,
      internalNotes:     internalNotes     || null,
      activationDeadline: activationDeadline ? new Date(activationDeadline) : null,
    },
    include: {
      entity: { select: { id: true, displayName: true } },
      slot:   { select: { id: true, title: true } },
    },
  });

  return NextResponse.json({ ok: true, deal }, { status: 201 });
}
