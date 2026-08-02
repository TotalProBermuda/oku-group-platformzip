import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PANAMA_TZ,
  panamaDayNumber,
  isHistoryRow,
} from "@/lib/referrals/statusPolicy";

// Re-export the shared active/history policy so existing importers of these
// from the server source keep working. The single definition now lives in
// `src/lib/referrals/statusPolicy.ts` and is shared with client surfaces
// (streetside host) so no surface can fork the split. See Task #140.
export { PANAMA_TZ, panamaDayNumber, isHistoryRow };

/**
 * Shared "my referrals" data source (Task #140, Phase 1).
 *
 * ONE server-side source of truth for every surface that shows a referrer
 * "their" reservations — streetside host, generic referrer, influencer,
 * partner. Keyed off `AttributionSession` (the attribution superset), never
 * the legacy `ReservationAttribution` table, which is missing for actor-only
 * chains (host personal codes, INFLUENCER_SUB_REFERRER, etc.).
 *
 * Design invariants:
 *  - Ownership is resolved to EVERY earner identity the logged-in user owns,
 *    including host personal codes whose ReferralActor may not be user-linked.
 *  - The window is a Panama-local SERVICE window, not a creation-time look-back.
 *    A future-dated reservation stays "active" until the end of its Panama day;
 *    it does not require the row to have been created in the last N hours.
 *  - Active vs history is split deterministically: terminal reservation status,
 *    or a Panama-local service day strictly before today, moves a row to history.
 *  - SSR and polling share the SAME include (`MY_REFERRALS_INCLUDE`) and the
 *    SAME projection (`projectReferralRow`) so the two never drift.
 */

/**
 * How far back (in days) to load history. The precise active/history split is
 * done in memory off the Panama-local service window; this is only the SQL
 * lower bound so a busy referrer's response stays bounded. Future-dated rows
 * have no upper bound — they must always surface as active.
 */
const HISTORY_LOOKBACK_DAYS = 45;

export type OwnedEarnerIdentities = {
  /** ReferralActor ids the user owns (user-linked or via owned host codes). */
  referralActorIds: string[];
  /** Legacy Referrer ids the user owns. */
  legacyReferrerIds: string[];
  /** RestaurantHostProfile ids the user owns (for HOST earner allocations). */
  hostProfileIds: string[];
  /** The user's own id (matches HOST_WALKIN/HOST_CHECKIN sessions they ran). */
  hostUserId: string;
};

/**
 * Resolve a logged-in user to every earner identity they own.
 *
 * Sources, unioned:
 *  1. ReferralActor.userId === user       → actor ids + their legacyReferrerId
 *  2. Referrer.userId === user            → legacy ids + their linked actor id
 *  3. RestaurantHostProfile.userId        → host profile id, AND the actors
 *     behind their owned EventReferrerAssignments (host personal codes — the
 *     actor may NOT be user-linked, so #1 alone can miss them)
 *
 * ReferralLink / QR ownership is intentionally NOT resolved as its own branch.
 * Per the schema a ReferralLink is owned ONLY through its ReferralActor
 * (`ReferralLink.referralActorId`, plus `ReferralAssignment → ReferralActor`
 * for assignment-scoped links) — there is no user→link relation to resolve.
 * Every owned actor is already unioned above, so every owned link/QR is
 * transitively covered. Attribution is keyed on
 * `AttributionSession.referralActorId` (never a link id), so a link-level
 * ownership branch would add nothing. A future referrer-capable role inherits
 * this feed by being given a ReferralActor (+ its ReferralLinks) — NOT by
 * adding a role-specific ownership branch here (Task #140, item 3).
 */
