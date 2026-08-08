import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/v1/admin/integrations/invu/table-sessions/:id/cancel-binding
 *
 * Manually cancel a stuck POS bind for a TableSession that will never
 * reconcile through the normal sync→match path (most often: the host
 * pre-bound an INVU order, then the corresponding INVU order was
 * deleted before the sync polled it, so the bound `invuOrderId` will
 * never appear in any future sync). Without this action the row sits
 * in `PENDING_REVIEW + UNMATCHED` indefinitely and pollutes the
 * exceptions queue.
 *
 * Effects:
 *   - TableSession: status → DISPUTED (the closest cancel-ish terminal
 *     state in TableSessionStatus, which has no CANCELED variant),
 *     matchStatus → REJECTED, commissionEligibility → NOT_ELIGIBLE
 *   - AttributionSession (if linked): status → CANCELED
 *   - Any PENDING CommissionAllocation rows for this session → REVERSED
 *   - AuditLog entry capturing actor + reason
 *
 * Refuses to act on sessions that are already CLOSED, MATCHED, or
 * DISPUTED, and on sessions whose AttributionSession already reached
 * VERIFIED_POS_SALE — those need the regular dispute/reverse flow with
 * its own audit, not this lightweight cleanup.
 *
 * SUPERADMIN-only.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId, roles } = await requireSession();
  if (!roles.includes("SUPERADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  let body: { reason?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine; reason is optional
  }
  const reason = (body.reason ?? "").trim() || "Manual cancel — stuck binding cleanup";

  const session = await prisma.tableSession.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      matchStatus: true,
      attributionSessionId: true,
      attributionSession: { select: { id: true, status: true } },
    },
  });
  // (matchStatus is the deterministic enum read above; refusal logic uses it
  //  to block cancellation of healthy AUTO_MATCHED / MANUALLY_OVERRIDDEN rows.)
  if (!session) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  if (session.status === "MATCHED" || session.status === "CLOSED" || session.status === "DISPUTED") {
    return NextResponse.json(
      { ok: false, error: `Cannot cancel — TableSession is already ${session.status}` },
      { status: 400 }
    );
  }
  // Defensive: refuse on any healthy match outcome, not just on
  // VERIFIED_POS_SALE. A successful AUTO_MATCHED / MANUALLY_OVERRIDDEN
  // session is by definition not "stuck" — cancelling it would clobber
  // a real binding and reverse legitimate commissions. The full
  // dispute/reverse flow exists for that case and writes its own audit.
  if (session.matchStatus === "AUTO_MATCHED" || session.matchStatus === "MANUALLY_OVERRIDDEN") {
    return NextResponse.json(
      {
        ok: false,
        error: `Cannot cancel — TableSession matchStatus is ${session.matchStatus}. This action is only for stuck UNMATCHED bindings; use the dispute/reverse flow on a healthy match.`,
      },
      { status: 400 }
    );
  }
  if (session.attributionSession?.status === "VERIFIED_POS_SALE") {
    return NextResponse.json(
      { ok: false, error: "Cannot cancel — AttributionSession is already VERIFIED_POS_SALE; use the dispute flow" },
      { status: 400 }
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    await tx.tableSession.update({
      where: { id },
      data: {
        status: "DISPUTED",
        matchStatus: "REJECTED",
        commissionEligibility: "NOT_ELIGIBLE",
      },
    });

    if (session.attributionSessionId) {
      await tx.attributionSession.updateMany({
        where: {
          id: session.attributionSessionId,
          status: { in: ["CAPTURED", "SEATED", "POS_BIND_INTENT_RECORDED", "BOUND_TO_POS"] },
        },
        data: { status: "CANCELED" },
      });
    }

    const reversal = await tx.commissionAllocation.updateMany({
      where: { tableSessionId: id, status: "PENDING" },
      data: { status: "REVERSED" },
    });

    return { reversedAllocationCount: reversal.count };
  });

  // Best-effort audit (post-commit; failure must not undo the cancel).
  try {
    await prisma.auditLog.create({
      data: {
        actorId: userId ?? "system",
        action: "INVU_BINDING_CANCELED",
        metadata: {
          tableSessionId: id,
          attributionSessionId: session.attributionSessionId,
          reason,
          reversedAllocationCount: result.reversedAllocationCount,
        },
      },
    });
  } catch {
    // swallow
  }

  return NextResponse.json({
    ok: true,
    data: {
      tableSessionId: id,
      reversedAllocationCount: result.reversedAllocationCount,
    },
  });
}
