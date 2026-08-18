import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { assertSeriesReadyForPublication, SeriesPublicationError, syncSeriesOccupanciesForStatus } from "@/server/series/publicationLifecycle";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:experiences:write");
    const { id } = await params;

    const updated = await prisma.$transaction(async (tx) => {
      await assertSeriesReadyForPublication(tx, id);
      const series = await tx.series.update({ where: { id }, data: { status: "PUBLISHED" } });
      await syncSeriesOccupanciesForStatus(tx, id, "PUBLISHED");
      await tx.auditLog.create({ data: { actorId: userId, action: "EXPERIENCE_PUBLISHED", metadata: { seriesId: id } } });
      return series;
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: unknown) {
    if (e instanceof SeriesPublicationError) {
      return NextResponse.json({ ok: false, error: "This series is not ready to publish.", issues: e.issues }, { status: 409 });
    }
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not publish series." },
      { status: typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : 500 }
    );
  }
}