export async function resolveOwnedEarnerIdentities(
  userId: string
): Promise<OwnedEarnerIdentities> {
  const [actorsByUser, referrersByUser, hostProfile] = await Promise.all([
    prisma.referralActor.findMany({
      where: { userId },
      select: { id: true, legacyReferrerId: true },
    }),
    prisma.referrer.findMany({
      where: { userId },
      select: { id: true, referralActor: { select: { id: true } } },
    }),
    prisma.restaurantHostProfile.findUnique({
      where: { userId },
      select: { id: true },
    }),
  ]);

  const referralActorIds = new Set<string>();
  const legacyReferrerIds = new Set<string>();
  const hostProfileIds = new Set<string>();

  for (const a of actorsByUser) {
    referralActorIds.add(a.id);
    if (a.legacyReferrerId) legacyReferrerIds.add(a.legacyReferrerId);
  }
  for (const r of referrersByUser) {
    legacyReferrerIds.add(r.id);
    if (r.referralActor?.id) referralActorIds.add(r.referralActor.id);
  }

  if (hostProfile) {
    hostProfileIds.add(hostProfile.id);
    const ownedCodes = await prisma.eventReferrerAssignment.findMany({
      where: { parentHostProfileId: hostProfile.id },
      select: { referralActor: { select: { id: true } } },
    });
    for (const c of ownedCodes) {
      if (c.referralActor?.id) referralActorIds.add(c.referralActor.id);
    }
  }

  // Admin-approved identity links: when a SUPERADMIN resolved a merge conflict
  // via "Link to existing" and the candidate actor was already owned by another
  // user, a durable `referral.actor.admin_identity_link` AuditLog entry was
  // written with metadata.linkedUserId = userId. Treat those actors as owned by
  // this user for dashboard/feed/attribution purposes. Commission, payout, and
  // attribution state on those actors is NOT changed — this is identity-only.
  const adminLinkedActors = await prisma.auditLog.findMany({
    where: {
      action: "referral.actor.admin_identity_link",
      metadata: {
        path: ["linkedUserId"],
        equals: userId,
      },
    },
    select: { actorId: true },
  });
  for (const link of adminLinkedActors) {
    referralActorIds.add(link.actorId);
  }

  return {
    referralActorIds: [...referralActorIds],
    legacyReferrerIds: [...legacyReferrerIds],
    hostProfileIds: [...hostProfileIds],
    hostUserId: userId,
  };
}

/** True when the user owns no earner identity that could attribute a session. */
export function hasNoOwnedIdentities(ids: OwnedEarnerIdentities): boolean {
  return (
    ids.referralActorIds.length === 0 &&
    ids.legacyReferrerIds.length === 0 &&
    ids.hostProfileIds.length === 0
  );
}

/**
 * Shared include for the AttributionSession → reservation / order → money chain.
 * Reused by SSR and polling so projections can never drift.
 *
 * For TICKET_PURCHASE sessions the `reservation` side is null and `order` is
 * non-null; for all other sessions `order` is null and `reservation` is non-null.
 */
export const MY_REFERRALS_INCLUDE = {
  referralActor: { select: { id: true, displayName: true, actorType: true } },
  legacyReferrer: { select: { id: true, fullName: true, referrerType: true } },
  reservation: {
    include: {
      zone: { select: { name: true, conceptKey: true } },
      assignedSpace: { select: { id: true, name: true } },
      guestProfile: { select: { fullName: true, email: true } },
      handoffs: { orderBy: { createdAt: "desc" as const }, take: 1 },
      tableSessions: {
        select: {
          id: true,
          netRevenueCents: true,
          grossCents: true,
          commissionableCents: true,
          allocations: {
            select: {
              id: true,
              earnerType: true,
              earnerRefId: true,
              amountCents: true,
              status: true,
            },
          },
        },
      },
    },
  },
  // Ticket-purchase sessions carry the paid order instead of a reservation.
  order: {
    select: {
      id: true,
      subtotalCents: true,
      totalCents: true,
      currency: true,
      paidAt: true,
      series: { select: { id: true, title: true, slug: true, venue: true } },
      lineItems: { select: { qty: true, itemType: true } },
      subCommissionLedger: {
        select: {
          id: true,
          referrerShareCents: true,
          payoutStatus: true,
          eventReferrerAssignmentId: true,
          payoutBatchId: true,
        },
      },
      attributedEventReferrerAssignment: {
        select: {
          id: true,
          displayName: true,
          referralCode: true,
          referralUrl: true,
          isCommissionEligible: true,
          commissionMode: true,
          commissionShareBps: true,
        },
      },
    },
  },
} satisfies Prisma.AttributionSessionInclude;

