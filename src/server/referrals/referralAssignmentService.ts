import { prisma } from "@/lib/prisma";
import { ReferralScopeType, ReferralCompensationMode } from "@prisma/client";

export interface CreateAssignmentInput {
  referralActorId: string;
  scopeType: ReferralScopeType;
  scopeId?: string;
  parentEntityType?: string;
  parentEntityId?: string;
  isCommissionEligible?: boolean;
  compensationMode?: ReferralCompensationMode;
  rateBps?: number;
  flatAmountCents?: number;
  legacyCompensationPlanId?: string;
}

/**
 * Create a scoped assignment for a ReferralActor.
 * Each actor can have multiple assignments (per venue, per series, global, etc).
 */
export async function createReferralAssignment(input: CreateAssignmentInput) {
  if (input.compensationMode === ReferralCompensationMode.PERCENT_OF_TRANSACTION && !input.rateBps) {
    throw new Error("rateBps is required for PERCENT_OF_TRANSACTION mode");
  }
  if (
    (input.compensationMode === ReferralCompensationMode.FLAT_PER_COVER ||
      input.compensationMode === ReferralCompensationMode.FLAT_PER_PARTY) &&
    !input.flatAmountCents
  ) {
    throw new Error("flatAmountCents is required for flat compensation modes");
  }

  return prisma.referralAssignment.create({
    data: {
      referralActorId: input.referralActorId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      parentEntityType: input.parentEntityType,
      parentEntityId: input.parentEntityId,
      isCommissionEligible: input.isCommissionEligible ?? false,
      compensationMode: input.compensationMode ?? ReferralCompensationMode.NONE,
      rateBps: input.rateBps,
      flatAmountCents: input.flatAmountCents,
      legacyCompensationPlanId: input.legacyCompensationPlanId,
    },
    include: {
      referralActor: { select: { id: true, displayName: true, actorType: true } },
    },
  });
}

/**
 * Get all active assignments for a given scope.
 * E.g. all actors assigned to a particular venue.
 */
export async function getAssignmentsForScope(scopeType: ReferralScopeType, scopeId?: string) {
  return prisma.referralAssignment.findMany({
    where: {
      scopeType,
      ...(scopeId ? { scopeId } : {}),
      isActive: true,
    },
    include: {
      referralActor: {
        include: {
          user: { select: { id: true, email: true, name: true } },
          links: { where: { isActive: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get the active assignment for a specific actor in a scope.
 * Returns the most specific match first (SERIES > VENUE > GLOBAL).
 */
export async function resolveAssignmentForActor(
  referralActorId: string,
  opts?: { scopeType?: ReferralScopeType; scopeId?: string }
): Promise<{ assignment: Awaited<ReturnType<typeof prisma.referralAssignment.findFirst>> }> {
  const scopePriority: ReferralScopeType[] = opts?.scopeType
    ? [opts.scopeType]
    : [ReferralScopeType.SERIES, ReferralScopeType.VENUE, ReferralScopeType.CAMPAIGN, ReferralScopeType.GLOBAL];

  for (const scope of scopePriority) {
    const assignment = await prisma.referralAssignment.findFirst({
      where: {
        referralActorId,
        scopeType: scope,
        ...(opts?.scopeId ? { scopeId: opts.scopeId } : {}),
        isActive: true,
      },
    });
    if (assignment) return { assignment };
  }

  return { assignment: null };
}

export async function deactivateAssignment(id: string) {
  return prisma.referralAssignment.update({
    where: { id },
    data: { isActive: false },
  });
}

/**
 * Compute the commission amount for a given assignment and transaction value.
 * Returns null if the assignment is not commission eligible.
 */
export function computeAssignmentCommission(
  assignment: {
    isCommissionEligible: boolean;
    compensationMode: ReferralCompensationMode;
    rateBps: number | null;
    flatAmountCents: number | null;
  },
  opts: {
    transactionCents: number;
    parentCommissionCents?: number;
    coverCount?: number;
    partyCount?: number;
  }
): number | null {
  if (!assignment.isCommissionEligible) return null;

  switch (assignment.compensationMode) {
    case ReferralCompensationMode.PERCENT_OF_TRANSACTION:
      if (!assignment.rateBps) return null;
      return Math.floor((opts.transactionCents * assignment.rateBps) / 10000);

    case ReferralCompensationMode.PERCENT_OF_PARENT_COMMISSION:
      if (!assignment.rateBps || !opts.parentCommissionCents) return null;
      return Math.floor((opts.parentCommissionCents * assignment.rateBps) / 10000);

    case ReferralCompensationMode.FLAT_PER_COVER:
      if (!assignment.flatAmountCents || !opts.coverCount) return null;
      return assignment.flatAmountCents * opts.coverCount;

    case ReferralCompensationMode.FLAT_PER_PARTY:
      if (!assignment.flatAmountCents) return null;
      return assignment.flatAmountCents * (opts.partyCount ?? 1);

    case ReferralCompensationMode.NONE:
    default:
      return null;
  }
}
