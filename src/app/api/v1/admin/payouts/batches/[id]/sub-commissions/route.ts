/**
 * POST /api/v1/admin/payouts/batches/[id]/sub-commissions
 *
 * Attach a set of unbatched InfluencerSubCommissionLedger rows to a DRAFT
 * PayoutBatch. The batch must be in DRAFT status; rows must be unbatched +
 * PENDING. Stamping is atomic and idempotent-safe via the payoutBatchId null
 * guard.
 *
 * DELETE /api/v1/admin/payouts/batches/[id]/sub-commissions
 *
 * Release all sub-commission rows from this batch back to the eligible pool.
 * Only allowed on DRAFT batches (same lifecycle constraint as discardDraft).
 *
 * Requires SUPERADMIN or ADMIN_FINANCE.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  attachSubCommissionsToBatch,
  detachSubCommissionsFromBatch,
} from "@/server/payouts/payoutBatchService";

const ALLOWED_ROLES = ["SUPERADMIN", "ADMIN_FINANCE"];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as { roles?: string[] })?.roles ?? [];
  if (!roles.some(r => ALLOWED_ROLES.includes(r))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actorId = (session?.user as { id?: string })?.id;
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(body?.subCommissionLedgerIds)
    ? body.subCommissionLedgerIds
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "subCommissionLedgerIds must be a non-empty array" }, { status: 400 });
  }

  try {
    const result = await attachSubCommissionsToBatch({
      batchId: params.id,
      subCommissionLedgerIds: ids,
      actorId,
    });
    return NextResponse.json({ ok: true, attached: result.attached });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as { roles?: string[] })?.roles ?? [];
  if (!roles.some(r => ALLOWED_ROLES.includes(r))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actorId = (session?.user as { id?: string })?.id;
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    // detachSubCommissionsFromBatch enforces DRAFT-only at the service layer
    // and writes a DETACH_SUB_COMMISSIONS audit entry with the actorId.
    const result = await detachSubCommissionsFromBatch(params.id, undefined, actorId);
    return NextResponse.json({ ok: true, released: result.released });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