export type MyReferralsSessionRow = Prisma.AttributionSessionGetPayload<{
  include: typeof MY_REFERRALS_INCLUDE;
}>;

/**
 * Phase-1 commission state for a reservation. There is deliberately NO canonical
 * "PAID" value: the canonical paid definition must come from the payout ledger
 * (`LedgerEntry` / `PayoutBatch`), and that bridge is Phase 2. Until it ships we
 * never claim a commission is paid — we only distinguish "not accrued yet" from
 * "accrued, waiting on the payout ledger".
 *  - PENDING_CLOSE:            no allocation yet (table not closed / not minted).
 *  - ACCRUED_AWAITING_LEDGER:  allocation exists, awaiting the Phase-2 ledger.
 */
export type ReferralCommissionState = "PENDING_CLOSE" | "ACCRUED_AWAITING_LEDGER";

export type ReferralMoney = {
  /** Total attributed table revenue (net, falling back to gross) in cents. */
  contributionCents: number | null;
  /**
   * Accrued commission for THIS user for this reservation, in cents, summed over
   * non-reversed allocations they own. This is an ACCRUAL, NOT a paid amount.
   */
  commissionCents: number | null;
  /** Phase-1 commission state — never reports canonical "paid" (see above). */
  commissionState: ReferralCommissionState;
};

/**
 * Whether a row is a genuine REFERRAL or a HOST_OP.
 *  - REFERRAL: a ReferralActor or legacy Referrer owns the attributing QR/link.
 *  - HOST_OP:  the owner's OWN walk-in / check-in that carries NO external
 *    referrer (matched only via the `hostUserId` branch). It is the host's own
 *    operational booking — it may still accrue a HOST commission the host owns,
 *    but it must NEVER be presented as referral proof (Task #140, item 4).
 */
export type ReferralAttributionKind = "REFERRAL" | "HOST_OP";

export type ReferralRow = {
  attributionSessionId: string;
  /**
   * null for TICKET_PURCHASE sessions (no reservation).
   * non-null for all other sources.
   */
  reservationId: string | null;
  bookingCode: string;
  source: string;
  sessionStatus: string;
  guestName: string;
  guestEmail: string | null;
  partySize: number;
  conceptRequested: string | null;
  zoneName: string | null;
  /** Assigned dining space name (from RestaurantSpace). null for ticket sessions. */
  assignedSpaceName: string | null;
  /** null for TICKET_PURCHASE sessions (use ticketPurchaseDate instead). */
  reservationDate: string | null;
  /** null for reservation/walk-in sessions. */
  ticketPurchaseDate: string | null;
  /** null for reservation/walk-in sessions. */
  reservationStatus: string | null;
  /** REFERRAL vs HOST_OP — see {@link ReferralAttributionKind}. */
  attributionKind: ReferralAttributionKind;
  referredByName: string | null;
  /**
   * The proof-chain identity resolvable TODAY from AttributionSession: the
   * referral actor that owns the scanned QR/link (null for HOST_OP / legacy).
   */
  referredByActorId: string | null;
  referredByActorType: string | null;
  /**
   * Proof-chain link / campaign / offer context — WHICH exact QR/link produced
   * the reservation. These are Phase-2 fields and are always null today: the
   * schema does NOT persist a link/campaign/offer on `AttributionSession` (it
   * stores only `referralActorId` / `legacyReferrerId`). `ReferralLink` is
   * owned only through `ReferralActor`, and offer context lives on
   * `ReferralAssignment`, not on the session — so the specific link/offer that
   * was scanned cannot be resolved until Phase-2 anchoring writes it onto the
   * session at booking time. The contract is exposed now (always null, never a
   * guess — so it can never become false proof, per item 4) so the proof-chain
   * surface can light up later without a breaking type change (Task #140, item 5).
   */
  referralLinkId: string | null;
  campaignId: string | null;
  offerId: string | null;
  money: ReferralMoney;
  /** Ticket-purchase specific — only populated when source === "TICKET_PURCHASE". */
  ticket: {
    orderId: string;
    ticketCount: number;
    revenueCents: number;
    eventTitle: string | null;
    eventSlug: string | null;
    /** All-time sub-commission earned (PAID + PENDING; excludes WAIVED/NOT_ELIGIBLE). */
    commissionEarnedCents: number;
    /**
     * All earned commission NOT yet paid out (payoutStatus === "PENDING").
     * Includes rows that are already attached to a draft PayoutBatch but
     * have not yet been exported/paid — the referrer has NOT received the
     * money until payoutStatus flips to PAID.
     */
    commissionPendingCents: number;
    /**
     * true when at least one PENDING row has been claimed into a PayoutBatch
     * (the batch is in DRAFT/PENDING_APPROVAL/APPROVED/EXPORTED). This means
     * a payment run is in progress — but "batched" ≠ "paid". The referrer
     * is paid only when payoutStatus becomes PAID.
     */
    commissionBatched: boolean;
    /** The EventReferrerAssignment id — for grouping in the event-referrer dashboard. */
    eventReferrerAssignmentId: string | null;
    assignmentDisplayName: string | null;
    referralCode: string | null;
    referralUrl: string | null;
    isCommissionEligible: boolean;
  } | null;
};

