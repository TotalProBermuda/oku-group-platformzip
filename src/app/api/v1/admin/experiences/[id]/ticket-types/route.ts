import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) =>
    ["SUPERADMIN", "FB_DIRECTOR"].includes(r)
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

  const ticketType = await prisma.ticketType.create({
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
      visibilityMode: visibilityMode as any,
      requiresMembership: Boolean(requiresMembership),
      earlyAccessOnly: Boolean(earlyAccessOnly),
      ticketStatus: ticketStatus as any,
    },
  });

  return NextResponse.json({ ticketType }, { status: 201 });
}
