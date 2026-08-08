import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:payouts:write");

    const entries = await prisma.ledgerEntry.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        influencer: { include: { user: { select: { name: true, email: true } } } },
        order: { select: { id: true } },
      },
    });

    const totalEarned = entries
      .filter((e) => e.type === "COMMISSION_EARNED")
      .reduce((s, e) => s + e.amountCents, 0);
    const totalPaid = entries
      .filter((e) => e.type === "COMMISSION_PAID")
      .reduce((s, e) => s + Math.abs(e.amountCents), 0);
    const totalReversed = entries
      .filter((e) => e.type === "COMMISSION_REVERSED")
      .reduce((s, e) => s + Math.abs(e.amountCents), 0);

    return NextResponse.json({
      ok: true,
      data: {
        entries,
        summary: {
          totalEarnedCents: totalEarned,
          totalPaidCents: totalPaid,
          outstandingCents: totalEarned - totalPaid - totalReversed,
        },
      },
    });
  } catch (e: any) {
    const status = e.status || 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}
