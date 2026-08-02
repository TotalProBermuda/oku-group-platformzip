import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartnerForSeries, PartnerAuthError, hasFullSeriesAccess, accessibleSessionIds } from "@/lib/partnerAuth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requirePartnerForSeries(id);

    const where: any = { seriesId: id };
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
      const { Order, ...rest } = s as any;
      return { ...rest, ordersCount: s.Order.length, grossCents };
    });

    return NextResponse.json({ ok: true, sessions: list });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/series/sessions] GET", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
