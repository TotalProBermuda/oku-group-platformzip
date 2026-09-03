import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { normalizePasswordlessEmail } from "@/server/auth/passwordless";

export async function GET() {
  try {
    const { userId } = await requireSession();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, status: true },
    });
    if (!user || user.status !== "ACTIVE") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const email = normalizePasswordlessEmail(user.email);

    const [reservations, tickets] = await Promise.all([
      prisma.reservation.findMany({
        where: { contactEmailNormalized: email },
        select: {
          id: true,
          confirmationCode: true,
          reservationDate: true,
          partySize: true,
          status: true,
          conceptRequested: true,
          venue: { select: { name: true, city: true } },
        },
        orderBy: { reservationDate: "desc" },
      }),
      prisma.ticket.findMany({
        where: {
          attendeeEmailNormalized: email,
          ticketStatus: { in: ["ISSUED", "CHECKED_IN"] },
        },
        select: {
          id: true,
          code: true,
          ticketStatus: true,
          checkedInAt: true,
          session: {
            select: {
              startsAt: true,
              title: true,
              series: { select: { title: true, slug: true, venue: true } },
            },
          },
          ticketType: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ ok: true, data: { reservations, tickets } });
  } catch (error: any) {
    if (error?.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}