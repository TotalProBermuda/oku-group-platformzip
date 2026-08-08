import crypto from "crypto";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import {
  EventReferrerCommissionMode,
  EventReferrerStatus,
  PartnerDelegateRole,
  PartnerDelegateSeatStatus,
  Prisma,
} from "@prisma/client";
import { snapshotPermissions, type PermissionBundle } from "./roles";
import {
  validateCommissionModel,
  type CommissionModelInput,
} from "./commissionModel";
import { assertReferrerParentXor } from "@/server/events/eventReferrerService";
import { logSeatAction, type SeatAuditMeta } from "@/lib/adminAudit";
import { UserAdminAction } from "@prisma/client";

const TOKEN_BYTES = 32;
const INVITE_TTL_DAYS = 14;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("hex");
}

function expiryFromNow(days = INVITE_TTL_DAYS): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

export interface CreateSeatInput {
  partnerId: string;
  createdByUserId: string;
  scope: { seriesId: string } | { sessionId: string; seriesId: string };
  invitedEmail: string;
  invitedName?: string | null;
  roleCode: PartnerDelegateRole;
  /** Optional sales-capability block. When isReferrerEnabled is true the
   * commission model is captured on the seat and a referrer assignment is
   * minted on accept. */
  sales?: CommissionModelInput | null;
}

export interface SeatInviteIssued {
  seatId: string;
  inviteId: string;
  rawToken: string;
  expiresAt: Date;
}

/**
 * Create a delegate seat AND issue the first invite token.
 * The raw token is returned ONCE (caller is responsible for emailing it).
 */
export async function createSeatAndIssueInvite(
  input: CreateSeatInput
): Promise<SeatInviteIssued> {
  const email = input.invitedEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new Error("Invalid email");
  }
  const permissions = snapshotPermissions(input.roleCode);
  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = expiryFromNow();

  const seriesId = input.scope.seriesId;
  const sessionId = "sessionId" in input.scope ? input.scope.sessionId : null;

  // Validate sales block (no-op when not provided / disabled)
  const salesBlock: CommissionModelInput = input.sales ?? {
    isReferrerEnabled: false,
    commissionMode: EventReferrerCommissionMode.NONE,
  };
  const salesError = validateCommissionModel(salesBlock);
  if (salesError) throw new Error(salesError);

  const result = await prisma.$transaction(async (tx) => {
    const seat = await tx.partnerDelegateSeat.create({
      data: {
        partnerId: input.partnerId,
        createdByUserId: input.createdByUserId,
        seriesId,
        sessionId,
        invitedEmail: email,
        invitedName: input.invitedName ?? null,
        roleCode: input.roleCode,
        status: PartnerDelegateSeatStatus.INVITED,
        permissionsJson: permissions as unknown as Prisma.InputJsonValue,
        lastInvitedAt: new Date(),
        inviteCount: 1,
        isReferrerEnabled: salesBlock.isReferrerEnabled,
        commissionMode: salesBlock.commissionMode,
        flatAmountCents: salesBlock.flatAmountCents ?? null,
        perSeatAmountCents: salesBlock.perSeatAmountCents ?? null,
        percentageBps: salesBlock.percentageBps ?? null,
      },
    });
    const invite = await tx.seatInvite.create({
      data: {
        seatId: seat.id,
        tokenHash,
        sentToEmail: email,
        expiresAt,
      },
    });
    return { seatId: seat.id, inviteId: invite.id, seatRow: seat };
  });

  await logSeatAction({
    action: UserAdminAction.SEAT_INVITED,
    performedByUserId: input.createdByUserId,
    targetUserId: input.createdByUserId,
    summary: `Invited ${email} as ${input.roleCode}${
      salesBlock.isReferrerEnabled ? " (sales)" : ""
    }`,
    seat: {
      seatId: result.seatId,
      partnerId: input.partnerId,
      seriesId,
      sessionId,
      invitedEmail: email,
      invitedName: input.invitedName ?? null,
      roleCode: input.roleCode,
      isReferrerEnabled: salesBlock.isReferrerEnabled,
      commissionMode: salesBlock.commissionMode,
    },
  });

  return { seatId: result.seatId, inviteId: result.inviteId, rawToken: raw, expiresAt };
}

