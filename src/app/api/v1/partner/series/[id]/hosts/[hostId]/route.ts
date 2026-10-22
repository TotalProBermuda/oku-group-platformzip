import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { legacySeriesMutation } from "@/server/series/legacySessionGuard";
import { requirePartnerForSeries, PartnerAuthError } from "@/lib/partnerAuth";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const PatchBody = z.object({
  isFrontFacing: z.boolean().optional(),
  commissionShareBps: z.number().int().min(0).max(10000).nullable().optional(),
  sortOrder: z.number().int().optional(),
}).strict();

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

    const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid host update" }, { status: 400 });
    const data: Prisma.SeriesHostUpdateInput = parsed.data;

    const host = await legacySeriesMutation(id, tx => tx.seriesHost.update({
      where: { id: hostId },
      data,
      include: { entity: { include: { linkedUser: { select: { id: true, name: true, email: true } } } } },
    }));
    return NextResponse.json({ ok: true, host });
  } catch (e: unknown) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

    await legacySeriesMutation(id, tx => tx.seriesHost.delete({ where: { id: hostId } }));
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "status" in e && e.status === 409) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Conflict" }, { status: 409 });
    }
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof Error && e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/hosts/:hostId] DELETE", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
