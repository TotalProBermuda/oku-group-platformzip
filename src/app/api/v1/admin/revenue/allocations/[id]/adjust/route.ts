import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

/**
 * Append a signed correction to a PENDING allocation. The original INVU-backed
 * allocation remains untouched and the audit log captures both amounts.
 * Adjustments are deliberately disallowed once approval/payout processing has
 * begun, preventing silent changes to an already-approved payment.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:revenue:write");

    const body = await req.json().catch(() => ({}));
    const targetAmountCents = Number(body.targetAmountCents);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!Number.isSafeInteger(targetAmountCents) || targetAmountCents < 0) {
      return NextResponse.json({ ok: false, error: "A non-negative whole-cent target amount is required." }, { status: 400 });
    }
    if (reason.length < 10 || reason.length > 1000) {
      return NextResponse.json({ ok: false, error: "A correction reason between 10 and 1000 characters is required." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const allocation = await tx.commissionAllocation.findUnique({
        where: { id },
        include: {
          adjustments: { select: { deltaCents: true } },
          ledgerEntries: { select: { id: true, payoutBatchId: true }, take: 1 },
        },
      });
      if (!allocation) return { error: "Not found", status: 404 } as const;
      if (allocation.status !== "PENDING" || allocation.ledgerEntries.length > 0) {
        return { error: "Only an unapproved, unbatched PENDING allocation can be adjusted.", status: 409 } as const;
      }

      const priorAdjustmentCents = allocation.adjustments.reduce((sum, adjustment) => sum + adjustment.deltaCents, 0);
      const beforeCents = allocation.amountCents + priorAdjustmentCents;
      const deltaCents = targetAmountCents - beforeCents;
      if (deltaCents === 0) return { error: "The target equals the current payable amount; no adjustment was created.", status: 400 } as const;

      const adjustment = await tx.commissionAllocationAdjustment.create({
        data: { allocationId: id, deltaCents, reason, actorId: userId },
        select: { id: true, deltaCents: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "commission_allocation.adjusted",
          metadata: {
            allocationId: id,
            adjustmentId: adjustment.id,
            tableSessionId: allocation.tableSessionId,
            reason,
            beforeAmountCents: beforeCents,
            deltaCents,
            afterAmountCents: targetAmountCents,
          },
        },
      });
      return { adjustment, beforeCents, effectiveAmountCents: targetAmountCents } as const;
    });

    if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const err = error as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status ?? 500 });
  }
}
