import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartnerForSeries, PartnerAuthError } from "@/lib/partnerAuth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; hostId: string }> },
) {
  try {
    const { id, hostId } = await params;
    const auth = await requirePartnerForSeries(id);
    if (!auth.isSeriesPartner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await prisma.seriesHost.findFirst({
      where: { id: hostId, seriesId: id },
      select: { id: true, role: true },
    });
    if (!existing) return NextResponse.json({ error: "Host not found" }, { status: 404 });
    if (existing.role !== "CO_HOST") {
      return NextResponse.json({ error: "Partners may only edit CO_HOST entries" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const data: any = {};
    if ("isFrontFacing" in body) data.isFrontFacing = !!body.isFrontFacing;
    if ("commissionShareBps" in body) {
      const v = body.commissionShareBps;
      if (v != null && (typeof v !== "number" || v < 0 || v > 10000)) {
        return NextResponse.json({ error: "commissionShareBps must be 0..10000 or null" }, { status: 400 });
      }
      data.commissionShareBps = v;
    }
    if ("sortOrder" in body && typeof body.sortOrder === "number") data.sortOrder = body.sortOrder;

    const host = await prisma.seriesHost.update({
      where: { id: hostId },
      data,
      include: { entity: { include: { linkedUser: { select: { id: true, name: true, email: true } } } } },
    });
    return NextResponse.json({ ok: true, host });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/hosts/:hostId] PATCH", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; hostId: string }> },
) {
  try {
    const { id, hostId } = await params;
    const auth = await requirePartnerForSeries(id);
    if (!auth.isSeriesPartner) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const existing = await prisma.seriesHost.findFirst({
      where: { id: hostId, seriesId: id },
      select: { role: true },
    });
    if (!existing) return NextResponse.json({ error: "Host not found" }, { status: 404 });
    if (existing.role !== "CO_HOST") {
      return NextResponse.json({ error: "Partners may only remove CO_HOST entries" }, { status: 403 });
    }

    await prisma.seriesHost.delete({ where: { id: hostId } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/hosts/:hostId] DELETE", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
