import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    const [totalOrders, revenue, totalUsers, activeSeries] = await Promise.all([
      prisma.order.count(),
      prisma.order.aggregate({ _sum: { totalCents: true }, where: { status: "PAID" } }),
      prisma.user.count(),
      prisma.series.count({ where: { status: "PUBLISHED" } }),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        totalOrders,
        revenueCents: revenue._sum.totalCents || 0,
        totalUsers,
        activeSeries,
      },
    });
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}
