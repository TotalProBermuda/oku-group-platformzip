import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roleKey: string }> }
) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);
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
