import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

// POST /api/v1/host/scan
// Universal QR resolver for the host's at-the-door scanner. Accepts the
// raw decoded string from the camera, branches on prefix, and returns
// just enough data for the ScanResultModal to render the right hot
// buttons. Mutations happen via the existing PATCH .../bookings/[id]/status
// (reservations) and POST .../tickets/[id]/checkin (tickets) endpoints —
// this route is read-only by design.
//
// Recognized formats:
//   "OKU-YYYY-XXXXXXXX"  → reservation confirmation code
//   any other string     → tries Ticket.code (the unique handle on
//                          ticket QRs)
//   anything else        → 404 with kind=UNKNOWN so the UI can show a
//                          friendly "not a guest QR" state instead of
//                          a generic error.

type Body = { code?: string };

const RESERVATION_CODE_RE = /^OKU-\d{4}-[A-Z0-9]+$/i;

export async function POST(req: NextRequest) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "host:reservations:checkin");

    const body = (await req.json()) as Body;
    const code = body.code?.trim();
    if (!code) {
      return NextResponse.json({ ok: false, error: "code is required" }, { status: 400 });
    }

    // Venue-scope (Apr 28 2026 code-review HIGH fix). Resolve the
    // scanning host's venueId so we never leak guest details for a
    // booking/ticket at a different OKÜ venue. Superadmins (no host
    // profile) bypass this scope and can scan globally — matches the
    // existing pattern in /api/v1/host/me where superadmin reads cross-
    // venue data.
    const hostProfile = await prisma.restaurantHostProfile.findUnique({
      where: { userId },
      select: { venueId: true },
    });
    const hostVenueId = hostProfile?.venueId ?? null;
    const isSuperadmin = roles.includes("SUPERADMIN");

    // Reservation branch — exact-match on the unique confirmationCode.
    // Case-insensitive: a printed QR might be lowercase but the column is
    // canonical-cased, so we normalize before lookup.
    if (RESERVATION_CODE_RE.test(code)) {
      const reservation = await prisma.reservation.findUnique({
        where: { confirmationCode: code.toUpperCase() },
        select: {
          id: true,
          confirmationCode: true,
          contactName: true,
          partySize: true,
          status: true,
          reservationDate: true,
          occasion: true,
          notes: true,
          assignedTableLabel: true,
          arrivalConfirmedAt: true,
          arrivedHeadcount: true,
          seatedAt: true,
          venue: { select: { id: true, name: true } },
          zone: { select: { name: true } },
          attributions: {
            select: { referrer: { select: { fullName: true, referrerType: true } } },
            take: 1,
          },
          attributionSession: {
            select: {
              id: true,
              source: true,
              referralActor:  { select: { displayName: true, actorType: true } },
              legacyReferrer: { select: { fullName: true, referrerType: true } },
            },
          },
        },
      });
      if (!reservation) {
        return NextResponse.json({ ok: false, kind: "UNKNOWN", error: "Reservation code not found" }, { status: 404 });
      }
      // Cross-venue guard. Treat a foreign-venue hit as UNKNOWN rather
      // than 403, so we don't even confirm the code's existence to a
      // host at the wrong venue.
      if (!isSuperadmin && hostVenueId && reservation.venue?.id !== hostVenueId) {
        return NextResponse.json({ ok: false, kind: "UNKNOWN", error: "Reservation code not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, kind: "RESERVATION", reservation });
    }

    // Ticket branch — `Ticket.code` is the unique handle the QR encodes.
    // We also peek at the rest of the order so the modal can render the
    // chain-through "next attendee" affordance without a second round-trip.
    const ticket = await prisma.ticket.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        attendeeName: true,
        attendeeEmail: true,
        ticketStatus: true,
        checkedInAt: true,
        orderId: true,
        ticketType: { select: { name: true } },
        session: { select: { id: true, title: true } },
      },
    });
    if (!ticket) {
      return NextResponse.json({ ok: false, kind: "UNKNOWN", error: "Ticket code not found" }, { status: 404 });
    }

    // Note: tickets are NOT venue-scoped here. Events live on Series with a
    // VenueKey enum (OKU / CATCH) — there's no Venue.id FK to compare with
    // the host's venueId. Practically the leak surface is also much smaller:
    // ticket QRs surface attendee name + ticket type for an event the host
    // already needs to know about (events are cross-venue OKÜ programming),
    // not private guest-of-relationship data the way reservations do. If the
    // venue-scoping requirement tightens for events, add a VenueKey →
    // Venue.id resolver and re-instate the guard here.

    const siblings = await prisma.ticket.count({
      where: {
        orderId: ticket.orderId,
        ticketStatus: "ISSUED",
        id: { not: ticket.id },
      },
    });

    return NextResponse.json({
      ok: true,
      kind: "TICKET",
      ticket,
      siblingsRemaining: siblings,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}
