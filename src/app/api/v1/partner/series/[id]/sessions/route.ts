import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePartnerForSeries, PartnerAuthError, hasFullSeriesAccess, accessibleSessionIds } from "@/lib/partnerAuth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requirePartnerForSeries(id);

    const where: Prisma.SessionWhereInput = { seriesId: id };
    if (!hasFullSeriesAccess(auth)) {
      where.id = { in: Array.from(accessibleSessionIds(auth)) };
    }

    const sessions = await prisma.session.findMany({
      where,
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        soldCount: true,
        status: true,
        Order: { where: { status: "PAID" }, select: { totalCents: true } },
      },
    });

    const list = sessions.map((s) => {
      const grossCents = s.Order.reduce((acc, o) => acc + o.totalCents, 0);
      return {
        id: s.id,
        title: s.title,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
        capacity: s.capacity,
        soldCount: s.soldCount,
        status: s.status,
        ordersCount: s.Order.length,
        grossCents,
      };
    });

    return NextResponse.json({ ok: true, sessions: list });
  } catch (e: unknown) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/series/sessions] GET", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
