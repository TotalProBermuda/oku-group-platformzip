import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/adminAudit";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.okuhospitalitygroup.com";

type Target = { kind: "partner"; channelId: string } | { kind: "seller"; seatId: string };

function code() {
  return `REF-${nanoid(8).toUpperCase()}`;
}

async function loadTarget(target: Target) {
  if (target.kind === "partner") {
    const row = await prisma.partnerCommerceChannel.findUnique({
      where: { id: target.channelId },
      include: { partner: { include: { user: true } } },
    });
    if (!row) throw Object.assign(new Error("Partner channel not found"), { status: 404 });
    return {
      kind: "partner" as const,
      id: row.id,
      partnerId: row.partnerId,
      targetUserId: row.partner.userId,
      displayName: row.partner.name,
      organizationName: row.partner.name,
      userId: row.partner.userId,
      status: row.status,
      actorId: row.referralActorId,
      assignmentId: row.referralAssignmentId,
      linkId: row.referralLinkId,
    };
  }
  const row = await prisma.partnerCommerceSeat.findUnique({
    where: { id: target.seatId },
    include: { partner: { include: { user: true } } },
  });
  if (!row) throw Object.assign(new Error("Seller seat not found"), { status: 404 });
  if (!row.provisionedUserId) {
    throw Object.assign(new Error("Send and accept the seller invitation before activating a seller QR"), { status: 409 });
  }
  return {
    kind: "seller" as const,
    id: row.id,
    partnerId: row.partnerId,
    targetUserId: row.provisionedUserId,
    displayName: row.displayName,
    organizationName: row.partner.name,
    userId: row.provisionedUserId,
    status: row.status,
    actorId: row.referralActorId,
    assignmentId: row.referralAssignmentId,
    linkId: row.referralLinkId,
  };
}

export async function activateAttributionChannel(target: Target, adminUserId: string) {
  const item = await loadTarget(target);
  const result = await prisma.$transaction(async (tx) => {
    let actorId = item.actorId;
    if (!actorId) {
      const existing = await tx.referralActor.findUnique({ where: { userId: item.userId } });
      if (existing) {
        const meta = (existing.metadataJson ?? {}) as Record<string, unknown>;
        const commerce = meta.partnerCommerce as Record<string, unknown> | undefined;
        if (commerce?.partnerId && commerce.partnerId !== item.partnerId) {
          throw Object.assign(new Error("This account is already attributed to a different partner"), { status: 409 });
        }
        actorId = existing.id;
      } else {
        const actor = await tx.referralActor.create({
          data: {
            actorType: item.kind === "partner" ? "PRIVATE_NETWORK" : "PROMOTER",
            displayName: item.displayName,
            organizationName: item.organizationName,
            userId: item.userId,
            commissionEligible: false,
            metadataJson: {
              partnerCommerce: {
                partnerId: item.partnerId,
                channelKind: item.kind === "partner" ? "PARTNER_DIRECT" : "PARTNER_SELLER",
                targetId: item.id,
              },
            },
          },
          select: { id: true },
        });
        actorId = actor.id;
      }
    }

    let assignmentId = item.assignmentId;
    if (!assignmentId) {
      const assignment = await tx.referralAssignment.create({
        data: {
          referralActorId: actorId,
          scopeType: "GLOBAL",
          offerType: "RESTAURANT",
          offerLabel: `${item.organizationName} restaurant reservations`,
          parentEntityType: item.kind === "partner" ? "PARTNER" : "PARTNER_SELLER",
          parentEntityId: item.id,
          isCommissionEligible: false,
          compensationMode: "NONE",
          status: "ACTIVE",
          isActive: true,
          createdByUserId: adminUserId,
          creatorRole: "SUPERADMIN",
        },
        select: { id: true },
      });
      assignmentId = assignment.id;
    } else {
      await tx.referralAssignment.update({ where: { id: assignmentId }, data: { status: "ACTIVE", isActive: true } });
    }

    let link = item.linkId
      ? await tx.referralLink.findUnique({ where: { id: item.linkId } })
      : null;
    if (link && !link.isActive) {
      link = await tx.referralLink.update({ where: { id: link.id }, data: { isActive: true } });
    }
    if (!link) {
      const referralCode = code();
      link = await tx.referralLink.create({
        data: {
          referralActorId: actorId,
          referralAssignmentId: assignmentId,
          code: referralCode,
          url: `${APP_URL}/r/${referralCode}`,
          isActive: true,
        },
      });
    }
    await tx.referralAssignment.update({ where: { id: assignmentId }, data: { canonicalCode: link.code } });

    if (item.kind === "partner") {
      await tx.partnerCommerceChannel.update({
        where: { id: item.id },
        data: { status: "ACTIVE", referralActorId: actorId, referralAssignmentId: assignmentId, referralLinkId: link.id },
      });
    } else {
      await tx.partnerCommerceSeat.update({
        where: { id: item.id },
        data: { status: "ACTIVE", referralActorId: actorId, referralAssignmentId: assignmentId, referralLinkId: link.id },
      });
    }
    return { actorId, assignmentId, linkId: link.id, code: link.code, url: link.url };
  });

  await logAdminAction({
    targetUserId: item.targetUserId,
    performedByUserId: adminUserId,
    action: item.kind === "partner" ? "PARTNER_CHANNEL_ACTIVATED" : "PARTNER_SELLER_CHANNEL_ACTIVATED",
    summary: `${item.displayName} attribution channel activated`,
    newValue: { ...result, partnerId: item.partnerId, kind: item.kind, commissionEligible: false },
    reason: "Superadmin-approved canonical attribution channel",
  });
  return result;
}

