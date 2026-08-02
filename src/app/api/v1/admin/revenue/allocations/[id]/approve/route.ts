import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:revenue:write");

    const existing = await prisma.commissionAllocation.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    if (existing.status !== "PENDING") {
      return NextResponse.json(
        { ok: false, error: `Cannot approve allocation in status ${existing.status}. Only PENDING allocations may be approved.` },
        { status: 400 }
      );
    }

    const updated = await prisma.commissionAllocation.update({
      where: { id },
      data: { status: "APPROVED" },
    });

    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: "commission_allocation.approved",
        metadata: {
          allocationId: id,
          tableSessionId: existing.tableSessionId,
          before: { status: existing.status },
          after: { status: "APPROVED" },
        },
      },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
