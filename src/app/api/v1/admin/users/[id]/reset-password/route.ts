import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;

    await prisma.user.update({
      where: { id },
      data:  { status: "PASSWORD_RESET_REQUIRED" },
    });

    await logAdminAction({
      targetUserId:      id,
      performedByUserId: userId,
      action:            "PASSWORD_RESET_TRIGGERED",
      summary:           "Admin triggered password reset",
    });

    return NextResponse.json({ ok: true, message: "Password reset flagged. User will be prompted on next login." });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
