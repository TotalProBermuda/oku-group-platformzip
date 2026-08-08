import { prisma } from "@/lib/prisma";

// When a credit note is detected for an existing TableSession, this processor:
// 1. Finds the matching TableSession by invuOrderId
// 2. Updates refundCents, recalculates netRevenueCents and commissionableCents
// 3. Creates REVERSED CommissionAllocation rows for each affected earner
// 4. Flags DISPUTED if any prior allocation was PAID

export async function processCreditNote(params: {
  invuOrderId: string;
  venueId: string;
  creditAmountCents: number;
  syncRunId: string;
}): Promise<{ tableSessionId: string | null; updated: boolean }> {
  const { invuOrderId, venueId, creditAmountCents, syncRunId } = params;

  const session = await prisma.tableSession.findFirst({
    where: { invuOrderId, venueId },
    include: { allocations: true },
  });

  if (!session) {
    console.warn(`[creditNotes] No TableSession found for invuOrderId=${invuOrderId} venueId=${venueId}`);
    return { tableSessionId: null, updated: false };
  }

  const newRefundCents = session.refundCents + creditAmountCents;
  const newNet = Math.max(0, session.grossCents - session.discountCents - newRefundCents);
  const newCommissionable = Math.max(0, newNet);

  const hasPaidAllocations = session.allocations.some((a) => a.status === "PAID");

  await prisma.$transaction(async (tx) => {
    await tx.tableSession.update({
      where: { id: session.id },
      data: {
        refundCents: newRefundCents,
        netRevenueCents: newNet,
        commissionableCents: newCommissionable,
        status: hasPaidAllocations ? "DISPUTED" : session.status,
      },
    });

    // Create REVERSED allocations for each affected earner.
    // Guard against duplicate reversals: skip if a REVERSED row already references this allocation,
    // preventing over-reversal when multiple credit notes arrive for the same session.
    const existingReversalIds = new Set(
      session.allocations
        .filter((a) => a.status === "REVERSED")
        .map((a) => (a.commissionRuleSnapshot as Record<string, unknown>)?.originalAllocationId)
        .filter(Boolean)
    );

    for (const alloc of session.allocations) {
      if (
        (alloc.status === "PAID" || alloc.status === "APPROVED" || alloc.status === "PENDING") &&
        !existingReversalIds.has(alloc.id)
      ) {
        const reverseAmount = -Math.abs(alloc.amountCents);
        await tx.commissionAllocation.create({
          data: {
            tableSessionId: session.id,
            earnerType: alloc.earnerType,
            earnerRefId: alloc.earnerRefId,
            amountCents: reverseAmount,
            currency: alloc.currency,
            status: "REVERSED",
            commissionRuleSnapshot: {
              ...(alloc.commissionRuleSnapshot as object),
              reversalReason: "credit_note",
              syncRunId,
              originalAllocationId: alloc.id,
            },
          },
        });
      }
    }

    // Create review queue item if original allocation was PAID, with dedup to prevent
    // operational noise when multiple credit notes arrive for the same session.
    if (hasPaidAllocations) {
      const existingAmbiguity = await tx.integrationReviewQueue.findFirst({
        where: {
          tableSessionId: session.id,
          issueType: "CREDIT_NOTE_AMBIGUITY",
          status: { in: ["OPEN", "IN_REVIEW"] },
        },
        select: { id: true },
      });

      if (!existingAmbiguity) {
        await tx.integrationReviewQueue.create({
          data: {
            venueId,
            syncRunId,
            tableSessionId: session.id,
            issueType: "CREDIT_NOTE_AMBIGUITY",
            status: "OPEN",
            summary: `Credit note of $${(creditAmountCents / 100).toFixed(2)} applied to order ${invuOrderId} — prior paid allocations reversed`,
            detailJson: {
              invuOrderId,
              creditAmountCents,
              affectedAllocationCount: session.allocations.filter((a) => a.status === "PAID").length,
            },
          },
        });
      }
    }
  });

  return { tableSessionId: session.id, updated: true };
}
