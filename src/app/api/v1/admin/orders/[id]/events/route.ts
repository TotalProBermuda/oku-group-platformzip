import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requireAnyPermission } from "@/lib/rbac";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { roles } = await requireSession();
    requireAnyPermission(roles, "admin:audit:read", "admin:orders:read");
    const { id } = await params;

    const events = await prisma.orderEvent.findMany({
      where: { orderId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ ok: true, data: events });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
