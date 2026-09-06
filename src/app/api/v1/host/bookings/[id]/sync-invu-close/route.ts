import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { pullBoundClosedOrder } from "@/server/services/invu/invuClosedOrdersService";

// Pull the recently closed, already-bound INVU check and let the normal INVU
// aggregation/minting pipeline be the sole authority for totals and commission.
// Hosts never submit a financial total or commission rate from this endpoint.
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId, roles } = await requireSession();
    const isSuperAdmin = roles.includes("SUPERADMIN");

    const reservation = await prisma.reservation.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      venueId: true,
      actualRevenueCents: true,
      assignedHost: { select: { userId: true } },
      attributionSession: {
        select: {
          tableSession: {
            select: { id: true, openedInvuOrderId: true },
          },
        },
      },
    },
  });

    if (!reservation) {
    return NextResponse.json({ ok: false, error: "Reservation not found" }, { status: 404 });
    }
    if (!isSuperAdmin && reservation.assignedHost?.userId !== userId) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    if (reservation.actualRevenueCents != null) {
    return NextResponse.json({ ok: false, error: "This reservation has already been financially closed" }, { status: 409 });
    }

    const tableSession = reservation.attributionSession?.tableSession;
    const invuOrderId = tableSession?.openedInvuOrderId;
    if (!tableSession || !invuOrderId) {
    return NextResponse.json({ ok: false, error: "Bind the open INVU order before syncing its close" }, { status: 409 });
    }

    // Directly query the exact bound `num_cita`. A date-range report remains
    // available to the admin sync, but must never be required to close a host
    // reservation or create its commission allocation.
    const lookup = await pullBoundClosedOrder({
      venueId: reservation.venueId,
      invuOrderId,
      triggeredByUserId: userId,
    });

    const synced = await prisma.tableSession.findUnique({
    where: { id: tableSession.id },
    select: {
      invuOrderId: true,
      grossCents: true,
      taxCents: true,
      discountCents: true,
      refundCents: true,
      commissionableCents: true,
      closedAt: true,
      status: true,
      allocations: {
        select: { earnerType: true, amountCents: true, status: true },
      },
    },
    });

    if (!synced?.closedAt || synced.invuOrderId !== invuOrderId) {
      const error = !lookup.found
        ? `INVU has no invoice for bound check ${invuOrderId}. Confirm the bound internal order number.`
        : !lookup.closed
          ? `INVU found check ${invuOrderId}, but it is not closed yet.`
          : `INVU returned check ${invuOrderId}, but it could not be matched to this reservation.`;
      return NextResponse.json({
        ok: false,
        error,
      }, { status: 409 });
    }

    return NextResponse.json({
      ok: true,
      invuOrderId,
      tableSession: {
        ...synced,
        commissionAllocations: synced.allocations,
      },
    });
  } catch (error) {
    console.error("Host INVU close sync failed", error);
    const isInvuAuthorizationIssue =
      error instanceof Error && error.message.includes("INVU getInvoiceByNumCita authorization or provider error");
    return NextResponse.json(
      {
        ok: false,
        error: isInvuAuthorizationIssue
          ? "INVU rejected the lookup. Reconnect the INVU integration or confirm this credential has invoice-search permission."
          : "Could not sync the INVU close. Please try again; if it persists, check the INVU connection.",
      },
      { status: 502 }
    );
  }
}
