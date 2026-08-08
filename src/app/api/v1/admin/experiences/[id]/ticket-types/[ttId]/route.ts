import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) =>
    ["SUPERADMIN", "FB_DIRECTOR"].includes(r)
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; ttId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, ttId } = await params;
  const body = await req.json();

  const existing = await prisma.ticketType.findFirst({
    where: { id: ttId, seriesId: id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const {
    name,
    description,
    tierCode,
    priceCents,
    currency,
    maxPerOrder,
    minPerOrder,
    typeCapacity,
    displayOrder,
    saleStartsAt,
    saleEndsAt,
    visibilityMode,
    requiresMembership,
    earlyAccessOnly,
    ticketStatus,
  } = body;

  const ticketType = await prisma.ticketType.update({
    where: { id: ttId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description: description || null }),
      ...(tierCode !== undefined && { tierCode: tierCode || null }),
      ...(priceCents !== undefined && { priceCents: Number(priceCents) }),
      ...(currency !== undefined && { currency }),
      ...(maxPerOrder !== undefined && { maxPerOrder: Number(maxPerOrder) }),
      ...(minPerOrder !== undefined && { minPerOrder: Number(minPerOrder) }),
      ...(typeCapacity !== undefined && { typeCapacity: typeCapacity ? Number(typeCapacity) : null }),
      ...(displayOrder !== undefined && { displayOrder: Number(displayOrder) }),
      ...(saleStartsAt !== undefined && { saleStartsAt: saleStartsAt ? new Date(saleStartsAt) : null }),
      ...(saleEndsAt !== undefined && { saleEndsAt: saleEndsAt ? new Date(saleEndsAt) : null }),
      ...(visibilityMode !== undefined && { visibilityMode: visibilityMode as any }),
      ...(requiresMembership !== undefined && { requiresMembership: Boolean(requiresMembership) }),
      ...(earlyAccessOnly !== undefined && { earlyAccessOnly: Boolean(earlyAccessOnly) }),
      ...(ticketStatus !== undefined && { ticketStatus: ticketStatus as any }),
    },
  });

  return NextResponse.json({ ticketType });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; ttId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id, ttId } = await params;

  const existing = await prisma.ticketType.findFirst({
    where: { id: ttId, seriesId: id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (existing.soldCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete a ticket type that has sold tickets. Set it to INACTIVE instead." },
      { status: 409 }
    );
  }

  await prisma.ticketType.delete({ where: { id: ttId } });
  return NextResponse.json({ ok: true });
}
