/**
 * Admin Payment Intent Detail API (Payments P215)
 *
 * GET /api/v1/admin/payments/intents/[id]
 *   Returns the full PaymentIntent with all attempts (audit trail).
 *
 * Void and refund actions live in their own route files:
 *   POST /api/v1/admin/payments/intents/[id]/void    — void/route.ts
 *   POST /api/v1/admin/payments/intents/[id]/refund  — refund/route.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { getPaymentStatus } from "@/server/payments/reservationPaymentService";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await requireAdminRoles(req, ["SUPERADMIN", "ADMIN_FINANCE"]);
    const status = await getPaymentStatus(id);
    const attempts = await prisma.paymentAttempt.findMany({
      where: { paymentIntentId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ ok: true, data: { ...status, attempts } });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err.message },
      { status: err.status ?? 500 },
    );
  }
}

