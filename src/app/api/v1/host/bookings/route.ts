import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { createStreetsideBooking } from "@/server/host/hostService";
import { prisma } from "@/lib/prisma";
import { requireHostBookingAccess } from "@/server/auth/hostChatGuard";

export async function POST(req: NextRequest) {
  try {
    const access = await requireHostBookingAccess();
    const body = await req.json();

    const {
      guestName,
      guestEmail,
      guestWhatsapp,
      guestPhone,
      visitorType,
      emailOptIn,
      emailOptOut,
      partySize,
      conceptRequested,
      occasion,
      notes,
      requestedTime,
      venueSlug,
    } = body;

    if (!guestName || !guestEmail || !partySize) {
      return NextResponse.json({ error: "guestName, guestEmail, and partySize are required" }, { status: 400 });
    }

    const venue = access.isSuperadmin
      ? await prisma.venue.findFirst({ where: venueSlug ? { slug: venueSlug } : undefined })
      : await prisma.venue.findUnique({ where: { id: access.venueId! } });
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }
    if (!access.isSuperadmin && venueSlug && venue.slug !== venueSlug) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const reservation = await createStreetsideBooking({
      venueId: venue.id,
      guestName,
      guestEmail,
      guestWhatsapp: guestWhatsapp ?? guestPhone ?? null,
      visitorType: visitorType ?? null,
      emailOptIn: emailOptOut !== undefined ? emailOptOut !== true : emailOptIn === true,
      partySize: Number(partySize),
      conceptRequested: conceptRequested ?? null,
      occasion: occasion ?? null,
      notes: notes ?? null,
      requestedTime: requestedTime ?? null,
      sourceUserId: access.userId,
    });

    return NextResponse.json({ ok: true, data: reservation }, { status: 201 });
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}

export async function GET() {
  try {
    const { userId, roles } = await requireSession();
    const access = await requireHostBookingAccess();
    const venueId = access.isSuperadmin
      ? (await prisma.venue.findFirst({ select: { id: true } }))?.id ?? null
      : access.venueId;
    if (!venueId) return NextResponse.json({ ok: true, data: [] });

    const isAdmin = access.isSuperadmin || roles.some(r => ["RESTAURANT_HOST", "RESTAURANT_SUPERVISOR"].includes(r));

    const reservations = await prisma.reservation.findMany({
      where: isAdmin
        ? { venueId }
        : { venueId, source: "STREETSIDE_HOST", sourceContext: userId },
      include: {
        handoffs: { orderBy: { createdAt: "desc" }, take: 1 },
        zone: true,
        attributions: { include: { referrer: true }, take: 1 },
        // v2 deterministic trust chain — used by the streetside Active tab
        // to expose an "Open table in INVU" action and to render the
        // bound-pill once the host has linked an INVU order.
        attributionSession: {
          select: {
            id: true,
            bookingCode: true,
            // Attribution lifecycle (Task: close attribution loop). The host
            // card uses these to render a status chip and to know whether the
            // INVU bind affordance is reachable yet.
            status: true,
            source: true,
            seatedAt: true,
            boundAt: true,
            verifiedAt: true,
            invuOrderId: true,
            bindMethod: true,
            // Earner taxonomy (Bucket A2 streetside visibility) — same 3-tier
            // include the Operations Board uses, so the streetside list can
            // render the resolved referrer chip.
            referralActor: { select: { id: true, displayName: true, actorType: true } },
            legacyReferrer: { select: { id: true, fullName: true, referralCode: true } },
            tableSession: {
              select: {
                id: true,
                openedInvuOrderId: true,
                invuReferenceField: true,
                invuReferenceWritten: true,
                syncStatus: true,
                matchStatus: true,
              },
            },
            bindings: {
              select: { id: true, invuOrderId: true, bindingType: true, createdAt: true },
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ ok: true, data: reservations });
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}
