/**
 * POST /api/v1/admin/payments/intents/[id]/void
 *
 * Voids an authorized-but-uncaptured payment intent.
 * SUPERADMIN only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { voidPayment } from "@/server/payments/reservationPaymentService";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const result = await voidPayment({ paymentIntentId: id });
    return NextResponse.json({ ok: result.ok, data: result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: err.status ?? 500 },
    );
  }
}
