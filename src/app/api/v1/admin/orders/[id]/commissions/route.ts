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

    const ledgerEntries = await prisma.ledgerEntry.findMany({
      where: { orderId: id },
      include: {
        influencer: {
          select: {
            id: true, displayName: true, handle: true, commissionRateBps: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, data: ledgerEntries });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
