import { prisma } from "@/lib/prisma";
import { resolveDateRange, type DateRangeInput } from "@/lib/analytics/dateFilters";
import type { ReferralScopeType, ReferralCompensationMode, ReferralActorStatus, ReferralActorType } from "@prisma/client";

export type OperatorRollupContainer = {
  /** Match assignments whose parentEntityId equals this Entity.id (parentEntityType="ENTITY"). */
  parentEntityId?: string;
  /** Match assignments scoped to this scope type (e.g. SERIES). */
  scopeType?: ReferralScopeType;
  /** Optional scopeId narrowing — required for SERIES/CAMPAIGN/VENUE-specific rollups. */
  scopeId?: string;
};

export type OperatorRow = {
  actorId: string;
  displayName: string;
  actorType: ReferralActorType;
  /** ReferralActorTypeDef.code when present; null for legacy actors created before the catalog. */
  actorTypeCode: string | null;
  /** Resolved label: ReferralActorTypeDef.label if available, else a humanized fallback of actorType. */
  actorTypeLabel: string;
  status: ReferralActorStatus;
  organizationName: string | null;
  email: string | null;
  user: { id: string; name: string | null; email: string | null } | null;
  assignment: {
    id: string;
    scopeType: ReferralScopeType;
    scopeId: string | null;
    compensationMode: ReferralCompensationMode;
    rateBps: number | null;
    flatAmountCents: number | null;
    parentEntityId: string | null;
  } | null;
  referralCode: string | null;
  stats: {
    initiated: number;
    patronized: number;
    covers: number;
    pendingCents: number;
    approvedCents: number;
    paidCents: number;
    grossCents: number;
  };
};

export type OperatorRollup = {
  container: OperatorRollupContainer;
  parentEntity: { id: string; displayName: string; type: string } | null;
  range: { from: Date; to: Date; label: string };
  operators: OperatorRow[];
  aggregate: {
    operatorCount: number;
    activeCount: number;
    initiated: number;
    patronized: number;
    covers: number;
    pendingCents: number;
    approvedCents: number;
    paidCents: number;
    grossCents: number;
  };
  /**
   * False when the container is a granular scope (SERIES/CAMPAIGN/VENUE) and
   * legacy `Referrer` stats cannot be honestly attributed to it — pre-v2
   * commissions/attributions are tied only to a Referrer (venue-bound) with no
   * series/campaign foreign key. Stats are zeroed in that case; v2-native
   * actor commissions will populate them as they accrue.
   */
  legacyStatsAvailable: boolean;
};

/**
 * Build a per-operator rollup for a container (a parent entity, a series,
 * an event session, or any other ReferralAssignment scope).
 *
 * The rollup is read-only and quietly tolerates the in-flight migration:
 * actors whose stats live on the legacy `Referrer` model are picked up via
 * `legacyReferrerId`. Actors whose stats already live natively on
 * `ReferralActor` (none today, but coming) get zero overlap by design.
 */
