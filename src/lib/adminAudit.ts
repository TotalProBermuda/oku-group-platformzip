import { prisma } from "@/lib/prisma";
import { Prisma, UserAdminAction } from "@prisma/client";

export async function logAdminAction(params: {
  targetUserId: string;
  performedByUserId: string;
  action: UserAdminAction;
  summary: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
}) {
  try {
    const actorExists = await prisma.user.findUnique({
      where: { id: params.performedByUserId },
      select: { id: true },
    });
    if (!actorExists) {
      console.warn(`[adminAudit] Actor ${params.performedByUserId} not found — skipping audit log for action ${params.action}`);
      return null;
    }

    return await prisma.userAuditLog.create({
      data: {
        targetUserId:      params.targetUserId,
        performedByUserId: params.performedByUserId,
        action:            params.action,
        summary:           params.summary,
        previousValue:     params.previousValue ? JSON.parse(JSON.stringify(params.previousValue)) : undefined,
        newValue:          params.newValue      ? JSON.parse(JSON.stringify(params.newValue))      : undefined,
        reason:            params.reason,
      },
    });
  } catch (err) {
    console.warn("[adminAudit] Failed to write audit log (non-fatal):", err);
    return null;
  }
}

export interface SeatAuditMeta {
  seatId: string;
  partnerId: string;
  seriesId: string | null;
  sessionId?: string | null;
  invitedEmail: string;
  invitedName?: string | null;
  roleCode: string;
  isReferrerEnabled?: boolean;
  commissionMode?: string | null;
}

/** Audit a partner-sales-seat lifecycle event. Non-fatal: never throws. */
export async function logSeatAction(params: {
  action: UserAdminAction;
  performedByUserId: string;
  targetUserId: string;
  summary: string;
  seat: SeatAuditMeta;
  reason?: string;
  client?: Prisma.TransactionClient;
}) {
  const db = params.client ?? prisma;
  try {
    const actorExists = await db.user.findUnique({
      where: { id: params.performedByUserId },
      select: { id: true },
    });
    const targetExists = await db.user.findUnique({
      where: { id: params.targetUserId },
      select: { id: true },
    });
    if (!actorExists || !targetExists) {
      console.warn(
        `[seatAudit] Skipping ${params.action} — actor or target missing (actor=${params.performedByUserId}, target=${params.targetUserId})`
      );
      return null;
    }
    return await db.userAuditLog.create({
      data: {
        targetUserId:      params.targetUserId,
        performedByUserId: params.performedByUserId,
        action:            params.action,
        summary:           params.summary,
        newValue:          JSON.parse(JSON.stringify(params.seat)),
        reason:            params.reason,
      },
    });
  } catch (err) {
    console.warn("[seatAudit] Failed to write seat audit log (non-fatal):", err);
    return null;
  }
}
