import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { roles } = await requireSession();
  if (!roles.includes("SUPERADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const item = await prisma.integrationReviewQueue.findUnique({ where: { id: params.id } });
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.integrationReviewQueue.update({
      where: { id: params.id },
      data: {
        status: "REJECTED",
        resolvedAt: new Date(),
        detailJson: {
          ...(typeof item.detailJson === "object" && item.detailJson !== null
            ? (item.detailJson as Record<string, unknown>)
            : {}),
          resolution: "NO_MATCH",
          rejectedAt: new Date().toISOString(),
        },
      },
    });

    if (item.tableSessionId) {
      await tx.tableSession.update({
        where: { id: item.tableSessionId },
        data: {
          matchMethod: "UNMATCHED",
          reservationId: null,
          trustScore: 0.0,
          status: "PENDING_REVIEW",
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
