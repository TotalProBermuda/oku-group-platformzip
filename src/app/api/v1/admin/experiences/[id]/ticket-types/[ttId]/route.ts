import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncTranslations } from "@/server/i18n/eventTranslations";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { legacySeriesWriteBlocked, managedWriteMessage } from "@/server/series/legacySessionGuard";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) =>
    ["SUPERADMIN"].includes(r)
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

  const ticketType = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Series" WHERE "id" = ${id} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "TicketType" WHERE "id" = ${ttId} FOR UPDATE`;
    if (["priceCents", "ticketStatus"].some(k => k in body) && await legacySeriesWriteBlocked(id, tx)) return null;
    const current = await tx.ticketType.findUniqueOrThrow({ where: { id: ttId } });
    const [issued, committed, held] = await Promise.all([
      tx.ticket.count({ where: { ticketTypeId: ttId, ticketStatus: { notIn: ["CANCELLED", "REFUNDED", "VOIDED"] } } }),
      tx.orderLineItem.aggregate({ where: { ticketTypeId: ttId, order: { status: { in: ["PENDING", "PAID", "PARTIALLY_REFUNDED"] } } }, _sum: { qty: true } }),
      tx.orderLineItem.aggregate({ where: { ticketTypeId: ttId, order: { status: "PENDING" } }, _sum: { qty: true } }),
    ]);
    if (body.typeCapacity !== undefined && body.typeCapacity !== null && (!Number.isSafeInteger(Number(body.typeCapacity)) || Number(body.typeCapacity) < Math.max(current.soldCount, committed._sum.qty ?? 0, issued + (held._sum.qty ?? 0)))) return null;
    const updated = await tx.ticketType.update({
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
    await syncTranslations(tx, "TicketType", ttId, { name: updated.name, description: updated.description });
    return updated;
  });
  if (!ticketType) return NextResponse.json({ error: managedWriteMessage + " Product capacity also cannot undercut issued or held inventory." }, { status: 409 });

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

  const removed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Series" WHERE "id" = ${id} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "TicketType" WHERE "id" = ${ttId} FOR UPDATE`;
    if (await legacySeriesWriteBlocked(id, tx)) return false;
    const current = await tx.ticketType.findUniqueOrThrow({ where: { id: ttId } });
    if (current.soldCount > 0 || await tx.ticket.count({ where: { ticketTypeId: ttId } }) > 0) return false;
    await tx.ticketType.delete({ where: { id: ttId } }); return true;
  });
  if (!removed) return NextResponse.json({ error: "Referenced or managed products cannot be deleted. Use Session management to change future availability." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