export async function listSeatsForSeries(seriesId: string) {
  return prisma.partnerDelegateSeat.findMany({
    where: { seriesId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      acceptedBy: { select: { id: true, name: true, email: true } },
      session: { select: { id: true, title: true, startsAt: true } },
    },
  });
}

export async function listSeatsForSession(sessionId: string) {
  return prisma.partnerDelegateSeat.findMany({
    where: { sessionId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      acceptedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function getSeatById(seatId: string) {
  return prisma.partnerDelegateSeat.findUnique({
    where: { id: seatId },
    include: {
      series: { select: { id: true, title: true, partnerId: true } },
      session: { select: { id: true, seriesId: true, title: true, startsAt: true } },
      acceptedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

/** Mint and persist a fresh invite token for an existing seat. */
export async function resendInvite(
  seatId: string,
  actorUserId: string
): Promise<SeatInviteIssued> {
  const seat = await prisma.partnerDelegateSeat.findUnique({
    where: { id: seatId },
    select: {
      id: true,
      invitedEmail: true,
      invitedName: true,
      status: true,
      partnerId: true,
      seriesId: true,
      sessionId: true,
      roleCode: true,
    },
  });
  if (!seat) throw new Error("Seat not found");
  if (
    seat.status !== PartnerDelegateSeatStatus.INVITED &&
    seat.status !== PartnerDelegateSeatStatus.EXPIRED
  ) {
    throw new Error("Seat cannot be re-invited in its current state");
  }
  const raw = generateRawToken();
  const tokenHash = hashToken(raw);
  const expiresAt = expiryFromNow();

  const invite = await prisma.$transaction(async (tx) => {
    // Mark all prior open invites for this seat as revoked.
    await tx.seatInvite.updateMany({
      where: { seatId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const newInvite = await tx.seatInvite.create({
      data: { seatId, tokenHash, sentToEmail: seat.invitedEmail, expiresAt },
    });
    await tx.partnerDelegateSeat.update({
      where: { id: seatId },
      data: {
        status: PartnerDelegateSeatStatus.INVITED,
        lastInvitedAt: new Date(),
        inviteCount: { increment: 1 },
      },
    });
    return newInvite;
  });

  const seatMeta: SeatAuditMeta = {
    seatId,
    partnerId: seat.partnerId,
    seriesId: seat.seriesId,
    sessionId: seat.sessionId,
    invitedEmail: seat.invitedEmail,
    invitedName: seat.invitedName,
    roleCode: seat.roleCode,
  };
  await logSeatAction({
    action: UserAdminAction.SEAT_REINVITED,
    performedByUserId: actorUserId,
    targetUserId: actorUserId,
    summary: `Re-invited ${seat.invitedEmail} (seat ${seatId})`,
    seat: seatMeta,
  });

  return { seatId, inviteId: invite.id, rawToken: raw, expiresAt };
}

export async function revokeSeat(seatId: string, byUserId: string) {
  const seatBefore = await prisma.partnerDelegateSeat.findUnique({
    where: { id: seatId },
    select: {
      id: true,
      partnerId: true,
      seriesId: true,
      sessionId: true,
      invitedEmail: true,
      invitedName: true,
      roleCode: true,
      acceptedByUserId: true,
      createdByUserId: true,
      referrerAssignmentId: true,
    },
  });
  await prisma.$transaction(async (tx) => {
    await tx.partnerDelegateSeat.update({
      where: { id: seatId },
      data: {
        status: PartnerDelegateSeatStatus.REVOKED,
        revokedAt: new Date(),
        revokedByUserId: byUserId,
      },
    });
    await tx.seatInvite.updateMany({
      where: { seatId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.userEventAccess.updateMany({
      where: { seatId, status: "active" },
      data: { status: "removed", removedAt: new Date() },
    });
    if (seatBefore?.referrerAssignmentId) {
      await tx.eventReferrerAssignment.update({
        where: { id: seatBefore.referrerAssignmentId },
        data: { status: EventReferrerStatus.REVOKED },
      });
    }
  });
  if (seatBefore) {
    await logSeatAction({
      action: UserAdminAction.SEAT_REVOKED,
      performedByUserId: byUserId,
      targetUserId: seatBefore.acceptedByUserId ?? seatBefore.createdByUserId,
      summary: `Revoked seat for ${seatBefore.invitedEmail}`,
      seat: {
        seatId: seatBefore.id,
        partnerId: seatBefore.partnerId,
        seriesId: seatBefore.seriesId,
        sessionId: seatBefore.sessionId,
        invitedEmail: seatBefore.invitedEmail,
        invitedName: seatBefore.invitedName,
        roleCode: seatBefore.roleCode,
      },
    });
  }
}

/**
 * Remove an active access grant for a seat. Marks the seat REMOVED so the
 * accepted user no longer has access; the seat record is retained for audit.
 */
export async function removeSeatAccess(seatId: string, actorUserId: string) {
  const seatBefore = await prisma.partnerDelegateSeat.findUnique({
    where: { id: seatId },
    select: {
      id: true,
      partnerId: true,
      seriesId: true,
      sessionId: true,
      invitedEmail: true,
      invitedName: true,
      roleCode: true,
      acceptedByUserId: true,
      createdByUserId: true,
      referrerAssignmentId: true,
    },
  });
  await prisma.$transaction(async (tx) => {
    await tx.partnerDelegateSeat.update({
      where: { id: seatId },
      data: { status: PartnerDelegateSeatStatus.REMOVED },
    });
    await tx.userEventAccess.updateMany({
      where: { seatId, status: "active" },
      data: { status: "removed", removedAt: new Date() },
    });
    if (seatBefore?.referrerAssignmentId) {
      await tx.eventReferrerAssignment.update({
        where: { id: seatBefore.referrerAssignmentId },
        data: { status: EventReferrerStatus.REVOKED },
      });
    }
  });
  if (seatBefore) {
    await logSeatAction({
      action: UserAdminAction.SEAT_REMOVED,
      performedByUserId: actorUserId,
      targetUserId: seatBefore.acceptedByUserId ?? seatBefore.createdByUserId,
      summary: `Removed seat access for ${seatBefore.invitedEmail}`,
      seat: {
        seatId: seatBefore.id,
        partnerId: seatBefore.partnerId,
        seriesId: seatBefore.seriesId,
        sessionId: seatBefore.sessionId,
        invitedEmail: seatBefore.invitedEmail,
        invitedName: seatBefore.invitedName,
        roleCode: seatBefore.roleCode,
      },
    });
  }
}

export interface InviteLookupResult {
  status: "valid" | "expired" | "revoked" | "accepted" | "not_found";
  seat?: {
    id: string;
    invitedEmail: string;
    invitedName: string | null;
    roleCode: PartnerDelegateRole;
    seriesId: string | null;
    sessionId: string | null;
    seriesTitle: string | null;
    sessionTitle: string | null;
    sessionStartsAt: Date | null;
    partnerName: string | null;
  };
  inviteId?: string;
  expiresAt?: Date;
}

export async function getInviteByToken(rawToken: string): Promise<InviteLookupResult> {
  if (!rawToken || rawToken.length < 16) return { status: "not_found" };
  const tokenHash = hashToken(rawToken);
  const invite = await prisma.seatInvite.findUnique({
    where: { tokenHash },
    include: {
      seat: {
        include: {
          series: { select: { id: true, title: true } },
          session: { select: { id: true, title: true, startsAt: true } },
          partner: { select: { name: true } },
        },
      },
    },
  });
  if (!invite) return { status: "not_found" };
  if (invite.acceptedAt) return { status: "accepted" };
  if (invite.revokedAt) return { status: "revoked" };
  if (invite.expiresAt < new Date()) return { status: "expired" };
  const s = invite.seat;
  return {
    status: "valid",
    inviteId: invite.id,
    expiresAt: invite.expiresAt,
    seat: {
      id: s.id,
      invitedEmail: s.invitedEmail,
      invitedName: s.invitedName,
      roleCode: s.roleCode,
      seriesId: s.seriesId,
      sessionId: s.sessionId,
      seriesTitle: s.series?.title ?? null,
      sessionTitle: s.session?.title ?? null,
      sessionStartsAt: s.session?.startsAt ?? null,
      partnerName: s.partner?.name ?? null,
    },
  };
}

export interface AcceptResult {
  ok: true;
  seriesId: string | null;
  sessionId: string | null;
}

/**
 * Accept an invite. Caller MUST already have a session (signed in).
 * Email match is strictly enforced.
 */
export async function acceptInvite(
  rawToken: string,
  acceptingUser: { id: string; email: string }
): Promise<AcceptResult> {
  const lookup = await getInviteByToken(rawToken);
  if (lookup.status !== "valid" || !lookup.seat || !lookup.inviteId) {
    throw new Error(`Invite ${lookup.status}`);
  }
  if (lookup.seat.invitedEmail.toLowerCase() !== acceptingUser.email.toLowerCase()) {
    throw new Error("Email mismatch");
  }
  const tokenHash = hashToken(rawToken);
  const seatRow = await prisma.partnerDelegateSeat.findUnique({
    where: { id: lookup.seat.id },
    select: {
      permissionsJson: true,
      roleCode: true,
      partnerId: true,
      isReferrerEnabled: true,
      commissionMode: true,
      flatAmountCents: true,
      perSeatAmountCents: true,
      percentageBps: true,
      referrerAssignmentId: true,
      invitedName: true,
    },
  });
  if (!seatRow) throw new Error("Seat vanished");

  const seatScope = await prisma.partnerDelegateSeat.findUnique({
    where: { id: lookup.seat.id },
    select: { seriesId: true, sessionId: true, invitedName: true, roleCode: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.seatInvite.update({
      where: { tokenHash },
      data: { acceptedAt: new Date() },
    });
    await tx.partnerDelegateSeat.update({
      where: { id: lookup.seat!.id },
      data: {
        status: PartnerDelegateSeatStatus.ACTIVE,
        acceptedByUserId: acceptingUser.id,
        acceptedAt: new Date(),
      },
    });
    // Idempotent grant — unique on (userId, seatId)
    await tx.userEventAccess.upsert({
      where: {
        userId_seatId: { userId: acceptingUser.id, seatId: lookup.seat!.id },
      },
      create: {
        userId: acceptingUser.id,
        partnerId: seatRow.partnerId,
        seriesId: lookup.seat!.seriesId,
        sessionId: lookup.seat!.sessionId,
        seatId: lookup.seat!.id,
        roleCode: seatRow.roleCode,
        permissionsJson: seatRow.permissionsJson as Prisma.InputJsonValue,
        status: "active",
      },
      update: { status: "active", removedAt: null },
    });

    // Sales-capability seat: mint a partner-anchored EventReferrerAssignment
    // so the existing /r/[refCode] + QR + sub-commission pipeline kicks in.
    // Series-scoped only — session-scope referrers are out of scope for now.
    if (
      seatRow.isReferrerEnabled &&
      !seatRow.referrerAssignmentId &&
      lookup.seat!.seriesId
    ) {
      const refCode = `PRT-${nanoid(8).toUpperCase()}`;
      const series = await tx.series.findUnique({
        where: { id: lookup.seat!.seriesId },
        select: { slug: true },
      });
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://okuhospitality.com";
      const referralUrl = series?.slug
        ? `${base}/series/${series.slug}?ref=${refCode}`
        : `${base}/series?ref=${refCode}`;
      assertReferrerParentXor({ parentPartnerId: seatRow.partnerId });
      const assignment = await tx.eventReferrerAssignment.create({
        data: {
          parentPartnerId: seatRow.partnerId,
          createdByUserId: acceptingUser.id,
          seriesId: lookup.seat!.seriesId,
          scopeType: "SERIES",
          assignedUserId: acceptingUser.id,
          inviteEmail: acceptingUser.email,
          displayName: seatRow.invitedName ?? acceptingUser.email,
          referralCode: refCode,
          referralUrl,
          isCommissionEligible: true,
          commissionMode: seatRow.commissionMode,
          status: EventReferrerStatus.ACTIVE,
          commissionPayer: "PARTNER",
        },
      });
      await tx.partnerDelegateSeat.update({
        where: { id: lookup.seat!.id },
        data: { referrerAssignmentId: assignment.id },
      });
    }
  });

  await logSeatAction({
    action: UserAdminAction.SEAT_ACCEPTED,
    performedByUserId: acceptingUser.id,
    targetUserId: acceptingUser.id,
    summary: `Accepted seat as ${seatRow.roleCode}${
      seatRow.isReferrerEnabled ? " (sales)" : ""
    }`,
    seat: {
      seatId: lookup.seat.id,
      partnerId: seatRow.partnerId,
      seriesId: seatScope?.seriesId ?? lookup.seat.seriesId,
      sessionId: seatScope?.sessionId ?? lookup.seat.sessionId,
      invitedEmail: acceptingUser.email,
      invitedName: seatRow.invitedName,
      roleCode: seatRow.roleCode,
      isReferrerEnabled: seatRow.isReferrerEnabled,
      commissionMode: seatRow.commissionMode,
    },
  });

  return {
    ok: true,
    seriesId: lookup.seat.seriesId,
    sessionId: lookup.seat.sessionId,
  };
}

/**
 * Update the live commission model on an active sales seat. Only future
 * orders use the new rate — past commissions retain their per-order
 * snapshot. Returns the updated seat row.
 */
export async function updateSeatCommission(
  seatId: string,
  actorUserId: string,
  sales: CommissionModelInput
) {
  const validationError = validateCommissionModel(sales);
  if (validationError) throw new Error(validationError);
  if (!sales.isReferrerEnabled) {
    throw new Error("Cannot disable sales on an existing seat — revoke instead");
  }

  const seatBefore = await prisma.partnerDelegateSeat.findUnique({
    where: { id: seatId },
    select: {
      id: true,
      partnerId: true,
      seriesId: true,
      sessionId: true,
      invitedEmail: true,
      invitedName: true,
      roleCode: true,
      acceptedByUserId: true,
      createdByUserId: true,
      isReferrerEnabled: true,
      commissionMode: true,
      flatAmountCents: true,
      perSeatAmountCents: true,
      percentageBps: true,
      referrerAssignmentId: true,
      status: true,
    },
  });
  if (!seatBefore) throw new Error("Seat not found");
  if (!seatBefore.isReferrerEnabled) {
    throw new Error("Seat is not sales-enabled");
  }
  if (
    seatBefore.status !== PartnerDelegateSeatStatus.ACTIVE &&
    seatBefore.status !== PartnerDelegateSeatStatus.INVITED
  ) {
    throw new Error("Seat is not editable in its current state");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.partnerDelegateSeat.update({
      where: { id: seatId },
      data: {
        commissionMode: sales.commissionMode,
        flatAmountCents: sales.flatAmountCents ?? null,
        perSeatAmountCents: sales.perSeatAmountCents ?? null,
        percentageBps: sales.percentageBps ?? null,
      },
    });
    if (seatBefore.referrerAssignmentId) {
      await tx.eventReferrerAssignment.update({
        where: { id: seatBefore.referrerAssignmentId },
        data: { commissionMode: sales.commissionMode },
      });
    }
    return next;
  });

  await logSeatAction({
    action: UserAdminAction.SEAT_COMMISSION_UPDATED,
    performedByUserId: actorUserId,
    targetUserId: seatBefore.acceptedByUserId ?? seatBefore.createdByUserId,
    summary: `Updated commission for ${seatBefore.invitedEmail} → ${sales.commissionMode}`,
    seat: {
      seatId: seatBefore.id,
      partnerId: seatBefore.partnerId,
      seriesId: seatBefore.seriesId,
      sessionId: seatBefore.sessionId,
      invitedEmail: seatBefore.invitedEmail,
      invitedName: seatBefore.invitedName,
      roleCode: seatBefore.roleCode,
      isReferrerEnabled: true,
      commissionMode: sales.commissionMode,
    },
  });

  return {
    previous: {
      commissionMode: seatBefore.commissionMode,
      flatAmountCents: seatBefore.flatAmountCents,
      perSeatAmountCents: seatBefore.perSeatAmountCents,
      percentageBps: seatBefore.percentageBps,
    },
    next: {
      commissionMode: updated.commissionMode,
      flatAmountCents: updated.flatAmountCents,
      perSeatAmountCents: updated.perSeatAmountCents,
      percentageBps: updated.percentageBps,
    },
  };
}

/**
 * Resolve every active access grant for a user, optionally narrowed to a
 * series. Used by partnerAuth.
 */
export async function getActiveAccessForUser(
  userId: string,
  filter?: { seriesId?: string }
) {
  return prisma.userEventAccess.findMany({
    where: {
      userId,
      status: "active",
      ...(filter?.seriesId
        ? {
            OR: [
              { seriesId: filter.seriesId },
              { session: { seriesId: filter.seriesId } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      seriesId: true,
      sessionId: true,
      roleCode: true,
      permissionsJson: true,
      session: { select: { seriesId: true } },
    },
  });
}

export type { PermissionBundle };
