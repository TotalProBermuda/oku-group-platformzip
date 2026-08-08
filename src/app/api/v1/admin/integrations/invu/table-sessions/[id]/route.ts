import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { roles } = await requireSession();
  if (!roles.includes("SUPERADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const session = await prisma.tableSession.findUnique({
    where: { id },
    include: {
      venue: { select: { name: true } },
      reservation: {
        select: {
          confirmationCode: true,
          contactName: true,
          attributions: {
            include: { referrer: { select: { id: true } } },
            take: 3,
          },
          assignedRestaurantHostId: true,
        },
      },
      allocations: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!session) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const reviewItems = await prisma.integrationReviewQueue.findMany({
    where: { tableSessionId: id },
    orderBy: { createdAt: "desc" },
  });

  let rawRecord = null;
  let normalizedRecord = null;
  let syncRun = null;

  // Deterministic raw/normalized lookup tied to this session's invuOrderId
  if (session.invuOrderId) {
    // Primary: match by invuOrderId — guaranteed to belong to this session
    const normalized = await prisma.invuOrderNormalized.findFirst({
      where: { invuOrderId: session.invuOrderId, venueId: session.venueId },
      select: {
        id: true,
        rawRecordId: true,
        invuOrderId: true,
        publicOrderNumber: true,
        tableLabel: true,
        customerName: true,
        guestCount: true,
        openedAt: true,
        closedAt: true,
        statusCanonical: true,
        grossCents: true,
        discountCents: true,
        taxCents: true,
        tipCents: true,
        refundCents: true,
        netRevenueCents: true,
      },
    });
    normalizedRecord = normalized;

    if (normalized?.rawRecordId) {
      rawRecord = await prisma.invuOrderRaw.findUnique({
        where: { id: normalized.rawRecordId },
        select: { id: true, invuOrderId: true, payloadType: true, pulledAt: true },
      });
    }
  } else if (session.syncRunId && session.tableLabel && (session.openedAt || session.closedAt)) {
    // Fallback for sessions without invuOrderId: match by table label + time window in same sync run.
    // Use OR(openedAt, closedAt) to match sparse records where openedAt may be null.
    const sessionTime = session.openedAt ?? session.closedAt!;
    const windowStart = new Date(sessionTime.getTime() - 30 * 60 * 1000);
    const windowEnd = new Date(sessionTime.getTime() + 30 * 60 * 1000);
    const normalized = await prisma.invuOrderNormalized.findFirst({
      where: {
        venueId: session.venueId,
        tableLabel: session.tableLabel,
        invuOrderId: null,
        OR: [
          { openedAt: { gte: windowStart, lte: windowEnd } },
          { closedAt: { gte: windowStart, lte: windowEnd } },
        ],
        syncRunId: session.syncRunId,
      },
      select: {
        id: true,
        rawRecordId: true,
        invuOrderId: true,
        publicOrderNumber: true,
        tableLabel: true,
        customerName: true,
        guestCount: true,
        openedAt: true,
        closedAt: true,
        statusCanonical: true,
        grossCents: true,
        discountCents: true,
        taxCents: true,
        tipCents: true,
        refundCents: true,
        netRevenueCents: true,
      },
    });
    normalizedRecord = normalized;

    if (normalized?.rawRecordId) {
      rawRecord = await prisma.invuOrderRaw.findUnique({
        where: { id: normalized.rawRecordId },
        select: { id: true, invuOrderId: true, payloadType: true, pulledAt: true },
      });
    }
  }

  if (session.syncRunId) {
    syncRun = await prisma.integrationSyncRun.findUnique({
      where: { id: session.syncRunId },
      select: { id: true, scopeType: true, triggeredByUserId: true, startedAt: true, status: true },
    });
  }

  return NextResponse.json({
    ok: true,
    data: {
      ...session,
      rawRecord,
      normalizedRecord,
      syncRun,
      reviewItems,
    },
  });
}
