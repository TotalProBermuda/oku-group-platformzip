import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { logRevenueAction } from "@/server/revenue/revenueAudit";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const params = await ctx.params;
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:revenue:write");

    const body = (await req.json().catch(() => ({}))) as { note?: string };
    const note = (body.note ?? "").trim() || null;

    const before = await prisma.tableSession.findUnique({ where: { id: params.id } });
    if (!before) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // Mark as reviewed without changing the underlying status. The review-list
    // query filters out rows whose reviewedAt is set within the dismissed window.
    await prisma.tableSession.update({
      where: { id: params.id },
      data: { reviewedAt: new Date() },
    });

    await logRevenueAction({
      actorId: userId,
      action: "TABLE_SESSION_DISMISS_REVIEW",
      tableSessionId: before.id,
      before: { reviewedAt: before.reviewedAt },
      after: { reviewedAt: new Date().toISOString() },
      note,
    });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { status?: number; message?: string };
    return NextResponse.json({ ok: false, error: err.message ?? "Error" }, { status: err.status ?? 500 });
  }
}
