import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

/**
 * Reverse a commission allocation by creating a NEW REVERSED row with a
 * negative amountCents that offsets the original. The original allocation
 * row is preserved as immutable financial history.
 *
 * The CommissionAllocation schema has no parent-allocation FK column, so the
 * link to the original is recorded in `commissionRuleSnapshot.originalAllocationId`
 * and in the AuditLog metadata.
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

    const existing = await prisma.commissionAllocation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    if (existing.status === "REVERSED") {
      return NextResponse.json(
        { ok: false, error: "Allocation is already reversed." },
        { status: 400 }
      );
    }

    const originalSnapshot =
      existing.commissionRuleSnapshot &&
      typeof existing.commissionRuleSnapshot === "object" &&
      !Array.isArray(existing.commissionRuleSnapshot)
        ? (existing.commissionRuleSnapshot as Record<string, unknown>)
        : {};

    const reversal = await prisma.commissionAllocation.create({
      data: {
        tableSessionId: existing.tableSessionId,
        earnerType: existing.earnerType,
        earnerRefId: existing.earnerRefId,
        amountCents: -existing.amountCents,
        currency: existing.currency,
        status: "REVERSED",
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
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "commission_allocation.reversed",
        metadata: {
          originalAllocationId: existing.id,
          reversalAllocationId: reversal.id,
          tableSessionId: existing.tableSessionId,
          adjustmentNote,
          before: { status: existing.status, amountCents: existing.amountCents },
          after: { reversalAmountCents: reversal.amountCents, reversalStatus: "REVERSED" },
        },
      },
    });

    return NextResponse.json({ ok: true, data: { original: existing, reversal } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
