import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

// POST /api/v1/host/tickets/[id]/checkin
// Flips a Ticket from ISSUED → CHECKED_IN, stamps checkedInAt + the
// scanning user. Idempotent: if the ticket is already CHECKED_IN the
// route returns 200 with `alreadyCheckedIn: true` so the modal can
// display the original timestamp instead of erroring out.
//
// Note: REVOKED / VOID tickets (or any non-ISSUED status besides
// CHECKED_IN) are explicitly rejected — we don't silently let a
// refunded ticket through the door.

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "host:reservations:checkin");

    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: { id: true, ticketStatus: true, checkedInAt: true, checkedInById: true, orderId: true },
    });
    if (!ticket) {
      return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 });
    }

    if (ticket.ticketStatus === "CHECKED_IN") {
      return NextResponse.json({
        ok: true,
        alreadyCheckedIn: true,
        ticketId: ticket.id,
        checkedInAt: ticket.checkedInAt,
      });
    }

    if (ticket.ticketStatus !== "ISSUED") {
      return NextResponse.json(
        { ok: false, error: `Ticket is ${ticket.ticketStatus} — cannot check in` },
        { status: 409 }
      );
    }

    const now = new Date();
    const updated = await prisma.ticket.update({
      where: { id },
      data: { ticketStatus: "CHECKED_IN", checkedInAt: now, checkedInById: userId },
      select: { id: true, checkedInAt: true, orderId: true },
    });

    // Surface remaining siblings so the modal can chain-through without
    // a round-trip to the order tickets endpoint.
    const siblingsRemaining = await prisma.ticket.count({
      where: {
        orderId: updated.orderId,
        ticketStatus: "ISSUED",
        id: { not: updated.id },
      },
    });

    return NextResponse.json({
      ok: true,
      ticketId: updated.id,
      checkedInAt: updated.checkedInAt,
      siblingsRemaining,
    });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}
