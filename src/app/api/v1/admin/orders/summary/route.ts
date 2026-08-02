import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const [total, paid, pending, cancelled, refunded] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: "PAID" } }),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.order.count({ where: { status: "CANCELLED" } }),
      prisma.order.count({ where: { status: "REFUNDED" } }),
    ]);

    const paidOrders = await prisma.order.findMany({
      where: { status: "PAID" },
      select: { totalCents: true, commissionCents: true, currency: true },
    });

    const totalRevenueCents = paidOrders.reduce((s, o) => s + o.totalCents, 0);
    const totalCommissionCents = paidOrders.reduce((s, o) => s + (o.commissionCents || 0), 0);

    return NextResponse.json({
      ok: true,
      data: {
        total,
        paid,
        pending,
        cancelled,
        refunded,
        totalRevenueCents,
        totalCommissionCents,
        currency: "USD",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