/**
 * Ownership of a `CommissionAllocation` MUST be checked by the scoped pair
 * (earnerType, earnerRefId) — NEVER by earnerRefId alone. The two id-spaces are
 * disjoint by meaning but not by value, so a flat id Set would let a
 * RestaurantHostProfile id match a REFERRER allocation (and vice-versa).
 *
 * The auto-minter only ever emits two earner scopes (see
 * `commissionMintingService.ts`):
 *  - HOST     → earnerRefId = RestaurantHostProfile.id
 *  - REFERRER → earnerRefId = ReferralActor.id  OR  legacy Referrer.id
 * so those are the only two an owner can match. PARTNER/INFLUENCER/OTHER are not
 * minted today and are not part of an owner's resolved identity set.
 */
export function isOwnedAllocation(
  earnerType: string,
  earnerRefId: string,
  ownedHostProfileIds: ReadonlySet<string>,
  ownedReferrerRefIds: ReadonlySet<string>
): boolean {
  if (earnerType === "HOST") return ownedHostProfileIds.has(earnerRefId);
  if (earnerType === "REFERRER") return ownedReferrerRefIds.has(earnerRefId);
  return false;
}

/** Which allocations on a reservation belong to THIS user (scoped match). */
function ownedAllocationAmount(
  row: MyReferralsSessionRow,
  ids: OwnedEarnerIdentities
): { commissionCents: number | null } {
  const ownedHostProfileIds = new Set<string>(ids.hostProfileIds);
  const ownedReferrerRefIds = new Set<string>([
    ...ids.referralActorIds,
    ...ids.legacyReferrerIds,
  ]);
  let total = 0;
  let found = false;
  for (const ts of row.reservation?.tableSessions ?? []) {
    for (const alloc of ts.allocations) {
      if (alloc.status === "REVERSED") continue;
      if (
        !isOwnedAllocation(
          alloc.earnerType,
          alloc.earnerRefId,
          ownedHostProfileIds,
          ownedReferrerRefIds
        )
      ) {
        continue;
      }
      found = true;
      total += alloc.amountCents;
    }
  }
  return { commissionCents: found ? total : null };
}

