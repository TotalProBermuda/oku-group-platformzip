import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { logAdminAction } from "@/lib/adminAudit";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roleKey: string }> }
) {
  try {
    const { userId, roles } = await requireSession();
    requirePermission(roles, "admin:users:edit");
    const { id, roleKey } = await params;

    await prisma.userRole.deleteMany({
      where: { userId: id, roleKey: roleKey as any },
    });

    await logAdminAction({
      targetUserId:      id,
      performedByUserId: userId,
      action:            "ROLE_REMOVED",
      summary:           `Role ${roleKey} removed`,
      previousValue:     { roleKey },
    });

    const updated = await prisma.user.findUnique({
      where: { id },
      include: { roles: { select: { roleKey: true } } },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