export async function getOperatorRollup(
  container: OperatorRollupContainer,
  range?: DateRangeInput
): Promise<OperatorRollup> {
  const dateRange = resolveDateRange(range);
  const { from, to } = dateRange;

  if (!container.parentEntityId && !container.scopeType) {
    throw new Error("getOperatorRollup requires parentEntityId or scopeType");
  }

  // Include inactive assignments too — pending/user-only operators carry
  // isActive=false rows but must still surface in the admin "Inactive
  // operators" list. Downstream commission/payout pipelines filter on their
  // own status checks, so this does not promote inactive chains to live
  // attribution.
  const assignmentWhere: Record<string, unknown> = {};
  if (container.parentEntityId) {
    assignmentWhere.parentEntityType = "ENTITY";
    assignmentWhere.parentEntityId = container.parentEntityId;
  }
  if (container.scopeType) {
    assignmentWhere.scopeType = container.scopeType;
    if (container.scopeId !== undefined) assignmentWhere.scopeId = container.scopeId;
  }

  const assignments = await prisma.referralAssignment.findMany({
    where: assignmentWhere,
    include: {
      referralActor: {
        include: {
          user: { select: { id: true, name: true, email: true } },
          legacyReferrer: { select: { id: true, referralCode: true } },
          links: { where: { isActive: true }, take: 1 },
        },
      },
    },
  });

  // Dedup by actor — prefer the most specific assignment if multiple match.
  // Specificity order: SERIES > CAMPAIGN > VENUE > GLOBAL. Tie-break on
  // same-specificity rows: prefer isActive=true, then newest by createdAt.
  const specificity: Record<string, number> = { SERIES: 4, CAMPAIGN: 3, VENUE: 2, GLOBAL: 1 };
  const byActor = new Map<string, (typeof assignments)[number]>();
  for (const a of assignments) {
    const prev = byActor.get(a.referralActorId);
    if (!prev) { byActor.set(a.referralActorId, a); continue; }
    const aSpec = specificity[a.scopeType] ?? 0;
    const pSpec = specificity[prev.scopeType] ?? 0;
    if (aSpec > pSpec) { byActor.set(a.referralActorId, a); continue; }
    if (aSpec < pSpec) continue;
    if (a.isActive !== prev.isActive) {
      if (a.isActive) byActor.set(a.referralActorId, a);
      continue;
    }
    if (a.createdAt > prev.createdAt) byActor.set(a.referralActorId, a);
  }

  const legacyIds = Array.from(byActor.values())
    .map(a => a.referralActor.legacyReferrerId)
    .filter((x): x is string => !!x);

  // Resolve the type catalog so reports can label custom operator types
  // (e.g. "Yacht Captain") instead of falling back to the legacy enum
  // bucket they map to (which is usually OTHER for custom types).
  const typeCodes = Array.from(
    new Set(
      Array.from(byActor.values())
        .map(a => a.referralActor.actorTypeCode)
        .filter((x): x is string => !!x)
    )
  );
  const typeDefs = typeCodes.length
    ? await prisma.referralActorTypeDef.findMany({
        where: { code: { in: typeCodes } },
        select: { code: true, label: true },
      })
    : [];
  const typeLabelByCode = new Map(typeDefs.map(t => [t.code, t.label]));
  // Humanize ENUM values when no def is present (e.g. "STREETSIDE_HOST" → "Streetside Host").
  const humanizeEnum = (e: ReferralActorType): string =>
    e.toLowerCase().split("_").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");

  // Legacy commission/attribution rows have no series/campaign FK, so we
  // can only honestly cross-walk for GLOBAL or parent-entity containers.
  const legacyStatsAvailable =
    !container.scopeType ||
    container.scopeType === "GLOBAL" ||
    !!container.parentEntityId;

  // Native v2 commissions are queried for every actor in scope (regardless
  // of legacy stats availability) — they always carry a direct
  // `referralActorId`, so even granular SERIES/CAMPAIGN/VENUE containers
  // can attribute them honestly.
  const actorIds = Array.from(byActor.keys());

  const [legacyCommissions, nativeCommissions, attributions, parentEntity] = await Promise.all([
    legacyStatsAvailable && legacyIds.length
      ? prisma.commissionEntry.findMany({
          where: { referrerId: { in: legacyIds }, createdAt: { gte: from, lte: to } },
          select: { id: true, referrerId: true, referralActorId: true, amountCents: true, status: true },
        })
      : Promise.resolve([] as Array<{ id: string; referrerId: string | null; referralActorId: string | null; amountCents: number; status: string }>),
    actorIds.length
      ? prisma.commissionEntry.findMany({
          where: { referralActorId: { in: actorIds }, createdAt: { gte: from, lte: to } },
          select: { id: true, referrerId: true, referralActorId: true, amountCents: true, status: true },
        })
      : Promise.resolve([] as Array<{ id: string; referrerId: string | null; referralActorId: string | null; amountCents: number; status: string }>),
    legacyStatsAvailable && legacyIds.length
      ? prisma.reservationAttribution.findMany({
          where: { referrerId: { in: legacyIds }, createdAt: { gte: from, lte: to } },
          select: { referrerId: true, conversionStage: true, coversAttributed: true },
        })
      : Promise.resolve([]),
    container.parentEntityId
      ? prisma.entity.findUnique({
          where: { id: container.parentEntityId },
          select: { id: true, displayName: true, type: true },
        })
      : Promise.resolve(null),
  ]);

  // Build a map of actorId → commission slots, deduping by entry id so a
  // commission written with both `referrerId` and `referralActorId` (e.g.
  // during the migration) is counted exactly once.
  const actorByLegacyId = new Map<string, string>();
  for (const a of byActor.values()) {
    if (a.referralActor.legacyReferrerId) actorByLegacyId.set(a.referralActor.legacyReferrerId, a.referralActorId);
  }
  const seenCommissionIds = new Set<string>();
  const commByActor = new Map<string, { pendingCents: number; approvedCents: number; paidCents: number; grossCents: number }>();
  const addCommission = (actorId: string, c: { id: string; amountCents: number; status: string }) => {
    if (seenCommissionIds.has(c.id)) return;
    seenCommissionIds.add(c.id);
    const slot = commByActor.get(actorId) ?? { pendingCents: 0, approvedCents: 0, paidCents: 0, grossCents: 0 };
    if (c.status === "PENDING") slot.pendingCents += c.amountCents;
    if (c.status === "APPROVED") slot.approvedCents += c.amountCents;
    if (c.status === "PAID") slot.paidCents += c.amountCents;
    slot.grossCents += c.amountCents;
    commByActor.set(actorId, slot);
  };
  // Prefer native rows first so they always win the dedup race.
  for (const c of nativeCommissions) {
    if (c.referralActorId) addCommission(c.referralActorId, c);
  }
  for (const c of legacyCommissions) {
    const actorId = c.referralActorId ?? (c.referrerId ? actorByLegacyId.get(c.referrerId) : undefined);
    if (actorId) addCommission(actorId, c);
  }

  const attrByLegacy = new Map<string, { initiated: number; patronized: number; covers: number }>();
  for (const a of attributions) {
    if (!a.referrerId) continue;
    const slot = attrByLegacy.get(a.referrerId) ?? { initiated: 0, patronized: 0, covers: 0 };
    slot.initiated += 1;
    if (a.conversionStage === "PATRONIZED") {
      slot.patronized += 1;
      slot.covers += a.coversAttributed ?? 0;
    }
    attrByLegacy.set(a.referrerId, slot);
  }

  const operators: OperatorRow[] = Array.from(byActor.values()).map(a => {
    const actor = a.referralActor;
    const legacyId = actor.legacyReferrerId ?? null;
    const comm = commByActor.get(actor.id) || { pendingCents: 0, approvedCents: 0, paidCents: 0, grossCents: 0 };
    const attr = (legacyId && attrByLegacy.get(legacyId)) || { initiated: 0, patronized: 0, covers: 0 };
    const link = actor.links[0] ?? null;

    return {
      actorId: actor.id,
      displayName: actor.displayName,
      actorType: actor.actorType,
      actorTypeCode: actor.actorTypeCode ?? null,
      actorTypeLabel: (actor.actorTypeCode && typeLabelByCode.get(actor.actorTypeCode)) || humanizeEnum(actor.actorType),
      status: actor.status,
      organizationName: actor.organizationName,
      email: actor.email,
      user: actor.user,
      assignment: {
        id: a.id,
        scopeType: a.scopeType,
        scopeId: a.scopeId,
        compensationMode: a.compensationMode,
        rateBps: a.rateBps,
        flatAmountCents: a.flatAmountCents,
        parentEntityId: a.parentEntityId,
      },
      referralCode: link?.code ?? actor.legacyReferrer?.referralCode ?? null,
      stats: { ...attr, ...comm },
    };
  });

  operators.sort((a, b) => b.stats.grossCents - a.stats.grossCents || a.displayName.localeCompare(b.displayName));

  const aggregate = operators.reduce(
    (acc, o) => {
      acc.operatorCount += 1;
      if (o.status === "ACTIVE") acc.activeCount += 1;
      acc.initiated += o.stats.initiated;
      acc.patronized += o.stats.patronized;
      acc.covers += o.stats.covers;
      acc.pendingCents += o.stats.pendingCents;
      acc.approvedCents += o.stats.approvedCents;
      acc.paidCents += o.stats.paidCents;
      acc.grossCents += o.stats.grossCents;
      return acc;
    },
    { operatorCount: 0, activeCount: 0, initiated: 0, patronized: 0, covers: 0, pendingCents: 0, approvedCents: 0, paidCents: 0, grossCents: 0 }
  );

  return {
    container,
    parentEntity,
    range: { from: dateRange.from, to: dateRange.to, label: dateRange.label },
    operators,
    aggregate,
    legacyStatsAvailable,
  };
}
