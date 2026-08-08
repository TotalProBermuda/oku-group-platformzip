import { prisma } from "@/lib/prisma";
import type { OfferType, ReferralActor, ReferralAssignment, ReferralLink } from "@prisma/client";
import { OrderStatus } from "@prisma/client";

/**
 * Mobile share surface for a ReferralActor (referrer/partner/concierge).
 *
 * Returns active assignments organised into intent buckets so the
 * referrer can pick "what to share right now" in one tap:
 *
 *   - today        — offers active today (offerStartAt within today's window
 *                    or with no time window but offerType=RESTAURANT)
 *   - thisWeek     — offers active in the next 7 days, excluding today
 *   - restaurants  — every active RESTAURANT offer (always-on dining push)
 *   - events       — every active EVENT|SERIES offer with a future end
 *   - assigned     — every other active assignment regardless of timing
 *   - past         — recently expired assignments (last 30 days), demoted
 */

export interface ShareSurfaceCard {
  assignmentId: string;
  offerType: OfferType | null;
  offerLabel: string | null;
  offerStartAt: string | null;
  offerEndAt: string | null;
  scopeType: string;
  scopeId: string | null;
  isCommissionEligible: boolean;
  compensationMode: string;
  primaryLink: {
    id: string;
    code: string;
    url: string | null;
    clickCount: number;
  } | null;
  /** Aggregate of all active links under this assignment. */
  totalClicks: number;
  /** Past-conversion proof: number of orders attributed to this assignment. */
  conversionCount?: number;
  /** Most recent attributed order timestamp, for the Past activity view. */
  lastConvertedAt?: string | null;
  /** Where the offer takes place (e.g. "OKÜ Panama" / "Catch Rooftop"). */
  venueLabel?: string | null;
  /** Plain-language hint when this offer is the right one to share. */
  bestUseHint?: string | null;
  /** Human-readable commission summary, e.g. "5% of order" or "$10/cover". */
  commissionSummary?: string | null;
  /** UI status pill: ACTIVE / UPCOMING / PAUSED / PAST. */
  cardStatus?: "ACTIVE" | "UPCOMING" | "PAUSED" | "PAST";
}

/**
 * Map an OfferType to a short, plain-language hint a referrer can read at
 * a glance to decide whether THIS offer is the right one to share right
 * now. Kept inside the service to avoid leaking copy decisions into UI.
 */
export function bestUseHintFor(offerType: OfferType | null): string | null {
  if (!offerType) return null;
  switch (offerType) {
    case "RESTAURANT":
      return "Best for walk-by guests asking where to eat.";
    case "EVENT":
      return "Best for guests confirming an event RSVP.";
    case "SERIES":
      return "Best for fans of a recurring programme.";
    case "MEMBERSHIP":
      return "Best for repeat guests considering membership.";
    case "PRIVATE_DINING":
      return "Best for groups asking about private rooms.";
    case "PACKAGE":
      return "Best for hotel concierges and tour guides.";
    default:
      return null;
  }
}

/**
 * Render a one-line commission summary so referrers know what they earn
 * without needing to open a separate plan page. Returns null when the
 * assignment isn't commission-eligible.
 */
export function commissionSummaryFor(assignment: {
  isCommissionEligible: boolean;
  compensationMode: string;
  rateBps: number | null;
  flatAmountCents: number | null;
}): string | null {
  if (!assignment.isCommissionEligible) return null;
  switch (assignment.compensationMode) {
    case "PERCENT_OF_TRANSACTION":
      return assignment.rateBps != null ? `${(assignment.rateBps / 100).toFixed(2)}% of order` : "Commission";
    case "PERCENT_OF_PARENT_COMMISSION":
      return assignment.rateBps != null ? `${(assignment.rateBps / 100).toFixed(2)}% of parent` : "Share of parent";
    case "FLAT_PER_COVER":
      return assignment.flatAmountCents != null ? `$${(assignment.flatAmountCents / 100).toFixed(2)} / cover` : "Flat per cover";
    case "FLAT_PER_PARTY":
      return assignment.flatAmountCents != null ? `$${(assignment.flatAmountCents / 100).toFixed(2)} / party` : "Flat per party";
    default:
      return null;
  }
}

