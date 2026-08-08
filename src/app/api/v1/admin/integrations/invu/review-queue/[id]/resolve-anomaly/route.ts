import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { roles, userId } = await requireSession();
  if (!roles.includes("SUPERADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { resolution } = body as { resolution?: string };

  const item = await prisma.integrationReviewQueue.findUnique({
    where: { id: params.id },
    select: { id: true, tableSessionId: true, status: true, detailJson: true },
  });
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const detail = (item.detailJson as Record<string, unknown>) ?? {};

  await prisma.$transaction(async (tx) => {
    await tx.integrationReviewQueue.update({
      where: { id: params.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        detailJson: {
          ...detail,
          resolution: resolution?.trim() || "anomaly_resolved",
          resolvedByUserId: userId,
          resolvedAt: new Date().toISOString(),
        },
      },
    });

    if (item.tableSessionId) {
      // Only advance to MATCHED if the session already has a confirmed reservationId.
      // Pure anomaly resolution (no confirmed match) leaves status as-is.
      const session = await tx.tableSession.findUnique({
        where: { id: item.tableSessionId },
        select: { reservationId: true },
      });
      if (session?.reservationId) {
        await tx.tableSession.update({
          where: { id: item.tableSessionId },
          data: { status: "MATCHED" },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
