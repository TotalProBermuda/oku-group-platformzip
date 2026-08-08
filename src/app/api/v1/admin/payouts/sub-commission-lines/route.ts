/**
 * GET /api/v1/admin/payouts/sub-commission-lines
 *
 * Lists unbatched, PENDING InfluencerSubCommissionLedger rows in a given date
 * range. Used by the payout admin UI to preview sub-commission rows before
 * attaching them to a draft PayoutBatch.
 *
 * Requires SUPERADMIN or ADMIN_FINANCE.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listEligibleSubCommissionLines } from "@/server/payouts/payoutBatchService";

const ALLOWED_ROLES = ["SUPERADMIN", "ADMIN_FINANCE"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as { roles?: string[] })?.roles ?? [];
  if (!roles.some(r => ALLOWED_ROLES.includes(r))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const fromStr = searchParams.get("from");
  const toStr = searchParams.get("to");
  if (!fromStr || !toStr) {
    return NextResponse.json({ error: "from and to are required" }, { status: 400 });
  }

  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const lines = await listEligibleSubCommissionLines({ from, to });
  return NextResponse.json({ lines });
}
