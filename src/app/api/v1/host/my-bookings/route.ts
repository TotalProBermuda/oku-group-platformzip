import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { userId } = await requireSession();
  const venue = await prisma.venue.findFirst();
  if (!venue) return NextResponse.json({ ok: true, data: [] });

  const bookings = await prisma.reservation.findMany({
    where: {
      venueId: venue.id,
      source: "STREETSIDE_HOST",
      handoffs: { some: { sentByLabel: userId } },
    },
    include: {
      handoffs: { orderBy: { createdAt: "desc" }, take: 1 },
      zone: true,
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ ok: true, data: bookings });
}
