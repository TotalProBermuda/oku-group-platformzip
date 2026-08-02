import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { logAdminAction } from "@/lib/adminAudit";
import { UserStatus, UserAdminAction } from "@prisma/client";

const STATUS_TO_ACTION: Record<string, UserAdminAction> = {
  SUSPENDED:               "USER_SUSPENDED",
  ACTIVE:                  "USER_UNSUSPENDED",
  LOCKED:                  "USER_LOCKED",
  ARCHIVED:                "USER_ARCHIVED",
  BANNED:                  "USER_BANNED",
  PASSWORD_RESET_REQUIRED: "STATUS_CHANGED",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, roles } = await requireSession();
    requirePermission(roles, "admin:users:edit");
    const { id } = await params;
    const { status, reason } = await req.json();

    if (!Object.values(UserStatus).includes(status)) {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }

    const prev = await prisma.user.findUniqueOrThrow({ where: { id } });

    const updateData: Record<string, unknown> = { status };
    if (status === "SUSPENDED") {
      updateData.suspendedAt        = new Date();
      updateData.suspensionReason   = reason ?? null;
    }
    if (status === "ACTIVE" && prev.status === "SUSPENDED") {
      updateData.suspendedAt        = null;
      updateData.suspensionReason   = null;
    }
    if (status === "LOCKED") {
      updateData.lockedAt   = new Date();
      updateData.lockReason = reason ?? null;
    }
    if (status === "ACTIVE" && prev.status === "LOCKED") {
      updateData.lockedAt   = null;
      updateData.lockReason = null;
    }

    const user = await prisma.user.update({ where: { id }, data: updateData });

    const action = STATUS_TO_ACTION[status] ?? "STATUS_CHANGED";
    await logAdminAction({
      targetUserId:      id,
      performedByUserId: userId,
      action,
      summary:           `Status changed from ${prev.status} to ${status}`,
      previousValue:     { status: prev.status },
      newValue:          { status },
      reason,
    });

    return NextResponse.json({ ok: true, data: { status: user.status } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
