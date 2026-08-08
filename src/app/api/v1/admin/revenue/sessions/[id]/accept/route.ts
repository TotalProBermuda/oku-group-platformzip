import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { logRevenueAction } from "@/server/revenue/revenueAudit";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const params = await ctx.params;
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:revenue:write");

    const before = await prisma.tableSession.findUnique({ where: { id: params.id } });
    if (!before) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const updateResult = await prisma.tableSession.updateMany({
      where: { id: params.id, status: { in: ["PENDING_REVIEW", "DISPUTED"] } },
      data: { status: "MATCHED", reviewedAt: new Date() },
    });
    if (updateResult.count === 0) {
      const cur = await prisma.tableSession.findUnique({ where: { id: params.id } });
      return NextResponse.json(
        { ok: false, error: `Cannot accept a ${cur?.status ?? "missing"} session` },
        { status: 409 },
      );
    }

    const after = await prisma.tableSession.findUnique({ where: { id: params.id } });
    await logRevenueAction({
      actorId: userId,
      action: "TABLE_SESSION_ACCEPT",
      tableSessionId: before.id,
      before: { status: before.status },
      after: { status: after?.status ?? "MATCHED" },
    });

    return NextResponse.json({ ok: true, data: after });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ ok: false, error: err.message ?? "Error" }, { status: err.status ?? 500 });
  }
}
