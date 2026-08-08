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
    const note = body.note ?? "";

    const existing = await prisma.commissionAllocation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const updated = await prisma.commissionAllocation.update({
      where: { id },
      data: { status: "DISPUTED" },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "commission_allocation.disputed",
        metadata: {
          allocationId: id,
          tableSessionId: existing.tableSessionId,
          note,
          before: { status: existing.status },
          after: { status: "DISPUTED" },
        },
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
