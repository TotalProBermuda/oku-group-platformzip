import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { pullLast7DaysClosedOrders } from "@/server/services/invu/invuClosedOrdersService";

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

  // A tight pull keeps the operational action fast while allowing normal
  // INVU endpoint delays. The sync service safely de-duplicates records.
    await pullLast7DaysClosedOrders({
    venueId: reservation.venueId,
    triggeredByUserId: userId,
    windowMinutes: 120,
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
    return NextResponse.json({
      ok: false,
      error: `INVU has not returned a closed check for ${invuOrderId} yet. Try again shortly; no manual total is required.`,
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
    return NextResponse.json(
      { ok: false, error: "Could not sync the INVU close. Please try again; if it persists, check the INVU connection." },
      { status: 502 }
    );
  }
}
