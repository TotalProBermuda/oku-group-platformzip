import { prisma } from "@/lib/prisma";
import {
  ReferralActorType,
  ReferralActorStatus,
  ReferrerType,
} from "@prisma/client";

export interface CreateReferralActorInput {
  actorType: ReferralActorType;
  displayName: string;
  organizationName?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  userId?: string;
  metadataJson?: Record<string, unknown>;
}

export interface UpdateReferralActorInput {
  displayName?: string;
  organizationName?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  status?: ReferralActorStatus;
  metadataJson?: Record<string, unknown>;
}

/**
 * Create a net-new ReferralActor (not migrated from legacy).
 */
export async function createReferralActor(input: CreateReferralActorInput) {
  return prisma.referralActor.create({
    data: {
      actorType: input.actorType,
      displayName: input.displayName,
      organizationName: input.organizationName,
      phone: input.phone,
      email: input.email,
      whatsapp: input.whatsapp,
      userId: input.userId,
      metadataJson: input.metadataJson ? (input.metadataJson as object) : undefined,
    },
    include: {
      user: { select: { id: true, email: true, name: true } },
      assignments: { where: { isActive: true } },
      links: { where: { isActive: true } },
    },
  });
}

export async function getReferralActorById(id: string) {
  return prisma.referralActor.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      legacyReferrer: true,
      legacyEventReferrerAssignment: {
        select: {
          id: true,
          displayName: true,
          referralCode: true,
          commissionShareBps: true,
          status: true,
        },
      },
      assignments: {
        where: { isActive: true },
        include: { links: { where: { isActive: true } } },
      },
      links: { where: { isActive: true } },
    },
  });
}

export async function listReferralActors(opts?: {
  actorType?: ReferralActorType;
  status?: ReferralActorStatus;
  page?: number;
  limit?: number;
}) {
  const page = opts?.page ?? 1;
  const limit = Math.min(opts?.limit ?? 50, 200);
  const skip = (page - 1) * limit;

  const where = {
    ...(opts?.actorType ? { actorType: opts.actorType } : {}),
    ...(opts?.status ? { status: opts.status } : {}),
  };

  const [actors, total] = await Promise.all([
    prisma.referralActor.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, email: true, name: true } },
        assignments: { where: { isActive: true }, take: 1 },
        links: { where: { isActive: true }, take: 1 },
      },
    }),
    prisma.referralActor.count({ where }),
  ]);

  return { actors, total, page, limit };
}

export async function updateReferralActor(id: string, input: UpdateReferralActorInput) {
  const data: Record<string, unknown> = {};
  if (input.displayName !== undefined) data.displayName = input.displayName;
  if (input.organizationName !== undefined) data.organizationName = input.organizationName;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.email !== undefined) data.email = input.email;
  if (input.whatsapp !== undefined) data.whatsapp = input.whatsapp;
  if (input.status !== undefined) data.status = input.status;
  if (input.metadataJson !== undefined) data.metadataJson = input.metadataJson as object;

  return prisma.referralActor.update({ where: { id }, data });
}

/**
 * Resolve attribution from a referral code.
 * Checks legacy Referrer codes first (backward compat), then ReferralLink codes.
 * Returns a structured actor context for commission attribution.
 */
export async function resolveActorFromCode(code: string) {
  const link = await prisma.referralLink.findUnique({
    where: { code },
    include: {
      referralActor: {
        include: {
          legacyReferrer: { select: { id: true, compensationPlanId: true, referrerType: true } },
          legacyEventReferrerAssignment: { select: { id: true, parentInfluencerId: true, commissionShareBps: true } },
          assignments: { where: { isActive: true }, take: 1 },
        },
      },
      referralAssignment: true,
    },
  });

  if (link) {
    await prisma.referralLink.update({
      where: { id: link.id },
      data: { clickCount: { increment: 1 }, lastClickedAt: new Date() },
    });
    return {
      source: "REFERRAL_LINK" as const,
      referralActorId: link.referralActorId,
      linkId: link.id,
      actor: link.referralActor,
      assignment: link.referralAssignment,
      legacyReferrerId: link.referralActor.legacyReferrerId ?? null,
      legacyEventReferrerAssignmentId: link.referralActor.legacyEventReferrerAssignmentId ?? null,
    };
  }

  const legacyReferrer = await prisma.referrer.findUnique({
    where: { referralCode: code },
    include: {
      referralActor: true,
      compensationPlan: true,
    },
  });

  if (legacyReferrer) {
    return {
      source: "LEGACY_REFERRER" as const,
      referralActorId: legacyReferrer.referralActor?.id ?? null,
      actor: legacyReferrer.referralActor ?? null,
      assignment: null,
      legacyReferrerId: legacyReferrer.id,
      legacyEventReferrerAssignmentId: null,
    };
  }

  const legacyEventRef = await prisma.eventReferrerAssignment.findUnique({
    where: { referralCode: code },
    include: {
      referralActor: true,
    },
  });

  if (legacyEventRef) {
    return {
      source: "LEGACY_EVENT_REFERRER" as const,
      referralActorId: legacyEventRef.referralActor?.id ?? null,
      actor: legacyEventRef.referralActor ?? null,
      assignment: null,
      legacyReferrerId: null,
      legacyEventReferrerAssignmentId: legacyEventRef.id,
    };
  }

  return null;
}

/**
 * ADAPTOR — Map ReferrerType to ReferralActorType.
 * Used during migration and for all new Referrer creation.
 */
export function mapReferrerTypeToActorType(rt: ReferrerType): ReferralActorType {
  switch (rt) {
    case ReferrerType.STREETSIDE_HOST: return ReferralActorType.STREETSIDE_HOST;
    case ReferrerType.TAXI_DRIVER:     return ReferralActorType.TAXI_DRIVER;
    case ReferrerType.TOUR_GUIDE:      return ReferralActorType.TOUR_GUIDE;
    case ReferrerType.HOTEL_CONCIERGE: return ReferralActorType.HOTEL_CONCIERGE;
    case ReferrerType.PARTNER:         return ReferralActorType.PROMOTER;
    default:                           return ReferralActorType.OTHER;
  }
}