/** Normalize one AttributionSession row into the shared referral projection. */
export function projectReferralRow(
  row: MyReferralsSessionRow,
  ids: OwnedEarnerIdentities
): ReferralRow | null {
  const referralActor = row.referralActor;
  const legacyReferrer = row.legacyReferrer;
  const attributionKind: ReferralAttributionKind =
    referralActor || legacyReferrer ? "REFERRAL" : "HOST_OP";
  const referredByName =
    referralActor?.displayName ?? legacyReferrer?.fullName ?? null;

  // ── TICKET_PURCHASE sessions ──────────────────────────────────────────────
  if (row.source === "TICKET_PURCHASE") {
    const o = row.order;
    if (!o) return null;

    // Count only TICKET line items — add-ons, fees, and merch have their own
    // itemType and must not inflate the ticket count shown to the referrer.
    const ticketCount = o.lineItems
      .filter((li) => li.itemType === "ticket")
      .reduce((s, li) => s + li.qty, 0);
    const ledger = o.subCommissionLedger ?? [];
    // Total ever earned: includes PAID + PENDING (all-time lifetime figure).
    const commissionEarnedCents = ledger.reduce((s, l) => s + l.referrerShareCents, 0);
    // All money earned but NOT yet paid — includes rows that are in a draft
    // batch awaiting export (payoutBatchId set) AND rows still unassigned.
    // Distinguishing "in batch" from "unassigned" is the job of commissionBatched.
    // This intentionally excludes WAIVED and NOT_ELIGIBLE rows.
    const commissionPendingCents = ledger
      .filter((l) => l.payoutStatus === "PENDING")
      .reduce((s, l) => s + l.referrerShareCents, 0);
    // True when at least one PENDING row has been included in a PayoutBatch
    // (awaiting admin approval / bank export). The referrer has NOT been paid yet.
    const commissionBatched = ledger.some(
      (l) => l.payoutStatus === "PENDING" && !!l.payoutBatchId
    );
    const assignment = o.attributedEventReferrerAssignment;

    return {
      attributionSessionId: row.id,
      reservationId: null,
      bookingCode: row.bookingCode,
      source: row.source,
      sessionStatus: row.status,
      guestName: "Ticket purchase",
      guestEmail: null,
      partySize: ticketCount,
      conceptRequested: null,
      zoneName: null,
      assignedSpaceName: null,
      reservationDate: null,
      ticketPurchaseDate: (o.paidAt ?? row.openedAt).toISOString(),
      reservationStatus: null,
      attributionKind,
      referredByName,
      referredByActorId: referralActor?.id ?? null,
      referredByActorType: referralActor?.actorType ?? null,
      referralLinkId: null,
      campaignId: null,
      offerId: null,
      money: {
        contributionCents: o.subtotalCents,
        commissionCents: commissionEarnedCents > 0 ? commissionEarnedCents : null,
        commissionState: commissionEarnedCents > 0 ? "ACCRUED_AWAITING_LEDGER" : "PENDING_CLOSE",
      },
      ticket: {
        orderId: o.id,
        ticketCount,
        revenueCents: o.subtotalCents,
        eventTitle: o.series?.title ?? null,
        eventSlug: o.series?.slug ?? null,
        commissionEarnedCents,
        commissionPendingCents,
        commissionBatched,
        eventReferrerAssignmentId: assignment?.id ?? null,
        assignmentDisplayName: assignment?.displayName ?? null,
        referralCode: assignment?.referralCode ?? null,
        referralUrl: assignment?.referralUrl ?? null,
        isCommissionEligible: assignment?.isCommissionEligible ?? false,
      },
    };
  }

  // ── Reservation / walk-in sessions ───────────────────────────────────────
  const r = row.reservation;
  if (!r) return null;

  const sessions = r.tableSessions ?? [];
  const contributionCents =
    sessions.length > 0
      ? sessions.reduce((s, ts) => s + (ts.netRevenueCents || ts.grossCents || 0), 0)
      : null;

  const { commissionCents } = ownedAllocationAmount(row, ids);
  const commissionState: ReferralCommissionState =
    commissionCents != null ? "ACCRUED_AWAITING_LEDGER" : "PENDING_CLOSE";

  return {
    attributionSessionId: row.id,
    reservationId: r.id,
    bookingCode: row.bookingCode,
    source: row.source,
    sessionStatus: row.status,
    guestName: r.contactName ?? r.guestProfile?.fullName ?? "Guest",
    guestEmail: r.contactEmail ?? r.guestProfile?.email ?? null,
    partySize: r.partySize ?? 0,
    conceptRequested: r.conceptRequested ?? null,
    zoneName: r.zone?.name ?? null,
    assignedSpaceName: (r as any).assignedSpace?.name ?? null,
    reservationDate: r.reservationDate.toISOString(),
    ticketPurchaseDate: null,
    reservationStatus: r.status,
    attributionKind,
    referredByName,
    referredByActorId: referralActor?.id ?? null,
    referredByActorType: referralActor?.actorType ?? null,
    // Phase-2 proof-chain context — never guessed; see ReferralRow docs.
    referralLinkId: null,
    campaignId: null,
    offerId: null,
    money: { contributionCents, commissionCents, commissionState },
    ticket: null,
  };
}

