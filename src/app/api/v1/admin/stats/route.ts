import { NextRequest, NextResponse } from "next/server";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
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
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}
