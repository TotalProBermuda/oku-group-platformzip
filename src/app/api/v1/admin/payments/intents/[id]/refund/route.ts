/**
 * POST /api/v1/admin/payments/intents/[id]/refund
 *
 * Refunds a captured payment intent (full or partial).
 * SUPERADMIN and ADMIN_FINANCE only.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { refundPayment } from "@/server/payments/reservationPaymentService";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireAdminRoles(req, ["SUPERADMIN", "ADMIN_FINANCE"]);
    const body = await req.json().catch(() => ({}));
    const result = await refundPayment({
      paymentIntentId: id,
      amountCents: typeof body.amountCents === "number" ? body.amountCents : undefined,
    });
    return NextResponse.json({ ok: result.ok, data: result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: err.status ?? 500 },
    );
  }
}
