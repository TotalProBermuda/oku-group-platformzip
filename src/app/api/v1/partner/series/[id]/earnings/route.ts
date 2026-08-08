import { NextRequest, NextResponse } from "next/server";
import { requirePartnerForSeries, PartnerAuthError, hasFullSeriesAccess, accessibleSessionIds } from "@/lib/partnerAuth";
import { getPartnerEarnings, type SeatCommissionContext } from "@/server/partner/earningsService";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requirePartnerForSeries(id);
    const sessionId = req.nextUrl.searchParams.get("sessionId");

    const fullAccess = hasFullSeriesAccess(auth);
    const allowedSessions = accessibleSessionIds(auth);
    let restrictToSessionIds: Set<string> | null = null;
    if (!fullAccess) {
      if (sessionId && !allowedSessions.has(sessionId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      restrictToSessionIds = sessionId ? new Set([sessionId]) : new Set(allowedSessions);
    } else if (sessionId) {
      restrictToSessionIds = new Set([sessionId]);
    }

    // Resolve caller's sales-enabled delegate seat for this series, if any.
    // Series-scoped (sessionId == null) ACTIVE seats with isReferrerEnabled
    // determine the personalized commission shown on Sales & Earnings.
    let callerSeat: SeatCommissionContext | null = null;
    if (!auth.isSeriesPartner) {
      const seat = await prisma.partnerDelegateSeat.findFirst({
        where: {
          seriesId: id,
          sessionId: null,
          status: "ACTIVE",
          acceptedByUserId: auth.userId,
          isReferrerEnabled: true,
        },
        select: {
          commissionMode: true,
          flatAmountCents: true,
          perSeatAmountCents: true,
          percentageBps: true,
        },
      });
      if (seat) callerSeat = seat;
    }

    const summary = await getPartnerEarnings(id, { restrictToSessionIds, callerSeat });
    return NextResponse.json({ ok: true, ...summary });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/earnings]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
