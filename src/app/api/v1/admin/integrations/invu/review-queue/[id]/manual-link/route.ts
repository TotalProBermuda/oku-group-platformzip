import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { roles } = await requireSession();
  if (!roles.includes("SUPERADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { reservationId } = await req.json();
  if (!reservationId) {
    return NextResponse.json({ ok: false, error: "reservationId is required" }, { status: 400 });
  }

  const [item, reservation] = await Promise.all([
    prisma.integrationReviewQueue.findUnique({ where: { id: params.id } }),
    prisma.reservation.findUnique({ where: { id: reservationId }, select: { id: true, venueId: true } }),
  ]);
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  if (!reservation) return NextResponse.json({ ok: false, error: "Reservation not found" }, { status: 404 });
  if (reservation.venueId !== item.venueId) {
    return NextResponse.json({ ok: false, error: "Reservation venue does not match review queue item venue" }, { status: 422 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.integrationReviewQueue.update({
      where: { id: params.id },
      data: { status: "RESOLVED", resolvedAt: new Date(), reservationId },
    });

    if (item.tableSessionId) {
      await tx.tableSession.update({
        where: { id: item.tableSessionId },
        data: {
          reservationId,
          matchMethod: "MANUAL",
          trustScore: 1.0,
          status: "MATCHED",
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
