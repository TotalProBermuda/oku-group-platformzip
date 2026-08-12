import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminRoles(_req, ["SUPERADMIN"]);
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