export interface ShareSurface {
  actor: {
    id: string;
    displayName: string;
    actorType: string;
    organizationName: string | null;
  };
  buckets: {
    today: ShareSurfaceCard[];
    thisWeek: ShareSurfaceCard[];
    restaurants: ShareSurfaceCard[];
    events: ShareSurfaceCard[];
    assigned: ShareSurfaceCard[];
    past: ShareSurfaceCard[];
  };
  counts: {
    today: number;
    thisWeek: number;
    restaurants: number;
    events: number;
    assigned: number;
    past: number;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

function toCard(
  assignment: ReferralAssignment & { links: ReferralLink[] },
  venueLabel: string | null = null,
  now: Date = new Date(),
): ShareSurfaceCard {
  const activeLinks = assignment.links.filter((l) => l.isActive);
  const primary = activeLinks[0] ?? null;
  return {
    assignmentId: assignment.id,
    offerType: assignment.offerType ?? null,
    offerLabel: assignment.offerLabel ?? null,
    offerStartAt: assignment.offerStartAt ? assignment.offerStartAt.toISOString() : null,
    offerEndAt: assignment.offerEndAt ? assignment.offerEndAt.toISOString() : null,
    scopeType: assignment.scopeType,
    scopeId: assignment.scopeId ?? null,
    isCommissionEligible: assignment.isCommissionEligible,
    compensationMode: assignment.compensationMode,
    primaryLink: primary
      ? { id: primary.id, code: primary.code, url: primary.url, clickCount: primary.clickCount }
      : null,
    totalClicks: activeLinks.reduce((s, l) => s + l.clickCount, 0),
    // Decisioning fields surfaced on every card so the referrer can pick
    // the right offer at a glance — venue, when-to-share, and earnings.
    venueLabel,
    bestUseHint: bestUseHintFor(assignment.offerType ?? null),
    cardStatus: cardStatusFor(assignment, now),
    commissionSummary: commissionSummaryFor({
      isCommissionEligible: assignment.isCommissionEligible,
      compensationMode: assignment.compensationMode,
      rateBps: assignment.rateBps,
      flatAmountCents: assignment.flatAmountCents,
    }),
  };
}

/**
 * Resolve a venue label for a given assignment by inspecting its scope.
 * VENUE scope → look up the Venue row; SERIES scope → resolve via the
 * Series.partnerId path. Falls back to null when not applicable.
 */
async function resolveVenueLabels(
  assignments: { id: string; scopeType: string; scopeId: string | null }[],
): Promise<Map<string, string | null>> {
  // Maps the venue enum to its public-facing label.
  const VENUE_LABEL: Record<string, string> = {
    OKU: "OKÜ Panama",
    CATCH: "Catch Rooftop",
    TERRACE: "The Terrace",
  };
  const out = new Map<string, string | null>();
  const seriesIds = assignments
    .filter((a) => a.scopeType === "SERIES" && a.scopeId)
    .map((a) => a.scopeId!);
  let seriesVenueById = new Map<string, string | null>();
  if (seriesIds.length > 0) {
    // Pull the actual venue (VenueKey) for each series — that's the venue
    // the offer takes place at, NOT the series title which we already
    // surface separately as the offer label.
    const rows = await prisma.series.findMany({
      where: { id: { in: seriesIds } },
      select: { id: true, venue: true, title: true },
    });
    seriesVenueById = new Map(
      rows.map((r) => [
        r.id,
        r.venue ? VENUE_LABEL[r.venue] ?? String(r.venue) : null,
      ]),
    );
  }
  for (const a of assignments) {
    if (a.scopeType === "SERIES" && a.scopeId) {
      out.set(a.id, seriesVenueById.get(a.scopeId) ?? null);
    } else if (a.scopeType === "VENUE" && a.scopeId) {
      out.set(a.id, VENUE_LABEL[a.scopeId] ?? a.scopeId);
    } else {
      out.set(a.id, null);
    }
  }
  return out;
}

/** Compute the status pill shown on each share card. */
export function cardStatusFor(
  assignment: { isActive: boolean; offerStartAt: Date | null; offerEndAt: Date | null; status: string },
  now: Date,
): "ACTIVE" | "UPCOMING" | "PAUSED" | "PAST" {
  if (assignment.status === "PAUSED") return "PAUSED";
  if (assignment.status === "RETIRED" || !assignment.isActive) return "PAST";
  if (assignment.offerEndAt && assignment.offerEndAt < now) return "PAST";
  if (assignment.offerStartAt && assignment.offerStartAt > now) return "UPCOMING";
  return "ACTIVE";
}

/**
 * Build the bucketed share surface for a single ReferralActor.
 * Looks up active assignments + their active links in one query.
 */
export async function getShareSurfaceForActor(
  referralActorId: string,
): Promise<ShareSurface | null> {
  const actor = await prisma.referralActor.findUnique({
    where: { id: referralActorId },
    select: {
      id: true,
      displayName: true,
      actorType: true,
      organizationName: true,
    },
  });
  if (!actor) return null;

  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  const weekEnd = new Date(todayStart.getTime() + 7 * DAY_MS);
  const pastWindowStart = new Date(todayStart.getTime() - 30 * DAY_MS);

  const assignments = await prisma.referralAssignment.findMany({
    where: {
      referralActorId,
      OR: [
        { isActive: true },
        // Recently-expired/deactivated still surface in "past" for 30 days
        { isActive: false, updatedAt: { gte: pastWindowStart } },
        { offerEndAt: { gte: pastWindowStart, lt: todayStart } },
      ],
    },
    include: { links: { where: { isActive: true } } },
    orderBy: [{ offerStartAt: "asc" }, { createdAt: "desc" }],
  });

  const today: ShareSurfaceCard[] = [];
  const thisWeek: ShareSurfaceCard[] = [];
  const restaurants: ShareSurfaceCard[] = [];
  const events: ShareSurfaceCard[] = [];
  const assigned: ShareSurfaceCard[] = [];
  const past: ShareSurfaceCard[] = [];

  // Hydrate venue labels in one query before card construction.
  const venueLabels = await resolveVenueLabels(
    assignments.map((a) => ({ id: a.id, scopeType: a.scopeType, scopeId: a.scopeId ?? null })),
  );

  for (const a of assignments) {
    const card = toCard(a, venueLabels.get(a.id) ?? null);
    const isExpired =
      (a.offerEndAt && a.offerEndAt < todayStart) || !a.isActive;

    if (isExpired) {
      past.push(card);
      continue;
    }

    // Restaurant offers: always-on dining promotion. Show in restaurants
    // bucket AND in today (if no explicit time window).
    if (a.offerType === "RESTAURANT") {
      restaurants.push(card);
      if (!a.offerStartAt || a.offerStartAt < todayEnd) {
        today.push(card);
      }
    }

    // Time-windowed offers (events, series, packages)
    if (a.offerStartAt) {
      if (a.offerStartAt >= todayStart && a.offerStartAt < todayEnd) {
        if (a.offerType !== "RESTAURANT") today.push(card);
      } else if (a.offerStartAt >= todayEnd && a.offerStartAt < weekEnd) {
        thisWeek.push(card);
      }
    }

    if (a.offerType === "EVENT" || a.offerType === "SERIES") {
      events.push(card);
    }

    // Always include in "My assigned offers" — the referrer's full wallet
    assigned.push(card);
  }

  // Past activity: hydrate with real conversion counts so the "Past" tab
  // shows proof-of-impact (X orders, last converted Y ago), not just an
  // expired-window list. Single grouped query keeps this O(1) regardless
  // of bucket size.
  const allAssignmentIds = assignments.map((a) => a.id);
  if (allAssignmentIds.length > 0) {
    const grouped = await prisma.order.groupBy({
      by: ["attributedReferralAssignmentId"],
      where: {
        attributedReferralAssignmentId: { in: allAssignmentIds },
        // Conversion = money successfully captured. PAID + PARTIALLY_REFUNDED
        // both indicate a real booking; full refunds + cancellations don't.
        status: { in: [OrderStatus.PAID, OrderStatus.PARTIALLY_REFUNDED] },
      },
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const byId = new Map(
      grouped.map((g) => [
        g.attributedReferralAssignmentId,
        { count: g._count._all, last: g._max.createdAt ?? null },
      ]),
    );
    const hydrate = (cards: ShareSurfaceCard[]) => {
      for (const c of cards) {
        const stats = byId.get(c.assignmentId);
        if (stats) {
          c.conversionCount = stats.count;
          c.lastConvertedAt = stats.last ? stats.last.toISOString() : null;
        } else {
          c.conversionCount = 0;
          c.lastConvertedAt = null;
        }
      }
    };
    hydrate(today);
    hydrate(thisWeek);
    hydrate(restaurants);
    hydrate(events);
    hydrate(assigned);
    hydrate(past);
  }

  return {
    actor: {
      id: actor.id,
      displayName: actor.displayName,
      actorType: actor.actorType,
      organizationName: actor.organizationName,
    },
    buckets: { today, thisWeek, restaurants, events, assigned, past },
    counts: {
      today: today.length,
      thisWeek: thisWeek.length,
      restaurants: restaurants.length,
      events: events.length,
      assigned: assigned.length,
      past: past.length,
    },
  };
}

/**
 * Resolve the ReferralActor for the currently-signed-in user.
 * Used by the /api/v1/referrer/share-surface endpoint.
 */
export async function getActorForUser(userId: string): Promise<ReferralActor | null> {
  return prisma.referralActor.findUnique({ where: { userId } });
}

/**
 * Partner-scoped share surface: returns assignments scoped to series the
 * given partnerProfileId owns, regardless of which referral actor each
 * assignment is delegated to. Used by the partner dashboard so partners
 * see "what offers I've handed out" rather than "what offers I myself
 * was assigned" (which is what the referrer surface returns).
 */
export async function getShareSurfaceForPartner(
  partnerProfileId: string,
): Promise<ShareSurface> {
  const series = await prisma.series.findMany({
    where: { partnerId: partnerProfileId },
    select: { id: true },
  });
  const seriesIds = series.map((s) => s.id);
  if (seriesIds.length === 0) {
    return {
      actor: { id: partnerProfileId, displayName: "Partner", actorType: "PARTNER" as never, organizationName: null },
      buckets: { today: [], thisWeek: [], restaurants: [], events: [], assigned: [], past: [] },
      counts: { today: 0, thisWeek: 0, restaurants: 0, events: 0, assigned: 0, past: 0 },
    };
  }

  const todayStart = startOfToday();
  const todayEnd = endOfToday();
  const weekEnd = new Date(todayStart.getTime() + 7 * DAY_MS);
  const pastWindowStart = new Date(todayStart.getTime() - 30 * DAY_MS);

  const assignments = await prisma.referralAssignment.findMany({
    where: {
      scopeType: "SERIES",
      scopeId: { in: seriesIds },
      OR: [
        { isActive: true },
        { isActive: false, updatedAt: { gte: pastWindowStart } },
      ],
    },
    include: { links: { where: { isActive: true } } },
    orderBy: [{ offerStartAt: "asc" }, { createdAt: "desc" }],
  });

  const venueLabels = await resolveVenueLabels(
    assignments.map((a) => ({ id: a.id, scopeType: a.scopeType, scopeId: a.scopeId ?? null })),
  );
  const today: ShareSurfaceCard[] = [];
  const thisWeek: ShareSurfaceCard[] = [];
  const events: ShareSurfaceCard[] = [];
  const assigned: ShareSurfaceCard[] = [];
  const past: ShareSurfaceCard[] = [];

  for (const a of assignments) {
    const card = toCard(a, venueLabels.get(a.id) ?? null);
    const isExpired = (a.offerEndAt && a.offerEndAt < todayStart) || !a.isActive;
    if (isExpired) { past.push(card); continue; }
    if (a.offerStartAt) {
      if (a.offerStartAt >= todayStart && a.offerStartAt < todayEnd) today.push(card);
      else if (a.offerStartAt >= todayEnd && a.offerStartAt < weekEnd) thisWeek.push(card);
    }
    if (a.offerType === "EVENT" || a.offerType === "SERIES") events.push(card);
    assigned.push(card);
  }

  return {
    actor: { id: partnerProfileId, displayName: "Partner offers", actorType: "PARTNER" as never, organizationName: null },
    buckets: { today, thisWeek, restaurants: [], events, assigned, past },
    counts: {
      today: today.length, thisWeek: thisWeek.length, restaurants: 0,
      events: events.length, assigned: assigned.length, past: past.length,
    },
  };
}
