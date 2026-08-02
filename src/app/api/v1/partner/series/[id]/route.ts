import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartnerForSeries, PartnerAuthError } from "@/lib/partnerAuth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requirePartnerForSeries(id);

    const detail = await prisma.series.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        description: true,
        status: true,
        venue: true,
        city: true,
        country: true,
        venueAddress: true,
        heroImageUrl: true,
        startsAt: true,
        endsAt: true,
        capacityTotal: true,
        capacityReserved: true,
        capacitySold: true,
        partnerShareBps: true,
        partner: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({
      ok: true,
      series: detail,
      access: {
        isSeriesPartner: auth.isSeriesPartner,
        isSeriesDelegate: auth.isSeriesDelegate,
        coHostSessionIds: Array.from(auth.coHostSessionIds),
        delegateSessionIds: Array.from(auth.delegateSessionIds),
      },
    });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/series] GET", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
