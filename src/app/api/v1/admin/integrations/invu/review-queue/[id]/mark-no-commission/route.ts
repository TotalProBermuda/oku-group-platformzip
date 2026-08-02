import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { roles, userId } = await requireSession();
  if (!roles.includes("SUPERADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const item = await prisma.integrationReviewQueue.findUnique({
    where: { id: params.id },
    select: { id: true, tableSessionId: true, status: true, detailJson: true },
  });
  if (!item) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Idempotency guard: if the item is already resolved, return 409 to prevent double reversal.
  if (item.status === "RESOLVED" || item.status === "REJECTED") {
    return NextResponse.json({ ok: false, error: "Already resolved" }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    const detail = (item.detailJson as Record<string, unknown>) ?? {};
    await tx.integrationReviewQueue.update({
      where: { id: params.id },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        detailJson: {
          ...detail,
          resolution: "no_commission",
          resolvedByUserId: userId,
          resolvedAt: new Date().toISOString(),
        },
      },
    });

    if (item.tableSessionId) {
      await tx.tableSession.update({
        where: { id: item.tableSessionId },
        data: { commissionableCents: 0, status: "CLOSED" },
      });

      // Create REVERSED entries for any PENDING or APPROVED allocations to zero them out.
      // PAID allocations are already disbursed and require a manual finance adjustment outside this system.
      const pendingAllocs = await tx.commissionAllocation.findMany({
        where: { tableSessionId: item.tableSessionId, status: { in: ["PENDING", "APPROVED"] } },
      });
      for (const alloc of pendingAllocs) {
        await tx.commissionAllocation.create({
          data: {
            tableSessionId: item.tableSessionId,
            earnerType: alloc.earnerType,
            earnerRefId: alloc.earnerRefId,
            amountCents: -Math.abs(alloc.amountCents),
            currency: alloc.currency,
            status: "REVERSED",
            commissionRuleSnapshot: {
              ...(alloc.commissionRuleSnapshot as object),
              reversalReason: "no_commission_marked",
              resolvedByUserId: userId,
              originalAllocationId: alloc.id,
            },
          },
        });
      }
    }
  });

  return NextResponse.json({ ok: true });
}