export type MyReferralsResult = {
  active: ReferralRow[];
  history: ReferralRow[];
  rollups: {
    activeCount: number;
    historyCount: number;
    /**
     * Sum of THIS user's non-reversed ACCRUED commission across active +
     * history. This is an accrual, NOT a paid figure.
     */
    commissionPendingCents: number;
    /**
     * Whether a canonical paid figure (sourced from `LedgerEntry`/`PayoutBatch`)
     * is available. Always false in Phase 1 — surfaces MUST hide any paid/unpaid
     * rollup until the Phase-2 payout-ledger bridge ships.
     */
    paidLedgerAvailable: boolean;
  };
};

/**
 * Build the AttributionSession where-clause for an owner's referral feed.
 *
 * Two parallel branches:
 *  1. Reservation-based sessions (source ≠ TICKET_PURCHASE): existing logic,
 *     filtered by reservationDate in the Panama service window.
 *  2. Ticket-purchase sessions (source = TICKET_PURCHASE): actor-only ownership
 *     (no HOST_OP branch — host walk-in concept does not apply to tickets),
 *     filtered by order.paidAt.
 *
 * DOUBLE-COUNTING GUARD: ticket sessions only match actor-owned branches.
 * The host walk-in branch (`hostUserId, null, null`) is intentionally excluded
 * from the ticket path — a host "walking in" to a ticketed event is meaningless
 * and would silently pull un-attributed ticket orders into the host's feed.
 */
export function myReferralsWhere(
  ids: OwnedEarnerIdentities,
  lookbackStart: Date
): Prisma.AttributionSessionWhereInput {
  const or: Prisma.AttributionSessionWhereInput[] = [];
  if (ids.referralActorIds.length) {
    or.push({ referralActorId: { in: ids.referralActorIds } });
  }
  if (ids.legacyReferrerIds.length) {
    or.push({ legacyReferrerId: { in: ids.legacyReferrerIds } });
  }
  // The user's own walk-ins / check-ins that carry no external referrer are
  // still "theirs" — but sessions where they merely seated someone else's
  // referral are NOT (those carry the other party's referralActorId/legacyId).
  or.push({
    hostUserId: ids.hostUserId,
    referralActorId: null,
    legacyReferrerId: null,
  });

  // Actor-only ownership for ticket sessions (no HOST_OP branch — see jsdoc).
  const actorOr: Prisma.AttributionSessionWhereInput[] = [];
  if (ids.referralActorIds.length) {
    actorOr.push({ referralActorId: { in: ids.referralActorIds } });
  }

  const clauses: Prisma.AttributionSessionWhereInput[] = [
    // Branch 1: reservation / walk-in sessions (existing behaviour).
    // Includes PENDING_ATTRIBUTION sessions so referrers see their bookings
    // immediately after creation, even when the anchor write failed.
    {
      source: { not: "TICKET_PURCHASE" },
      reservationId: { not: null },
      reservation: { reservationDate: { gte: lookbackStart } },
      OR: or,
    },
  ];

  // Branch 2: ticket-purchase sessions (only added when actor ids are present).
  if (actorOr.length > 0) {
    clauses.push({
      source: "TICKET_PURCHASE",
      orderId: { not: null },
      order: { paidAt: { gte: lookbackStart } },
      OR: actorOr,
    });
  }

  return { OR: clauses };
}

/**
 * Reservation-side mirror of {@link myReferralsWhere}, for surfaces that render
 * Reservation rows (streetside host queue) rather than the projected session
 * rows. Same ownership + Panama-window semantics — the shared bug fix — just
 * expressed from the Reservation table via its `attributionSession` relation.
 *
 * `extraOr` lets a caller add surface-specific ownership branches (e.g. the
 * legacy streetside direct-submission handoff fingerprint) without forking the
 * canonical ownership rules.
 */
