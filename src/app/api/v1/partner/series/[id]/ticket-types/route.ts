import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartnerForSeries, PartnerAuthError } from "@/lib/partnerAuth";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requirePartnerForSeries(id);

    const ticketTypes = await prisma.ticketType.findMany({
      where: { seriesId: id },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        name: true,
        tierCode: true,
        priceCents: true,
        currency: true,
        ticketStatus: true,
      },
    });
    return NextResponse.json({ ok: true, ticketTypes });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/ticket-types]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
