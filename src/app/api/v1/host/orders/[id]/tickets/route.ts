import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

// GET /api/v1/host/orders/[id]/tickets
// Returns the tickets in an order — used by the scan modal to render
// the "chain-through" list when one ticket of a multi-ticket order has
// just been scanned (so the host can knock out the rest of the party
// without re-scanning the buyer's phone).
//
// Returned in createdAt order so the list is stable across renders. We
// surface ticketStatus + checkedInAt so the modal can mark already-
// checked-in attendees as done without an extra fetch.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "host:reservations:checkin");

    const { id } = await params;

    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        coversCount: true,
        tickets: {
          select: {
            id: true,
            code: true,
            attendeeName: true,
            attendeeEmail: true,
            ticketStatus: true,
            checkedInAt: true,
            ticketType: { select: { name: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, order });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}
