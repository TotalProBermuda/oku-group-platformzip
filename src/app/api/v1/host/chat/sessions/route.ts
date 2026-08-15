import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireHostChatAccess } from "@/server/auth/hostChatGuard";
import { gatePublicPostAsync } from "@/server/rateLimit";

export async function GET() {
  try {
    const access = await requireHostChatAccess();
    const venue = access.isSuperadmin
      ? await prisma.venue.findFirst({ select: { id: true } })
      : { id: access.venueId! };
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
    const body = await req.json().catch(() => ({}));
    const gate = await gatePublicPostAsync(req, body, "public-host-chat-session", {
      limit: 5,
      windowMs: 10 * 60_000,
      requireDistributed: true,
    });
    if (!gate.ok) return gate.response;
    const { guestName, guestPhone, guestEmail, language } = body;

    if (typeof guestName !== "string" || !guestName.trim() || guestName.trim().length > 120) {
      return NextResponse.json({ ok: false, error: "guestName required" }, { status: 400 });
    }

    const venue = await prisma.venue.findFirst();
    if (!venue) return NextResponse.json({ ok: false, error: "Venue not found" }, { status: 404 });

    const session = await prisma.hostChatSession.create({
      data: {
        guestName: guestName.trim(),
        guestPhone: typeof guestPhone === "string" ? guestPhone.slice(0, 40) : null,
        guestEmail: typeof guestEmail === "string" ? guestEmail.slice(0, 254) : null,
        language: language === "es" || language === "pt" ? language : "en",
        venueId: venue.id,
        status: "OPEN",
      },
    });

    await prisma.hostChatMessage.create({
      data: {
        sessionId: session.id,
        senderRole: "BOT",
        content: language === "es"
          ? `¡Hola ${guestName.trim()}! ¿En qué le puedo ayudar? Un anfitrión se unirá pronto.`
          : `Hi ${guestName.trim()}! A host will join you shortly. How can we help?`,
      },
    });

    return NextResponse.json({ ok: true, data: session }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
