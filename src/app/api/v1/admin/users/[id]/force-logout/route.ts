import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { logAdminAction } from "@/lib/adminAudit";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, roles } = await requireSession();
    requirePermission(roles, "admin:users:edit");
    const { id } = await params;

    await prisma.user.update({
      where: { id },
      data:  { forcedLogoutAt: new Date() },
    });

    await logAdminAction({
      targetUserId:      id,
      performedByUserId: userId,
      action:            "FORCE_LOGOUT",
      summary:           "All sessions invalidated by admin",
    });

    return NextResponse.json({ ok: true, message: "User sessions will be invalidated on next request." });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
