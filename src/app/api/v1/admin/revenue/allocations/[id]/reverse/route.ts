import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

/**
 * Reverse a commission allocation by creating a NEW REVERSED row with a
 * negative amountCents that offsets the original. The original allocation
 * row is preserved as immutable financial history.
 *
 * Atomicity / idempotency:
 *   The reversal row carries `parentAllocationId = original.id`. A DB-level
 *   partial unique index on parentAllocationId WHERE status='REVERSED' ensures
 *   exactly one reversal per original — concurrent requests both trying to
 *   reverse the same allocation will collide on P2002; the loser receives 409.
 *
 * Payout-batch gate:
 *   If the original allocation's LedgerEntry is already assigned to a
 *   PayoutBatch (payoutBatchId IS NOT NULL), the reversal is blocked. Once a
 *   commission has been batched for payment it requires a controlled recovery
 *   process, not an ad-hoc negative ledger entry. Admins must handle this
 *   through the payout batch management workflow.
 *
 * Ledger propagation:
 *   If the original allocation was bridged (COMMISSION_EARNED LedgerEntry exists,
 *   not yet in a batch), an offsetting COMMISSION_REVERSED LedgerEntry is
 *   created atomically with the reversal allocation, so payoutBatchService sees
 *   a net-zero effect.
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
    const adjustmentNote = body.adjustmentNote ?? body.note ?? "";

    const existing = await prisma.commissionAllocation.findUnique({
      where: { id },
      include: {
        ledgerEntries: {
          select: { id: true, influencerId: true, currency: true, payoutBatchId: true },
          take: 1,
        },
      },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    if (existing.status === "REVERSED") {
      return NextResponse.json(
        { ok: false, error: "Allocation is already reversed." },
        { status: 400 }
      );
    }

    // Terminal/paid statuses — block reversal; requires payout recovery workflow.
    if (existing.status === "PAID") {
      return NextResponse.json(
        {
          ok: false,
          error: "Cannot reverse a PAID allocation. Use the payout batch recovery workflow.",
        },
        { status: 400 }
      );
    }

    // Payout-batch gate: if the LedgerEntry is already assigned to a batch,
    // block reversal — the commission has been queued for payment and requires
    // a controlled recovery, not an unbatched negative offset.
    const originalLedgerEntry = existing.ledgerEntries[0] ?? null;
    if (originalLedgerEntry?.payoutBatchId) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot reverse this allocation: its LedgerEntry is assigned to payout batch ${originalLedgerEntry.payoutBatchId}. ` +
            "Use the payout batch management workflow to recover over-paid commissions.",
          payoutBatchId: originalLedgerEntry.payoutBatchId,
        },
        { status: 409 }
      );
    }

    const originalSnapshot =
      existing.commissionRuleSnapshot &&
      typeof existing.commissionRuleSnapshot === "object" &&
      !Array.isArray(existing.commissionRuleSnapshot)
        ? (existing.commissionRuleSnapshot as Record<string, unknown>)
        : {};

    // Atomic: create reversal allocation (with parentAllocationId set for DB-level
    // one-reversal-per-original enforcement) + offsetting LedgerEntry if needed.
    let reversal: { id: string; amountCents: number };
    let reversalLedgerEntry: { id: string } | null = null;
    try {
      const txResult = await prisma.$transaction(async (tx) => {
        const rev = await tx.commissionAllocation.create({
          data: {
            tableSessionId: existing.tableSessionId,
            earnerType: existing.earnerType,
            earnerRefId: existing.earnerRefId,
            amountCents: -existing.amountCents,
            currency: existing.currency,
            status: "REVERSED",
            parentAllocationId: existing.id,
            commissionRuleSnapshot: {
              ...originalSnapshot,
              reversalOf: {
                originalAllocationId: existing.id,
                originalAmountCents: existing.amountCents,
                originalStatus: existing.status,
                adjustmentNote,
                reversedBy: userId,
                reversedAt: new Date().toISOString(),
              },
            },
          },
          select: { id: true, amountCents: true },
        });

        // If the original was bridged (and not yet in a batch — checked above),
        // create a COMMISSION_REVERSED LedgerEntry so payout batch sees net zero.
        let revEntry: { id: string } | null = null;
        if (originalLedgerEntry) {
          // IMPORTANT: payoutBatchService aggregates as `net = gross - reversed`
          // where `reversed = sum(COMMISSION_REVERSED.amountCents)`.
          // Reversal LedgerEntries must store a POSITIVE amount equal to the
          // original — the service applies the sign by entry type.
          revEntry = await tx.ledgerEntry.create({
            data: {
              influencerId: originalLedgerEntry.influencerId,
              type: "COMMISSION_REVERSED",
              amountCents: existing.amountCents, // positive — payout service subtracts by type
              currency: originalLedgerEntry.currency,
              commissionAllocationId: rev.id,
              note: `Reversal of commission allocation ${existing.id}`,
            },
            select: { id: true },
          });
        }

        return { rev, revEntry };
      });

      reversal = txResult.rev;
      reversalLedgerEntry = txResult.revEntry;
    } catch (err) {
      // P2002 on parentAllocationId partial unique index — another concurrent
      // request already reversed this allocation. Treat as idempotent 409.
      const prismaErr = err as { code?: string };
      if (prismaErr.code === "P2002") {
        return NextResponse.json(
          { ok: false, error: "A reversal for this allocation already exists (concurrent request won)." },
          { status: 409 }
        );
      }
      throw err;
    }

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "commission_allocation.reversed",
        metadata: {
          originalAllocationId: existing.id,
          reversalAllocationId: reversal.id,
          reversalLedgerEntryId: reversalLedgerEntry?.id ?? null,
          tableSessionId: existing.tableSessionId,
          adjustmentNote,
          before: { status: existing.status, amountCents: existing.amountCents },
          after: {
            reversalAmountCents: reversal.amountCents,
            reversalStatus: "REVERSED",
            ledgerReversed: !!reversalLedgerEntry,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      data: { original: existing, reversal, reversalLedgerEntry },
    });
  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status || 500 });
  }
}
