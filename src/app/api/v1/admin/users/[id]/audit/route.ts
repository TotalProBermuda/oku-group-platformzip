import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");
    const { id } = await params;

    const logs = await prisma.userAuditLog.findMany({
      where:   { targetUserId: id },
      orderBy: { createdAt: "desc" },
      include: {
        performedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ ok: true, data: logs });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
