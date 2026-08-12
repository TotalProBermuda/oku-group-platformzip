import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:orders:read");
    const { id } = await params;

    const orders = await prisma.order.findMany({
      where: { seriesId: id },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        session: { select: { id: true, startsAt: true } },
        payment: { select: { status: true, amountCents: true } },
        tickets: { select: { id: true, status: true } },
      },
    });

    const totalRevenueCents = orders
      .filter((o) => o.status === "PAID")
      .reduce((s, o) => s + o.totalCents, 0);

    return NextResponse.json({
      ok: true,
      data: { orders, totalRevenueCents, count: orders.length },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
