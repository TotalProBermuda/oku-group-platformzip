import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { bridgeAllocationToLedger } from "@/server/services/invu/commissionLedgerBridge";

// Terminal/held statuses that cannot transition to APPROVED.
const TERMINAL_STATUSES = new Set([
  "PAID",
  "DISPUTED",
  "REVERSED",
  "HELD_FOR_REVIEW",
  "HELD_FOR_BENEFICIARY_MAPPING",
]);

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:revenue:write");

    const existing = await prisma.commissionAllocation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // Terminal or held statuses cannot be approved.
    if (TERMINAL_STATUSES.has(existing.status)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot approve allocation in status ${existing.status}.`,
        },
        { status: 400 }
      );
    }

    // PROCESSING means already APPROVED and bridge succeeded — idempotent.
    if (existing.status === "PROCESSING") {
      const bridgeResult = await bridgeAllocationToLedger(id);
      return NextResponse.json({ ok: true, data: existing, bridgeOutcome: bridgeResult.outcome });
    }

    let updated = existing;

    if (existing.status === "PENDING") {
      // Normal path: transition PENDING → APPROVED.
      updated = await prisma.commissionAllocation.update({
        where: { id },
        data: { status: "APPROVED" },
      });

      await prisma.auditLog.create({
        data: {
          actorId: userId,
          action: "commission_allocation.approved",
          metadata: {
            allocationId: id,
            tableSessionId: existing.tableSessionId,
            before: { status: existing.status },
            after: { status: "APPROVED" },
          },
        },
      });
    }
    // If status is APPROVED (bridge previously failed), fall through to retry bridge.

    // Bridge to LedgerEntry — synchronous so failures are surfaced immediately.
    // bridgeAllocationToLedger is idempotent: retrying after a failure is safe.
    let bridgeOutcome: string;
    try {
      const bridgeResult = await bridgeAllocationToLedger(id);
      bridgeOutcome = bridgeResult.outcome;
    } catch (err) {
      // Bridge threw (e.g. transient DB error). Allocation is already APPROVED.
      // The operator can retry this endpoint — bridge is idempotent and picks
      // up where it left off. Surface the error clearly so ops can act.
      console.error("[allocation.approve] ledger bridge threw unexpectedly", { allocationId: id, err });
      return NextResponse.json(
        {
          ok: false,
          error: "Allocation approved but ledger bridge failed — retry this endpoint to re-attempt bridging.",
          allocationId: id,
          bridgeError: (err as Error)?.message ?? String(err),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: updated, bridgeOutcome });
  } catch (e: unknown) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ ok: false, error: err.message }, { status: err.status || 500 });
  }
}
