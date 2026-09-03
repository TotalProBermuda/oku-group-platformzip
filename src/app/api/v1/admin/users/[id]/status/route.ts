import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";
import { UserStatus, UserAdminAction } from "@prisma/client";
import { assertMayManageUser } from "@/server/auth/productionAccount";

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
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    const { status, reason } = await req.json();
    const { targetIsPrimaryOwner } = await assertMayManageUser(userId, id);

    if (!Object.values(UserStatus).includes(status)) {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }
    if (targetIsPrimaryOwner && status !== "ACTIVE") {
      throw Object.assign(new Error("The primary owner account must remain active"), { status: 403 });
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
