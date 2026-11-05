import { NextRequest, NextResponse } from "next/server";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";
import { assertMayManageUser } from "@/server/auth/productionAccount";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    await assertMayManageUser(userId, id);

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
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}
