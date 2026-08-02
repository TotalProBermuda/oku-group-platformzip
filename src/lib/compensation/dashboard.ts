import { prisma } from "@/lib/prisma";
import { resolveDateRange, type DateRangeInput } from "@/lib/analytics/dateFilters";
import {
  commissionWhereForEarner,
  resolveEarnerScopeForReferrer,
} from "@/server/commissions/earnerScope";

export async function getCompensationSummary(range?: DateRangeInput) {
  const { from, to } = resolveDateRange(range);

  const [entries, suggestions, referrers, plans] = await Promise.all([
    prisma.commissionEntry.findMany({
      where: { createdAt: { gte: from, lte: to } },
      include: {
        referrer: { select: { fullName: true, referrerType: true, organizationName: true } },
        reservation: { select: { partySize: true, conceptRequested: true, zoneId: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commissionSuggestion.findMany({
      where: { status: "SUGGESTED", createdAt: { gte: from, lte: to } },
      include: {
        referrer: { select: { fullName: true, referrerType: true } },
        reservation: { select: { partySize: true, conceptRequested: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    // NOTE: nested `commissions` include intentionally REMOVED. Prisma relation
    // includes can only filter by the relation's FK (here `referrerId`), which
    // would silently UNDER-COUNT once writers shift to populating
    // `referralActorId` instead. We re-attach commissions below using the
    // canonical earner-scope helper so each referrer row sees commissions
    // attributed via EITHER FK, with no double-counting.
    prisma.referrer.findMany({
      where: { isActive: true },
      include: {
        compensationPlan: true,
        attributions: {
          where: { createdAt: { gte: from, lte: to } },
          select: { conversionStage: true, coversAttributed: true },
        },
      },
      orderBy: { fullName: "asc" },
    }),
    prisma.compensationPlan.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: { _count: { select: { referrers: true } } },
    }),
  ]);

  const totalPending = entries.filter(e => e.status === "PENDING").reduce((s, e) => s + e.amountCents, 0);
  const totalApproved = entries.filter(e => e.status === "APPROVED").reduce((s, e) => s + e.amountCents, 0);
  const totalPaid = entries.filter(e => e.status === "PAID").reduce((s, e) => s + e.amountCents, 0);

  // Attach ReferralActor parent-entity grouping for each legacy Referrer row.
  const legacyIds = referrers.map(r => r.id);
  const actors = legacyIds.length
    ? await prisma.referralActor.findMany({
        where: { legacyReferrerId: { in: legacyIds } },
        select: {
          id: true,
          legacyReferrerId: true,
          assignments: {
            where: { isActive: true, parentEntityId: { not: null } },
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { parentEntityId: true, parentEntityType: true },
          },
        },
      })
    : [];
  const parentEntityIds = Array.from(
    new Set(
      actors
        .map(a => a.assignments[0]?.parentEntityId)
        .filter((x): x is string => !!x)
    )
  );
  const parentEntities = parentEntityIds.length
    ? await prisma.entity.findMany({
        where: { id: { in: parentEntityIds } },
        select: { id: true, displayName: true, type: true },
      })
    : [];
  const entityById = new Map(parentEntities.map(e => [e.id, e] as const));
  const actorByLegacy = new Map(actors.map(a => [a.legacyReferrerId!, a] as const));

  // Re-attach per-referrer commissions using the canonical earner scope.
  // Single query with an OR over BOTH FKs; bucket locally so each row's id
  // appears at most once per bucket (Prisma de-dupes the row identity itself,
  // and we route each row to exactly one referrer key below).
  const actorIds = actors.map(a => a.id);
  const actorIdToLegacy = new Map(actors.map(a => [a.id, a.legacyReferrerId!] as const));
  const perReferrerCommissions = legacyIds.length
    ? await prisma.commissionEntry.findMany({
        where: {
          createdAt: { gte: from, lte: to },
          OR: [
            { referrerId: { in: legacyIds } },
            ...(actorIds.length ? [{ referralActorId: { in: actorIds } }] : []),
          ],
        },
      })
    : [];
  const commissionsByReferrer = new Map<string, typeof perReferrerCommissions>();
  for (const id of legacyIds) commissionsByReferrer.set(id, []);
  for (const c of perReferrerCommissions) {
    // Prefer routing by legacy referrerId if it sits in our visible set; fall
    // back to the actor → legacy mapping when only referralActorId is set.
    const key =
      (c.referrerId && commissionsByReferrer.has(c.referrerId))
        ? c.referrerId
        : (c.referralActorId ? actorIdToLegacy.get(c.referralActorId) : undefined);
    if (key) commissionsByReferrer.get(key)!.push(c);
  }

  type ParentRef = { id: string; displayName: string; type: string } | null;
  const referrersWithGrouping = referrers.map(r => {
    const a = actorByLegacy.get(r.id);
    const peid = a?.assignments[0]?.parentEntityId ?? null;
    const parentEntity: ParentRef = peid ? (entityById.get(peid) ?? null) : null;
    return {
      ...r,
      commissions: commissionsByReferrer.get(r.id) ?? [],
      referralActorId: a?.id ?? null,
      parentEntity,
    };
  });

  return {
    entries,
    suggestions,
    referrers: referrersWithGrouping,
    plans,
    totalPending,
    totalApproved,
    totalPaid,
  };
}

export async function getReferrerDetail(referrerId: string, range?: DateRangeInput) {
  const { from, to } = resolveDateRange(range);

  // Fetch the referrer WITHOUT a nested commissions include — that include
  // can only filter by `referrerId` and would silently miss any commission
  // attributed via `referralActorId`. We resolve the canonical earner scope
  // and query commissions separately so both FKs are honored.
  const referrer = await prisma.referrer.findUnique({
    where: { id: referrerId },
    include: {
      compensationPlan: true,
      commissionSuggestions: {
        where: { createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: "desc" },
      },
      benefits: {
        where: { createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: "desc" },
      },
      attributions: {
        where: { createdAt: { gte: from, lte: to } },
        include: { reservation: { select: { partySize: true, conceptRequested: true, reservationDate: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!referrer) return null;

  const earnerScope = (await resolveEarnerScopeForReferrer(referrer.id))!;
  const commissions = await prisma.commissionEntry.findMany({
    where: {
      ...commissionWhereForEarner(earnerScope),
      createdAt: { gte: from, lte: to },
    },
    include: { reservation: { select: { partySize: true, conceptRequested: true, reservationDate: true } } },
    orderBy: { createdAt: "desc" },
  });

  const attrs = referrer.attributions;
  const initiated = attrs.length;
  const arrived = attrs.filter(a => ["ARRIVED", "OFFERED", "PATRONIZED"].includes(a.conversionStage)).length;
  const patronized = attrs.filter(a => a.conversionStage === "PATRONIZED").length;
  const covers = attrs.filter(a => a.conversionStage === "PATRONIZED").reduce((s, a) => s + (a.coversAttributed ?? 0), 0);
  const conversionRate = initiated > 0 ? Math.round((patronized / initiated) * 100) : 0;

  // Mirror the prior shape: attach commissions onto the referrer object so
  // call-sites that read `referrer.commissions` continue to work unchanged.
  return {
    referrer: { ...referrer, commissions },
    metrics: { initiated, arrived, patronized, covers, conversionRate },
  };
}