export function myReferralsReservationWhere(
  ids: OwnedEarnerIdentities,
  lookbackStart: Date,
  extraOr: Prisma.ReservationWhereInput[] = []
): Prisma.ReservationWhereInput {
  const or: Prisma.ReservationWhereInput[] = [];
  if (ids.referralActorIds.length) {
    or.push({ attributionSession: { referralActorId: { in: ids.referralActorIds } } });
  }
  if (ids.legacyReferrerIds.length) {
    or.push({ attributionSession: { legacyReferrerId: { in: ids.legacyReferrerIds } } });
  }
  or.push({
    attributionSession: {
      hostUserId: ids.hostUserId,
      referralActorId: null,
      legacyReferrerId: null,
    },
  });
  or.push(...extraOr);

  return {
    reservationDate: { gte: lookbackStart },
    OR: or,
  };
}

/** Lookback start used by all "my referrals" queries (Panama service window). */
export function myReferralsLookbackStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The single entry point every surface calls. Resolves ownership, loads the
 * AttributionSession superset once, projects through the shared normalizer,
 * and splits active vs history by the Panama-local service window.
 */
export async function getMyReferrals(
  userId: string,
  now: Date = new Date()
): Promise<MyReferralsResult> {
  const ids = await resolveOwnedEarnerIdentities(userId);

  const empty: MyReferralsResult = {
    active: [],
    history: [],
    rollups: {
      activeCount: 0,
      historyCount: 0,
      commissionPendingCents: 0,
      paidLedgerAvailable: false,
    },
  };
  if (hasNoOwnedIdentities(ids) && ids.hostUserId === userId) {
    // A user with a host profile but no owned codes can still have HOST_WALKIN
    // sessions; keep going. Only bail when there is truly nothing to match.
    const hasHostProfile = ids.hostProfileIds.length > 0;
    if (!hasHostProfile) return empty;
  }

  const lookbackStart = new Date(
    now.getTime() - HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  // Order NEWEST-first so the hard cap can only ever truncate the OLDEST
  // history tail — never upcoming/active or future-dated rows. If we ordered
  // ascending, a busy earner with >cap rows would lose their soonest active
  // referrals off the end of the page (the exact "false empty active" bug).
  const sessions = await prisma.attributionSession.findMany({
    where: myReferralsWhere(ids, lookbackStart),
    include: MY_REFERRALS_INCLUDE,
    orderBy: { reservation: { reservationDate: "desc" } },
    take: 500,
  });

  const active: ReferralRow[] = [];
  const history: ReferralRow[] = [];
  let commissionPendingCents = 0;

  for (const s of sessions) {
    const row = projectReferralRow(s, ids);
    if (!row) continue;

    // Pending commission rollup — deliberately uses a single source per row type
    // to prevent double-counting:
    //
    // Ticket rows: money.commissionCents = total earned (all-time); the pending
    //   portion is ticket.commissionPendingCents (unbatched only). Use only the
    //   latter so a partially-batched order does not inflate the pending total.
    //
    // Reservation rows: money.commissionCents is the accrued Phase-1 estimate.
    //   There is no Phase-2 paid figure yet, so we treat it fully as pending.
    if (row.source === "TICKET_PURCHASE") {
      if (row.ticket?.commissionPendingCents) {
        commissionPendingCents += row.ticket.commissionPendingCents;
      }
    } else {
      if (row.money.commissionCents) {
        commissionPendingCents += row.money.commissionCents;
      }
    }

    // Active/history split: ticket sessions use paidAt as the service date;
    // reservation sessions use reservationDate as before.
    const serviceDate = row.ticketPurchaseDate ?? row.reservationDate;
    const serviceStatus = row.reservationStatus ?? "VERIFIED_POS_SALE";
    const isHistory = serviceDate
      ? isHistoryRow(serviceStatus, new Date(serviceDate), now)
      : true;

    if (isHistory) {
      history.push(row);
    } else {
      active.push(row);
    }
  }

  // Rows were scanned newest-first. History is already recent-first (desired).
  // Active must read soonest-first, so re-sort ascending by service date.
  active.sort((a, b) => {
    const da = new Date(a.ticketPurchaseDate ?? a.reservationDate ?? 0).getTime();
    const db = new Date(b.ticketPurchaseDate ?? b.reservationDate ?? 0).getTime();
    return da - db;
  });

  return {
    active,
    history,
    rollups: {
      activeCount: active.length,
      historyCount: history.length,
      commissionPendingCents,
      paidLedgerAvailable: false,
    },
  };
}
