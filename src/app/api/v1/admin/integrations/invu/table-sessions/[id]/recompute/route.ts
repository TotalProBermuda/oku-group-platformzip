import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { aggregateToTableSession } from "@/server/services/invu/invuAggregationService";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { roles } = await requireSession();
  if (!roles.includes("SUPERADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const session = await prisma.tableSession.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      invuOrderId: true,
      venueId: true,
      syncRunId: true,
      tableLabel: true,
      openedAt: true,
      closedAt: true,
    },
  });
  if (!session) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Find normalized record: use invuOrderId when available, otherwise constrain by
  // table label + time window to avoid matching unrelated records (null invuOrderId safety).
  // Mirror aggregation's OR(openedAt, closedAt) logic so sparse records with null openedAt
  // are found via closedAt (avoids false 422s).
  let normalized = null;

  if (session.invuOrderId) {
    normalized = await prisma.invuOrderNormalized.findFirst({
      where: { invuOrderId: session.invuOrderId, venueId: session.venueId },
    });
  } else {
    const sessionTime = session.openedAt ?? session.closedAt;
    if (session.tableLabel && sessionTime) {
      const windowStart = new Date(sessionTime.getTime() - 30 * 60 * 1000);
      const windowEnd = new Date(sessionTime.getTime() + 30 * 60 * 1000);
      normalized = await prisma.invuOrderNormalized.findFirst({
        where: {
          venueId: session.venueId,
          tableLabel: session.tableLabel,
          invuOrderId: null,
          OR: [
            { openedAt: { gte: windowStart, lte: windowEnd } },
            { closedAt: { gte: windowStart, lte: windowEnd } },
          ],
          ...(session.syncRunId ? { syncRunId: session.syncRunId } : {}),
        },
      });
    }
  }

  if (!normalized) {
    return NextResponse.json(
      { ok: false, error: "No normalized record found — cannot recompute" },
      { status: 422 }
    );
  }

  await aggregateToTableSession({
    normalized,
    venueId: session.venueId,
    syncRunId: session.syncRunId ?? "recompute",
  });

  const updated = await prisma.tableSession.findUnique({ where: { id: params.id } });
  return NextResponse.json({ ok: true, data: updated });
}
