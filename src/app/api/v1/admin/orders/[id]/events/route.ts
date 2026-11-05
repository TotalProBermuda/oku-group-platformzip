import { NextRequest, NextResponse } from "next/server";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
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

    const events = await prisma.orderEvent.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ ok: true, data: events });
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}