export async function pauseAttributionChannel(target: Target, adminUserId: string) {
  const item = await loadTarget(target);
  if (!item.assignmentId || !item.linkId) throw Object.assign(new Error("Channel is not active"), { status: 409 });
  await prisma.$transaction([
    prisma.referralAssignment.update({ where: { id: item.assignmentId }, data: { status: "PAUSED", isActive: false } }),
    prisma.referralLink.update({ where: { id: item.linkId }, data: { isActive: false } }),
    item.kind === "partner"
      ? prisma.partnerCommerceChannel.update({ where: { id: item.id }, data: { status: "PAUSED" } })
      : prisma.partnerCommerceSeat.update({ where: { id: item.id }, data: { status: "PAUSED" } }),
  ]);
  await logAdminAction({ targetUserId: item.targetUserId, performedByUserId: adminUserId, action: "PARTNER_CHANNEL_PAUSED", summary: `${item.displayName} attribution channel paused`, reason: "Superadmin channel lifecycle control" });
  return { paused: true };
}

export async function rotateAttributionChannel(target: Target, adminUserId: string) {
  const item = await loadTarget(target);
  if (!item.actorId || !item.assignmentId || !item.linkId) throw Object.assign(new Error("Activate the channel before rotating its QR"), { status: 409 });
  const result = await prisma.$transaction(async (tx) => {
    await tx.referralLink.update({ where: { id: item.linkId! }, data: { isActive: false } });
    const referralCode = code();
    const link = await tx.referralLink.create({ data: { referralActorId: item.actorId!, referralAssignmentId: item.assignmentId!, code: referralCode, url: `${APP_URL}/r/${referralCode}`, isActive: true } });
    await tx.referralAssignment.update({ where: { id: item.assignmentId! }, data: { canonicalCode: link.code, status: "ACTIVE", isActive: true } });
    if (item.kind === "partner") await tx.partnerCommerceChannel.update({ where: { id: item.id }, data: { status: "ACTIVE", referralLinkId: link.id } });
    else await tx.partnerCommerceSeat.update({ where: { id: item.id }, data: { status: "ACTIVE", referralLinkId: link.id } });
    return { code: link.code, url: link.url, linkId: link.id };
  });
  await logAdminAction({ targetUserId: item.targetUserId, performedByUserId: adminUserId, action: "PARTNER_CHANNEL_ROTATED", summary: `${item.displayName} attribution QR rotated`, newValue: result, reason: "Superadmin QR credential rotation" });
  return result;
}
