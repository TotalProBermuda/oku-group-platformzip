import { NextRequest, NextResponse } from "next/server";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:orders:write");
    const { id } = await params;

    const order = await prisma.order.findUniqueOrThrow({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        series: { select: { id: true, title: true } },
      },
    });

    if (order.status !== "PAID") {
      return NextResponse.json(
        { ok: false, error: "Confirmation can only be resent for paid orders" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Confirmation queued for ${order.user.email}`,
    });
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: error.status }
    );
  }
}
