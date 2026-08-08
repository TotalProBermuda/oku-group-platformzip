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
    requirePermission(roles, "admin:audit:read");
    const { id } = await params;

    const user = await prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        roles: { select: { roleKey: true } },
        membership: { select: { id: true, tier: true, status: true } },
        _count: {
          select: {
            orders: true,
            tickets: true,
          },
        },
      },
    });

    const orders = await prisma.order.findMany({
      where: { userId: id, status: "PAID" },
      select: { totalCents: true },
    });
    const totalSpentCents = orders.reduce((s, o) => s + o.totalCents, 0);

    const lastOrder = await prisma.order.findFirst({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true, totalCents: true },
    });

    return NextResponse.json({
      ok: true,
      data: {
        ...user,
        totalSpentCents,
        lastOrder,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
