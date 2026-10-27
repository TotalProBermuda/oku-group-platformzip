import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v3";
import type { Session } from "next-auth";
import { TicketTypeStatus, TicketVisibilityMode } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { syncTranslations } from "@/server/i18n/eventTranslations";
import { finishEventSave } from "@/server/i18n/eventTranslationRequest";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: Session | null) {
  return session?.user?.roles?.some((r: string) =>
    ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"].includes(r)
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const ticketTypes = await prisma.ticketType.findMany({
    where: { seriesId: id },
    orderBy: { displayOrder: "asc" },
  });
  return NextResponse.json({ ticketTypes });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json();

  const series = await prisma.series.findUnique({ where: { id } });
  if (!series) return NextResponse.json({ error: "Series not found" }, { status: 404 });

  const {
    name,
    description,
    tierCode,
    priceCents,
    currency = "USD",
    maxPerOrder = 10,
    minPerOrder = 1,
    typeCapacity,
    displayOrder = 0,
    saleStartsAt,
    saleEndsAt,
    visibilityMode = "VISIBLE",
    requiresMembership = false,
    earlyAccessOnly = false,
    ticketStatus = "ACTIVE",
  } = body;

  if (!name || priceCents === undefined) {
    return NextResponse.json({ error: "name and priceCents are required" }, { status: 400 });
  }

  const ticketType = await prisma.$transaction(async tx => {
  const created = await tx.ticketType.create({
    data: {
      seriesId: id,
      name,
      description: description || null,
      tierCode: tierCode || null,
      priceCents: Number(priceCents),
      currency,
      maxPerOrder: Number(maxPerOrder),
      minPerOrder: Number(minPerOrder),
      typeCapacity: typeCapacity ? Number(typeCapacity) : null,
      displayOrder: Number(displayOrder),
      saleStartsAt: saleStartsAt ? new Date(saleStartsAt) : null,
      saleEndsAt: saleEndsAt ? new Date(saleEndsAt) : null,
      visibilityMode: z.nativeEnum(TicketVisibilityMode).parse(visibilityMode),
      requiresMembership: Boolean(requiresMembership),
      earlyAccessOnly: Boolean(earlyAccessOnly),
      ticketStatus: z.nativeEnum(TicketTypeStatus).parse(ticketStatus),
    },
  });

  await syncTranslations(tx, "TicketType", created.id, { name: created.name, description: created.description });
  return created;
  });
  return finishEventSave(id, { ticketType }, req, 201);
}
