/**
 * POST /api/v1/admin/payments/intents/[id]/refund
 *
 * Refunds a captured payment intent (full or partial).
 * SUPERADMIN and ADMIN_FINANCE only.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { refundPayment } from "@/server/payments/reservationPaymentService";

export const dynamic = "force-dynamic";

const RefundBody = z.object({
  amountCents: z.number().int().positive().safe().optional(),
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireAdminRoles(req, ["SUPERADMIN", "ADMIN_FINANCE"]);
    // Only an explicit empty object requests a full refund. Malformed JSON or
    // a misspelled amount must never silently become a full-refund instruction.
    const parsed = RefundBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid refund request" }, { status: 400 });
    }
    const body = parsed.data;
    const result = await refundPayment({
      paymentIntentId: id,
      amountCents: body.amountCents,
    });
    return NextResponse.json({ ok: result.ok, data: result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: err.status ?? 500 },
    );
  }
}
