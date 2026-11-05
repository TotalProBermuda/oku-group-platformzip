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

    const order = await prisma.order.findUniqueOrThrow({ where: { id } });

    if (order.status !== "CANCELLED") {
      return NextResponse.json(
        { ok: false, error: "Only cancelled orders can be reopened" },
        { status: 400 }
      );
    }

    const updated = await prisma.order.update({
      where: { id },
      data: { status: "PENDING" },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: error.status }
    );
  }
}
