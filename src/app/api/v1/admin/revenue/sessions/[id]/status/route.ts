import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:revenue:write");

    const body = await req.json().catch(() => ({}));
    const { action, note } = body;

    const existing = await prisma.tableSession.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const statusMap: Record<string, string> = {
      accept: "MATCHED",
      dispute: "DISPUTED",
      dismiss: "MATCHED",
    };

    const newStatus = statusMap[action];
    if (!newStatus) return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });

    const updated = await prisma.tableSession.update({
      where: { id },
      data: { status: newStatus as never, reviewedAt: new Date() },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: `table_session.${action}`,
        metadata: {
          tableSessionId: id,
          note: note ?? null,
          before: { status: existing.status },
          after: { status: newStatus },
        },
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
