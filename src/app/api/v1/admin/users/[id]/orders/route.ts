import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;

    const orders = await prisma.order.findMany({
      where: { userId: id },
      orderBy: { createdAt: "desc" },
      include: {
        series: { select: { id: true, title: true, slug: true } },
        session: { select: { id: true, startsAt: true } },
        payment: { select: { id: true, status: true, amountCents: true } },
        tickets: { select: { id: true, status: true } },
      },
    });

    return NextResponse.json({ ok: true, data: orders });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e.message },
      { status: e.status || 500 }
    );
  }
}
