import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const { userId, roles } = await requireSession();
    const isHost = roles.some((r) =>
      ["SUPERADMIN", "RESTAURANT_HOST", "STREETSIDE_HOST"].includes(r)
    );
    if (!isHost) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

    const venue = await prisma.venue.findFirst();
    if (!venue) return NextResponse.json({ ok: true, data: [] });

    const sessions = await prisma.hostChatSession.findMany({
      where: {
        venueId: venue.id,
        status: { in: ["OPEN", "WAITING"] },
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        reservation: { select: { id: true, contactName: true, partySize: true, status: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ ok: true, data: sessions });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { guestName, guestPhone, guestEmail, language, reservationId } = body;

    if (!guestName) {
      return NextResponse.json({ ok: false, error: "guestName required" }, { status: 400 });
    }

    const venue = await prisma.venue.findFirst();
    if (!venue) return NextResponse.json({ ok: false, error: "Venue not found" }, { status: 404 });

    const session = await prisma.hostChatSession.create({
      data: {
        guestName,
        guestPhone: guestPhone ?? null,
        guestEmail: guestEmail ?? null,
        language: language ?? "en",
        venueId: venue.id,
        reservationId: reservationId ?? null,
        status: "OPEN",
      },
    });

    await prisma.hostChatMessage.create({
      data: {
        sessionId: session.id,
        senderRole: "BOT",
        content: language === "es"
          ? `¡Hola ${guestName}! ¿En qué le puedo ayudar? Un anfitrión se unirá pronto.`
          : `Hi ${guestName}! A host will join you shortly. How can we help?`,
      },
    });

    return NextResponse.json({ ok: true, data: session }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
