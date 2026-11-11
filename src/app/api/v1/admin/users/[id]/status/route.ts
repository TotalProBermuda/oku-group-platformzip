import { NextRequest, NextResponse } from "next/server";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
import { prisma } from "@/lib/prisma";
import { UserAdminAction, UserStatus } from "@prisma/client";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { assertMayManageUser } from "@/server/auth/productionAccount";

const STATUS_TO_ACTION: Record<string, UserAdminAction> = {
  SUSPENDED: "USER_SUSPENDED",
  ACTIVE: "USER_UNSUSPENDED",
  LOCKED: "USER_LOCKED",
  ARCHIVED: "USER_ARCHIVED",
  BANNED: "USER_BANNED",
  PASSWORD_RESET_REQUIRED: "STATUS_CHANGED",
};

const isUserStatus = (value: unknown): value is UserStatus =>
  typeof value === "string" && Object.values(UserStatus).includes(value as UserStatus);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { status, reason } = body;
    if (!isUserStatus(status)) return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });

    const cleanReason = typeof reason === "string" ? reason.trim().slice(0, 1000) : "";
    const { targetIsPrimaryOwner } = await assertMayManageUser(userId, id);
    if (targetIsPrimaryOwner && status !== "ACTIVE") {
      return NextResponse.json({ ok: false, error: "The primary owner account must remain active." }, { status: 403 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const prev = await tx.user.findUniqueOrThrow({
        where: { id },
        include: { roles: { select: { roleKey: true } } },
      });
      const now = new Date();
      const isArchive = status === "ARCHIVED" && prev.status !== "ARCHIVED";
      const isRestore = prev.status === "ARCHIVED" && status === "ACTIVE";
      if (status === "ARCHIVED" && cleanReason.length < 5) {
        throw Object.assign(new Error("Provide a reason of at least five characters to delete this user."), { status: 400 });
      }
      if (isRestore && cleanReason.length < 5) {
        throw Object.assign(new Error("Provide a reason of at least five characters to restore this user."), { status: 400 });
      }
      if (isArchive && id === userId) {
        throw Object.assign(new Error("You cannot delete your own account."), { status: 409 });
      }
      if (prev.status === "ARCHIVED" && !isRestore) {
        throw Object.assign(new Error("A deleted account can only be restored to its previous status."), { status: 409 });
      }
      if (isArchive && prev.status === "ACTIVE" && prev.roles.some((role) => role.roleKey === "SUPERADMIN")) {
        const activeSuperadmins = await tx.user.count({ where: { status: "ACTIVE", roles: { some: { roleKey: "SUPERADMIN" } } } });
        if (activeSuperadmins <= 1) throw Object.assign(new Error("The last active SuperAdmin cannot be deleted."), { status: 409 });
      }

      let targetStatus: UserStatus = status;
      let action = STATUS_TO_ACTION[status] ?? "STATUS_CHANGED";
      let restoreSnapshot: Record<string, unknown> = {};
      const snapshotFields = {
        suspendedAt: prev.suspendedAt?.toISOString() ?? null,
        suspensionReason: prev.suspensionReason,
        lockedAt: prev.lockedAt?.toISOString() ?? null,
        lockReason: prev.lockReason,
      };

      if (isRestore) {
        const archived = await tx.userAuditLog.findFirst({
          where: { targetUserId: id, action: "USER_ARCHIVED" },
          orderBy: { createdAt: "desc" },
          select: { previousValue: true },
        });
        const previous = archived?.previousValue as ({ status?: unknown } & typeof snapshotFields) | null;
        targetStatus = isUserStatus(previous?.status) && previous.status !== "ARCHIVED" ? previous.status : "ACTIVE";
        restoreSnapshot = {
          suspendedAt: previousDate(previous?.suspendedAt ?? null),
          suspensionReason: previous?.suspensionReason ?? null,
          lockedAt: previousDate(previous?.lockedAt ?? null),
          lockReason: previous?.lockReason ?? null,
        };
        action = "USER_UNARCHIVED";
      }

      const updateData: Record<string, unknown> = { status: targetStatus };
      if (isArchive) updateData.forcedLogoutAt = now;
      if (isRestore) Object.assign(updateData, restoreSnapshot);
      if (targetStatus === "SUSPENDED" && !isRestore) {
        updateData.suspendedAt = prev.suspendedAt ?? now;
        updateData.suspensionReason = prev.suspensionReason ?? (cleanReason || null);
      }
      if (targetStatus === "LOCKED" && !isRestore) {
        updateData.lockedAt = prev.lockedAt ?? now;
        updateData.lockReason = prev.lockReason ?? (cleanReason || null);
      }
      if (targetStatus === "ACTIVE" && !isRestore && prev.status === "SUSPENDED") {
        updateData.suspendedAt = null;
        updateData.suspensionReason = null;
      }
      if (targetStatus === "ACTIVE" && !isRestore && prev.status === "LOCKED") {
        updateData.lockedAt = null;
        updateData.lockReason = null;
      }

      const updated = await tx.user.update({ where: { id }, data: updateData, select: { status: true } });
      await tx.userAuditLog.create({
        data: {
          targetUserId: id,
          performedByUserId: userId,
          action,
          summary: isArchive
            ? `User archived for recovery; previous status ${prev.status}`
            : isRestore
              ? `User restored; previous status ${targetStatus}`
              : `Status changed from ${prev.status} to ${targetStatus}`,
          previousValue: { status: prev.status, ...(isArchive ? snapshotFields : {}) },
          newValue: { status: targetStatus },
          reason: cleanReason || null,
        },
      });
      return { status: updated.status, previousStatus: prev.status };
    });

    return NextResponse.json({ ok: true, data: result });
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}

function previousDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
