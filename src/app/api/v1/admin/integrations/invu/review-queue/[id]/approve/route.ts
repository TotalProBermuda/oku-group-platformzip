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
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });

    if (item.tableSessionId) {
      await tx.tableSession.update({
        where: { id: item.tableSessionId },
        data: { status: "MATCHED" },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
