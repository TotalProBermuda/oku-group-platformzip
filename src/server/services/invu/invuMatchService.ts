import type {
  InvuOrderNormalized,
  Prisma,
  MatchTier,
  DeterministicMatchStatus,
  MatchProofType,
  CommissionEligibilityStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeTrustScore, TrustScoreInput } from "./invuTrustScoreService";

/**
 * Deterministic 3-tier INVU → Reservation/Walk-in resolver.
 *
 *   TIER1_DETERMINISTIC — booking_code present in INVU payload (externalReference,
 *   bookingCodeRef, or extracted from observations). Confidence = 1.00. AUTO_MATCHED.
 *
 *   TIER2_OPERATIONAL — host-confirmed table-open binding row exists.
 *   Confidence = 0.95. AUTO_MATCHED.
 *
 *   TIER3_HEURISTIC_REVIEW — best-effort table+name+time scoring against legacy
 *   reservations. Confidence ≤ 0.70. ALWAYS REVIEW_PENDING (never auto-approved).
 *
 *   None — UNMATCHED, confidence = 0.
 *
 * Caller must check ManualMatchOverride first; a locked override preempts everything.
 */

export type ThreeTierMatchResult = {
  tier: MatchTier | null;
  status: DeterministicMatchStatus;
  confidence: number;
  reservationId: string | null;
  attributionSessionId: string | null;
  proof: {
    matchProofType: MatchProofType;
    sourceField: string;
    sourceValue: string;
    bookingCode: string | null;
    detailJson: Prisma.InputJsonValue;
  } | null;
  trustScore: number;
  trustScoreInput: TrustScoreInput;
  issueType?: string;
};

export type HeuristicCandidate = {
  reservationId: string;
  reservationDate: Date;
  partySize: number;
  contactName: string;
  assignedTableLabel: string | null;
};

const BOOKING_CODE_RE = /OKU-\d{4}-[A-Z0-9]{8}/;

function unmatchedResult(reason: string): ThreeTierMatchResult {
  const trustInput: TrustScoreInput = {
    matchMethod: "UNMATCHED",
    hasExactMatch: false,
    tableLabelMatches: false,
    customerNameMatchQuality: 0,
    timeWindowFitMinutes: null,
    paymentTotalConsistent: false,
    noDuplicateConflict: true,
    noCreditAmbiguity: true,
  };
  return {
    tier: null,
    status: "UNMATCHED",
    confidence: 0,
    reservationId: null,
    attributionSessionId: null,
    proof: null,
    trustScore: 0,
    trustScoreInput: trustInput,
    issueType: reason,
  };
}

// Canonical booking-code fields. Historically populated by the (now retired)
// invuReferenceWriter; kept here as the read-side priority set so that if a
// host ever types `OKU-2026-XXXXXX` directly into INVU's terminal as a manual
// workaround, the matcher will still pick it up at Tier-1. The writer was
// retired Apr 28 2026 after the INVU vendor (Madelaine) confirmed no API
// path exists to inject external references into open orders. Anything
// matched outside this set means INVU received the reference via an
// unexpected channel — still accepted, but worth auditing
// (INVU_ATTRIBUTION_UNEXPECTED_FIELD).
const CANONICAL_BOOKING_CODE_FIELDS = new Set(["num_cita", "comentario", "descripcion"]);

function extractBookingCode(
  normalized: InvuOrderNormalized,
  rawPayload?: Record<string, unknown> | null
): { value: string; field: string } | null {
  // Priority order per docs/invu-attribution-loop.md §8.2:
  //   num_cita → comentario → descripcion (canonical, written by us)
  //   externalReference → bookingCodeRef (already-normalized helper columns)
  //   observations → customer_note (legacy fallback for in-flight rows
  //   that pre-date the citas/add rewrite)
  const fromRaw = (k: string): string | undefined => {
    if (!rawPayload) return undefined;
    const v = rawPayload[k];
    return typeof v === "string" ? v : undefined;
  };
  const candidates: Array<{ field: string; value: string | null | undefined }> = [
    { field: "num_cita", value: fromRaw("num_cita") },
    { field: "comentario", value: fromRaw("comentario") },
    { field: "descripcion", value: fromRaw("descripcion") },
    { field: "externalReference", value: normalized.externalReference },
    { field: "bookingCodeRef", value: normalized.bookingCodeRef },
    { field: "observations", value: fromRaw("observations") },
    { field: "customer_note", value: fromRaw("customer_note") },
  ];
  for (const c of candidates) {
    if (!c.value) continue;
    const m = c.value.match(BOOKING_CODE_RE);
    if (m) return { value: m[0], field: c.field };
  }
  return null;
}

type DbLike = Prisma.TransactionClient | typeof prisma;

export async function resolveTier1Reference(
  normalized: InvuOrderNormalized,
  db: DbLike = prisma
): Promise<ThreeTierMatchResult | null> {
  // Pull the raw INVU payload so we can scan the three canonical free-text
  // fields (num_cita / comentario / descripcion) plus the legacy fallbacks.
  // Best-effort: if the raw row is missing we still try the normalized
  // helper columns. Failure to load raw must never break the matcher.
  let rawPayload: Record<string, unknown> | null = null;
  try {
    if (normalized.rawRecordId) {
      const raw = await db.invuOrderRaw.findUnique({
        where: { id: normalized.rawRecordId },
        select: { payloadJson: true },
      });
      if (raw?.payloadJson && typeof raw.payloadJson === "object" && !Array.isArray(raw.payloadJson)) {
        rawPayload = raw.payloadJson as Record<string, unknown>;
      }
    }
  } catch {
    rawPayload = null;
  }
  const found = extractBookingCode(normalized, rawPayload);
  if (found && !CANONICAL_BOOKING_CODE_FIELDS.has(found.field)) {
    // Audit: INVU returned the reference, but not in one of the three
    // canonical fields the writer targets. Useful signal for tracking
    // INVU schema drift and for Bucket B vendor follow-ups. Best-effort
    // — never blocks the match.
    db.auditLog
      .create({
        data: {
          actorId: "system",
          action: "INVU_ATTRIBUTION_UNEXPECTED_FIELD",
          metadata: {
            invuOrderNormalizedId: normalized.id,
            rawRecordId: normalized.rawRecordId,
            matchedField: found.field,
            bookingCode: found.value,
            canonicalFields: Array.from(CANONICAL_BOOKING_CODE_FIELDS),
          },
        },
      })
      .catch(() => {});
  }
  if (!found) return null;

  const attribution = await db.attributionSession.findFirst({
    where: { bookingCode: found.value, venueId: normalized.venueId },
    select: { id: true, reservationId: true, venueId: true },
  });
  if (!attribution) {
    return {
      tier: null,
      status: "REVIEW_PENDING",
      confidence: 0,
      reservationId: null,
      attributionSessionId: null,
      proof: {
        matchProofType: "DETERMINISTIC_BOOKING_CODE",
        sourceField: found.field,
        sourceValue: found.value,
        bookingCode: found.value,
        detailJson: { reason: "BOOKING_CODE_NOT_FOUND_IN_OUR_DB" },
      },
      trustScore: 0,
      trustScoreInput: {
        matchMethod: "UNMATCHED",
        hasExactMatch: false,
        tableLabelMatches: false,
        customerNameMatchQuality: 0,
        timeWindowFitMinutes: null,
        paymentTotalConsistent: false,
        noDuplicateConflict: false,
        noCreditAmbiguity: false,
      },
      issueType: "ORPHAN_BOOKING_CODE",
    };
  }

  const trustInput: TrustScoreInput = {
    matchMethod: "AUTO",
    hasExactMatch: true,
    tableLabelMatches: true,
    customerNameMatchQuality: 1,
    timeWindowFitMinutes: 0,
    paymentTotalConsistent: true,
    noDuplicateConflict: true,
    noCreditAmbiguity: true,
  };
  return {
    tier: "TIER1_DETERMINISTIC",
    status: "AUTO_MATCHED",
    confidence: 1.0,
    reservationId: attribution.reservationId,
    attributionSessionId: attribution.id,
    proof: {
      matchProofType: "DETERMINISTIC_BOOKING_CODE",
      sourceField: found.field,
      sourceValue: found.value,
      bookingCode: found.value,
      detailJson: { bookingCode: found.value, attributionSessionId: attribution.id, venueId: attribution.venueId },
    },
    trustScore: computeTrustScore(trustInput),
    trustScoreInput: trustInput,
  };
}

/**
 * Tier-2.5 — Passive correlation.
 *
 * Catches the case where a host seated a party at table T at time T (so the
 * AttributionSession has tableLabel + seatedAt set) but never typed the INVU
 * order number into the bind UI. When the INVU sync brings in an order opened
 * at the same table within ±PASSIVE_TIME_WINDOW_MIN, AND there's exactly one
 * eligible AttributionSession competing for that slot, we treat that as a
 * deterministic-enough match (0.85 confidence) and stamp a synthetic
 * OperationalBinding(PASSIVE_CORRELATION) so the audit trail records that the
 * link was inferred not declared.
 *
 * Two safety rails:
 *   1. Uniqueness — if more than one AttributionSession is in the window we
 *      bail and let Tier-3 (or no match) run. Ambiguous passive matches are
 *      not worth the misattribution risk.
 *   2. Already-bound — if the AttributionSession already has any
 *      OperationalBinding row, we skip it; Tier-2 should have handled it.
 */
const PASSIVE_TIME_WINDOW_MIN = 5;

export async function resolveTier2Passive(
  normalized: InvuOrderNormalized,
  db: DbLike = prisma
): Promise<ThreeTierMatchResult | null> {
  if (!normalized.invuOrderId) return null;
  if (!normalized.tableLabel) return null;
  const openedAt = normalized.openedAt;
  if (!openedAt) return null;
  if (!normalized.venueId) return null;

  const windowMs = PASSIVE_TIME_WINDOW_MIN * 60 * 1000;
  const lo = new Date(openedAt.getTime() - windowMs);
  const hi = new Date(openedAt.getTime() + windowMs);
  const tableNormalized = normalized.tableLabel.trim().toLowerCase();

  // Pre-filter on indexed fields (venueId, status), then refine in JS for
  // the case-insensitive tableLabel comparison Prisma can't express
  // efficiently across all dialects. The window is tight (±5 min), so this
  // returns a handful of rows in the worst case.
  const candidates = await db.attributionSession.findMany({
    where: {
      venueId: normalized.venueId,
      status: { in: ["SEATED", "POS_BIND_INTENT_RECORDED", "CAPTURED"] },
      seatedAt: { gte: lo, lte: hi },
      tableLabel: { not: null },
      // Skip sessions that already have an OperationalBinding — Tier-2 owns
      // those. Skip sessions already linked to a different invuOrderId via
      // their TableSession (someone else's order).
      bindings: { none: {} },
    },
    select: {
      id: true,
      reservationId: true,
      bookingCode: true,
      tableLabel: true,
      seatedAt: true,
      tableSession: { select: { id: true, invuOrderId: true } },
    },
  });

  const eligible = candidates.filter((c) => {
    if (!c.tableLabel) return false;
    if (c.tableLabel.trim().toLowerCase() !== tableNormalized) return false;
    // Don't co-opt a TableSession that's already attached to a different INVU order.
    if (c.tableSession?.invuOrderId && c.tableSession.invuOrderId !== normalized.invuOrderId) {
      return false;
    }
    return true;
  });

  if (eligible.length !== 1) return null;
  const winner = eligible[0];

  // Stamp the synthetic OperationalBinding so the audit trail captures the
  // inferred link. Best-effort — if it races with a Tier-2 manual bind that
  // just landed, the unique constraint on invuOrderId will reject us; in
  // that case we let the loser fall through and Tier-2 wins on the retry.
  let bindingId: string | null = null;
  try {
    const binding = await db.operationalBinding.create({
      data: {
        attributionSessionId: winner.id,
        invuOrderId: normalized.invuOrderId,
        bindingType: "PASSIVE_CORRELATION",
        boundByUserId: null,
        supportingDataJson: {
          inferredAt: new Date().toISOString(),
          tableLabel: winner.tableLabel,
          seatedAt: winner.seatedAt?.toISOString() ?? null,
          invuOpenedAt: openedAt.toISOString(),
          minutesOff: Math.abs(openedAt.getTime() - (winner.seatedAt?.getTime() ?? openedAt.getTime())) / 60000,
          windowMinutes: PASSIVE_TIME_WINDOW_MIN,
        },
      },
      select: { id: true },
    });
    bindingId = binding.id;
  } catch {
    // unique-constraint race or transient — caller can retry; meanwhile we
    // still return a match so the order doesn't sit unmatched on this pass.
  }

  const trustInput: TrustScoreInput = {
    matchMethod: "AUTO",
    hasExactMatch: false,
    tableLabelMatches: true,
    customerNameMatchQuality: 0,
    timeWindowFitMinutes:
      Math.abs(openedAt.getTime() - (winner.seatedAt?.getTime() ?? openedAt.getTime())) / 60000,
    paymentTotalConsistent: false,
    noDuplicateConflict: true,
    noCreditAmbiguity: true,
  };
  return {
    tier: "TIER2_PASSIVE",
    status: "AUTO_MATCHED",
    confidence: 0.85,
    reservationId: winner.reservationId,
    attributionSessionId: winner.id,
    proof: {
      matchProofType: "OPERATIONAL_BINDING",
      sourceField: "passive_correlation",
      sourceValue: bindingId ?? `inferred:${winner.id}`,
      bookingCode: winner.bookingCode,
      detailJson: {
        bindingId,
        bindingType: "PASSIVE_CORRELATION",
        bookingCode: winner.bookingCode,
        tableLabel: winner.tableLabel,
        windowMinutes: PASSIVE_TIME_WINDOW_MIN,
        minutesOff: trustInput.timeWindowFitMinutes,
      },
    },
    trustScore: computeTrustScore(trustInput),
    trustScoreInput: trustInput,
  };
}

export async function resolveTier2OperationalBinding(
  normalized: InvuOrderNormalized,
  db: DbLike = prisma
): Promise<ThreeTierMatchResult | null> {
  if (!normalized.invuOrderId) return null;
  const binding = await db.operationalBinding.findFirst({
    where: { invuOrderId: normalized.invuOrderId },
    orderBy: { createdAt: "asc" },
    include: {
      attributionSession: {
        select: { id: true, reservationId: true, venueId: true, bookingCode: true },
      },
    },
  });
  if (!binding) return null;

  const trustInput: TrustScoreInput = {
    matchMethod: "AUTO",
    hasExactMatch: true,
    tableLabelMatches: true,
    customerNameMatchQuality: 1,
    timeWindowFitMinutes: 0,
    paymentTotalConsistent: true,
    noDuplicateConflict: true,
    noCreditAmbiguity: true,
  };
  return {
    tier: "TIER2_OPERATIONAL",
    status: "AUTO_MATCHED",
    confidence: 0.95,
    reservationId: binding.attributionSession.reservationId,
    attributionSessionId: binding.attributionSession.id,
    proof: {
      matchProofType: "OPERATIONAL_BINDING",
      sourceField: "operational_binding",
      sourceValue: binding.id,
      bookingCode: binding.attributionSession.bookingCode,
      detailJson: {
        bindingId: binding.id,
        bindingType: binding.bindingType,
        bookingCode: binding.attributionSession.bookingCode,
      },
    },
    trustScore: computeTrustScore(trustInput),
    trustScoreInput: trustInput,
  };
}

function levenshtein(a: string, b: string): number {
  if (!a) return b.length;
  if (!b) return a.length;
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function nameScore(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return 0;
  const na = a.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  const nb = b.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (!na || !nb) return 0;
  const d = levenshtein(na, nb);
  if (d === 0) return 1;
  if (d <= 2) return 0.9;
  if (d <= 5) return 0.6;
  if (d <= 8) return 0.3;
  return 0;
}

/**
 * Minimum heuristic confidence to even surface a Tier-3 candidate to admin.
 * Below this floor, the table+name+time signal is too noisy to act on (it was
 * the source of multiple cross-guest mis-suggestions during early ops). The
 * matcher returns null instead of a REVIEW_PENDING row, so the order falls
 * through to UNMATCHED — which is the correct surfacing for "we genuinely
 * don't know who this sale belonged to". A human can still resolve it via
 * the explicit manual-bind flow if they have ground truth.
 *
 * Tune by changing this single value; do NOT scatter literal thresholds
 * through the resolver.
 */
const TIER3_MIN_CONFIDENCE = 0.6;

export function resolveTier3Heuristic(
  normalized: InvuOrderNormalized,
  candidates: HeuristicCandidate[]
): ThreeTierMatchResult | null {
  const sessionTime = normalized.openedAt ?? normalized.closedAt;
  if (!sessionTime || candidates.length === 0) return null;

  const scored = candidates
    .map((c) => {
      const minutesOff = Math.abs(c.reservationDate.getTime() - sessionTime.getTime()) / 60000;
      const tableMatch =
        !!normalized.tableLabel &&
        !!c.assignedTableLabel &&
        normalized.tableLabel.toLowerCase().trim() === c.assignedTableLabel.toLowerCase().trim();
      const ns = nameScore(normalized.customerName, c.contactName);
      const partyClose =
        normalized.guestCount !== null && normalized.guestCount !== undefined
          ? Math.abs((normalized.guestCount ?? 0) - c.partySize) <= 1
          : false;
      let conf = 0;
      if (tableMatch) conf += 0.3;
      if (ns >= 0.9) conf += 0.25;
      else if (ns >= 0.6) conf += 0.15;
      if (partyClose) conf += 0.1;
      if (minutesOff <= 30) conf += 0.05;
      conf = Math.min(conf, 0.7);
      return { c, minutesOff, tableMatch, ns, partyClose, conf };
    })
    .filter((s) => s.minutesOff <= 120 && s.conf > 0)
    .sort((a, b) => b.conf - a.conf || a.minutesOff - b.minutesOff);

  if (!scored.length) return null;
  const best = scored[0];

  // Confidence floor — drop noise below TIER3_MIN_CONFIDENCE so we don't
  // pollute the review queue with low-signal candidates that ops can't
  // verify any better than the matcher can. The runner-up is logged in
  // detailJson on at-or-above results; below the floor we just return null
  // and the caller surfaces the order as UNMATCHED.
  if (best.conf < TIER3_MIN_CONFIDENCE) return null;

  const ambiguous = scored.length > 1 && scored[1].conf >= best.conf - 0.05;

  const trustInput: TrustScoreInput = {
    matchMethod: "AUTO",
    hasExactMatch: false,
    tableLabelMatches: best.tableMatch,
    customerNameMatchQuality: best.ns,
    timeWindowFitMinutes: best.minutesOff,
    paymentTotalConsistent: false,
    noDuplicateConflict: !ambiguous,
    noCreditAmbiguity: true,
  };
  return {
    tier: "TIER3_HEURISTIC_REVIEW",
    status: "REVIEW_PENDING",
    confidence: best.conf,
    reservationId: best.c.reservationId,
    attributionSessionId: null,
    proof: {
      matchProofType: "HEURISTIC",
      sourceField: "heuristic",
      sourceValue: `score=${best.conf.toFixed(2)}`,
      bookingCode: null,
      detailJson: {
        scoring: {
          tableMatch: best.tableMatch,
          nameScore: best.ns,
          partyClose: best.partyClose,
          minutesOff: best.minutesOff,
        },
        ambiguous,
        candidatesConsidered: scored.length,
        runnerUpConfidence: scored[1]?.conf ?? null,
      },
    },
    trustScore: computeTrustScore(trustInput),
    trustScoreInput: trustInput,
    issueType: ambiguous ? "MULTIPLE_MATCHES" : "LOW_CONFIDENCE_MATCH",
  };
}

export async function resolveMatch(
  normalized: InvuOrderNormalized,
  heuristicCandidates: HeuristicCandidate[],
  db: DbLike = prisma
): Promise<ThreeTierMatchResult> {
  const t1 = await resolveTier1Reference(normalized, db);
  if (t1 && t1.tier === "TIER1_DETERMINISTIC") return t1;

  const t2 = await resolveTier2OperationalBinding(normalized, db);
  if (t2) return t2;

  // Tier-2.5 sits between explicit operational binding (Tier-2) and the
  // heuristic name-scoring pass (Tier-3). It's deterministic-ish — same
  // venue, same table label, ±5 min open-time, exactly one eligible
  // candidate — so it goes to AUTO_MATCHED at 0.85 confidence. If it can't
  // produce a unique winner it returns null and we keep falling through.
  const t25 = await resolveTier2Passive(normalized, db);
  if (t25) return t25;

  if (t1) return t1; // orphan booking_code — surface as REVIEW_PENDING

  const t3 = resolveTier3Heuristic(normalized, heuristicCandidates);
  if (t3) return t3;

  return unmatchedResult("NO_MATCH");
}

export async function persistMatchResult(args: {
  invuOrderNormalizedId: string;
  invuOrderId: string | null;
  result: ThreeTierMatchResult;
  performedByUserId?: string | null;
  /**
   * Explicit TableSession to update. Used by callers (e.g. the sync
   * aggregation pipeline) that have already created/updated a TableSession
   * for the normalized order before the match is resolved. When omitted,
   * the function falls back to looking up the TableSession via the
   * AttributionSession link (the booking-anchored path).
   */
  tableSessionId?: string | null;
  db?: DbLike;
}): Promise<{ matchProofId: string | null; tableSessionId: string | null }> {
  const { result } = args;
  const exec = async (db: Prisma.TransactionClient) => {
    let matchProofId: string | null = null;
    if (result.proof && result.tier) {
      const proof = await db.matchProof.create({
        data: {
          matchProofType: result.proof.matchProofType,
          matchTier: result.tier,
          confidence: result.confidence,
          attributionSessionId: result.attributionSessionId ?? null,
          reservationId: result.reservationId ?? null,
          invuOrderNormalizedId: args.invuOrderNormalizedId,
          invuOrderId: args.invuOrderId,
          bookingCode: result.proof.bookingCode,
          sourceField: result.proof.sourceField,
          supportingDataJson: result.proof.detailJson,
          createdByUserId: args.performedByUserId ?? null,
        },
        select: { id: true },
      });
      matchProofId = proof.id;
    }

    let tableSessionId: string | null = args.tableSessionId ?? null;
    if (!tableSessionId && result.attributionSessionId) {
      const ts = await db.tableSession.findUnique({
        where: { attributionSessionId: result.attributionSessionId },
        select: { id: true },
      });
      tableSessionId = ts?.id ?? null;
    }
    let reversedAllocationCount = 0;
    if (tableSessionId) {
      const eligibility: CommissionEligibilityStatus =
        result.status === "AUTO_MATCHED"
          ? "ELIGIBLE_AUTO"
          : result.status === "REVIEW_PENDING"
            ? "ELIGIBLE_REVIEW"
            : result.status === "MANUALLY_OVERRIDDEN"
              ? "OVERRIDE_LOCKED"
              : "NOT_ELIGIBLE";

      // Snapshot prior status BEFORE the update so we can detect downgrades
      // and so the auto-promotion below never overwrites a sticky terminal
      // state (DISPUTED / CLOSED).
      const prior = await db.tableSession.findUnique({
        where: { id: tableSessionId },
        select: {
          matchStatus: true,
          grossCents: true,
          closedAt: true,
          status: true,
          attributionSessionId: true,
          reservationId: true,
          bookingCode: true,
        },
      });

      // ─── Financial roll-up ────────────────────────────────────────────
      // Closes the gross-rollup gap discovered Apr 29 2026: Tier-2/Tier-2.5
      // operational matches were correctly LINKING the InvuOrderNormalized
      // record to a host-pre-bound TableSession but NOT carrying the
      // financials across, so the TableSession stayed at $0
      // commissionableCents and auto-mint was silently skipped (the minter
      // is gated on commissionableCents > 0). Companion to the
      // `backfill-tablesession-financials.ts` script that repaired existing
      // rows.
      //
      // We link the current record FIRST, then aggregate across every
      // InvuOrderNormalized row tied to this TableSession (covers split
      // checks). Mirrors the canonical commissionable formula in
      // invuAggregationService (`gross − tax`, clamped to 0; 0 if voided/
      // credited or fully discounted). Only rolled up for resolved matches
      // (AUTO_MATCHED / MANUALLY_OVERRIDDEN); REJECTED/UNMATCHED leaves
      // financials untouched so a downgrade flow never zeros out a row.
      let financialsUpdate: {
        grossCents: number;
        discountCents: number;
        taxCents: number;
        tipCents: number;
        refundCents: number;
        netRevenueCents: number;
        commissionableCents: number;
        closedAt?: Date;
      } | null = null;
      const shouldRollUpFinancials =
        result.status === "AUTO_MATCHED" ||
        result.status === "MANUALLY_OVERRIDDEN";
      if (shouldRollUpFinancials) {
        // Link the current record up-front so the aggregation below
        // includes it. Idempotent: if the link is already set to this
        // tableSessionId, nothing changes.
        await db.invuOrderNormalized.update({
          where: { id: args.invuOrderNormalizedId },
          data: { tableSessionId },
        });

        const linkedNormalized = await db.invuOrderNormalized.findMany({
          where: { tableSessionId },
          select: {
            payloadType: true,
            grossCents: true,
            discountCents: true,
            taxCents: true,
            tipCents: true,
            refundCents: true,
            netRevenueCents: true,
            closedAt: true,
            statusCanonical: true,
          },
        });

        if (linkedNormalized.length > 0) {
          // Mirror invuAggregationService: never cross-sum gross/discount/tax
          // across different payload types (causes double-counting when the
          // same INVU order delivers both a CLOSED_ORDER and a sparser
          // ORDER_TOTAL/INVOICE_TOTAL artifact). Pick ONE authoritative type
          // by priority, then SUM all records of that type only (handles
          // split-check fragments). Tips come from PAYMENT_SUMMARY rows when
          // present; refunds come from CREDIT_NOTE rows when present.
          const REVENUE_PRIORITY = ["CLOSED_ORDER", "ORDER_TOTAL", "INVOICE_TOTAL"] as const;
          let authoritativeType: typeof REVENUE_PRIORITY[number] | null = null;
          for (const pt of REVENUE_PRIORITY) {
            if (linkedNormalized.some((r) => r.payloadType === pt)) {
              authoritativeType = pt;
              break;
            }
          }
          const revenueRecords = authoritativeType
            ? linkedNormalized.filter((r) => r.payloadType === authoritativeType)
            : linkedNormalized;

          const grossCents = revenueRecords.reduce((s, r) => s + r.grossCents, 0);
          const discountCents = revenueRecords.reduce((s, r) => s + r.discountCents, 0);
          const taxCents = revenueRecords.reduce((s, r) => s + r.taxCents, 0);
          const netRevenueCents = revenueRecords.reduce((s, r) => s + r.netRevenueCents, 0);

          const paymentSummaryTips = linkedNormalized
            .filter((r) => r.payloadType === "PAYMENT_SUMMARY")
            .reduce((s, r) => s + r.tipCents, 0);
          const tipCents =
            paymentSummaryTips > 0
              ? paymentSummaryTips
              : revenueRecords.reduce((s, r) => s + r.tipCents, 0);

          const creditNoteRefunds = linkedNormalized
            .filter((r) => r.payloadType === "CREDIT_NOTE")
            .reduce((s, r) => s + r.refundCents, 0);
          const refundCents =
            creditNoteRefunds > 0
              ? creditNoteRefunds
              : revenueRecords.reduce((s, r) => s + r.refundCents, 0);

          const latestClosedAt = revenueRecords.reduce<Date | null>(
            (acc, r) => (r.closedAt && (!acc || r.closedAt > acc) ? r.closedAt : acc),
            null
          );
          const anyVoidedOrCredited = revenueRecords.some(
            (r) => r.statusCanonical === "VOIDED" || r.statusCanonical === "CREDITED"
          );

          const isFullDiscount = discountCents >= grossCents && grossCents > 0;
          const commissionableCents =
            anyVoidedOrCredited || isFullDiscount
              ? 0
              : Math.max(0, grossCents - taxCents);

          financialsUpdate = {
            grossCents,
            discountCents,
            taxCents,
            tipCents,
            refundCents,
            netRevenueCents,
            commissionableCents,
            // Only stamp closedAt if the TableSession doesn't already have
            // one — never rewind a closedAt that's already set.
            ...(latestClosedAt && !prior?.closedAt ? { closedAt: latestClosedAt } : {}),
          };
        }
      }

      // ─── Auto-promote PENDING_REVIEW → MATCHED on a clean auto-match ──
      // Until Apr 29 2026 every auto-matched session sat at PENDING_REVIEW
      // forever (the default), waiting on a human to click Approve in the
      // Review Queue — even when the matcher had already locked in
      // AUTO_MATCHED with full financials. The result was 156 cleanly
      // matched, paid, closed-in-INVU sessions piled up in the "exception"
      // bucket while the "Closed/Matched" filters showed empty. Per ops
      // directive (29 Apr 2026): when the matcher is confident and POS-
      // verified, the session IS the terminal happy state — no human
      // gate. The Review Queue is reserved for genuine exceptions
      // (UNMATCHED / low-confidence / disputed).
      //
      // Promote only:
      //   - on AUTO_MATCHED or MANUALLY_OVERRIDDEN (the resolved-good states)
      //   - when financials actually rolled up (commissionableCents > 0
      //     OR a closedAt is being stamped — proves a real INVU close)
      //   - when prior status is PENDING_REVIEW (never overwrite a sticky
      //     DISPUTED or CLOSED that was set by an explicit admin action)
      const shouldPromoteStatus =
        (result.status === "AUTO_MATCHED" || result.status === "MANUALLY_OVERRIDDEN") &&
        prior?.status === "PENDING_REVIEW" &&
        financialsUpdate !== null &&
        (financialsUpdate.commissionableCents > 0 ||
          financialsUpdate.closedAt !== undefined ||
          prior?.closedAt !== null);

      // ─── Auto-close unattributed walk-ins → CLOSED ────────────────────
      // Companion rule (29 Apr 2026): when an INVU order syncs as a real
      // closed/paid sale BUT the matcher cannot tie it to any commission
      // earner (no host pre-bind, no referral attribution, no AttributionSession
      // candidate), there is literally nobody to pay commission to. Until
      // now these landed in PENDING_REVIEW forever, drowning the Review
      // Queue in 100+ "walk-in" rows that no human action could resolve.
      // Per ops directive: closed-and-untracked → CLOSED with zero
      // commissionable. This is the no-commission terminal state. Rule:
      //   - matcher result is UNMATCHED or REVIEW_PENDING
      //   - no AttributionSession on either side (none being linked, none
      //     was previously linked) — confirms genuinely walk-in
      //   - the order is actually closed in INVU (closedAt + grossCents > 0,
      //     either now or already on the row)
      //   - prior status is PENDING_REVIEW (never overwrite a sticky
      //     terminal state set by an explicit admin action)
      const effectiveClosedAt = prior?.closedAt ?? null;
      const effectiveGrossCents = prior?.grossCents ?? 0;
      // Defensive earner-presence check: in addition to the linked
      // AttributionSession (which the matcher manages), look for ANY
      // commission earner signal on the booking — legacy
      // ReservationAttribution rows OR an AttributionSession that exists
      // for the reservation but never got linked to this TableSession
      // (Roger's case 29 Apr 2026: AttributionSession.invuOrderId stored
      // as "1-2-2524-41595" while TableSession.invuOrderId stored as
      // "2524", so the matcher's invuOrderId equality lookup misses the
      // pre-bind and the row would be silently auto-closed at zero
      // commission). Auto-close requires zero earners EVERYWHERE.
      let hasAnyEarnerSignal = false;
      if (prior?.reservationId) {
        const [legacyAttrCount, sessionAttrCount] = await Promise.all([
          db.reservationAttribution.count({
            where: { reservationId: prior.reservationId },
          }),
          db.attributionSession.count({
            where: { reservationId: prior.reservationId },
          }),
        ]);
        hasAnyEarnerSignal = legacyAttrCount > 0 || sessionAttrCount > 0;
      }
      if (!hasAnyEarnerSignal && prior?.bookingCode) {
        const codeAttrCount = await db.attributionSession.count({
          where: { bookingCode: prior.bookingCode },
        });
        hasAnyEarnerSignal = codeAttrCount > 0;
      }

      // Conservative fallback: when the TableSession lacks BOTH a
      // reservationId and a bookingCode, our earner-presence checks
      // cannot reach external evidence at all — the row is "unknowable"
      // from this side. Treat unknowable rows as ineligible for
      // auto-close so we never strip commission from a row whose
      // earner just happens to live in a table we couldn't query.
      const isLinkable = Boolean(prior?.reservationId) || Boolean(prior?.bookingCode);

      const shouldAutoCloseUnattributed =
        (result.status === "UNMATCHED" || result.status === "REVIEW_PENDING") &&
        prior?.status === "PENDING_REVIEW" &&
        !result.attributionSessionId &&
        !prior?.attributionSessionId &&
        isLinkable &&
        !hasAnyEarnerSignal &&
        effectiveClosedAt !== null &&
        effectiveGrossCents > 0;

      await db.tableSession.update({
        where: { id: tableSessionId },
        data: {
          matchTier: result.tier ?? null,
          matchStatus: result.status,
          matchConfidence: result.confidence,
          matchProofId,
          commissionEligibility: eligibility,
          ...(financialsUpdate ?? {}),
          ...(shouldPromoteStatus ? { status: "MATCHED" as const } : {}),
          ...(shouldAutoCloseUnattributed
            ? { status: "CLOSED" as const, commissionableCents: 0 }
            : {}),
        },
      });

      // ─── Reservation.actualRevenueCents back-propagation ──────────────
      // Closes a UI plumbing gap discovered Apr 29 2026 (Roger / INVU
      // 2524): the host close-card at HostDashboardClient.tsx:417 reads
      // Reservation.actualRevenueCents, but the matcher only writes the
      // rolled-up gross to TableSession.grossCents. Result: even after
      // the INVU sync proved a $287.04 close, the guest card kept saying
      // "Awaiting POS close" because actualRevenueCents stayed NULL.
      //
      // STRICTLY gated to LOCKED-confidence matches only (AUTO_MATCHED
      // / MANUALLY_OVERRIDDEN). TIER3_HEURISTIC_REVIEW guesses sit at
      // matchConfidence ~0.1 and the matcher will park 10+ unattributed
      // POS orders against the closest reservation as a "best guess"
      // (observed: QR Verify 2 had 11 different INVU orders linked at
      // 0.1 confidence). Propagating those guesses would silently
      // overwrite an unrelated guest's revenue. Only write when the
      // matcher is willing to bet the commission ledger on the link.
      //
      // Idempotent: re-running with the same financials is a no-op
      // write of the same value. Skip when grossCents is 0 to avoid
      // clobbering a manually entered actual on a void/refund-only roll.
      const isLockedMatch =
        result.status === "AUTO_MATCHED" || result.status === "MANUALLY_OVERRIDDEN";
      if (
        isLockedMatch &&
        financialsUpdate &&
        prior?.reservationId &&
        typeof financialsUpdate.grossCents === "number" &&
        financialsUpdate.grossCents > 0
      ) {
        // Manual-entry preservation: only fill when the field is still
        // empty. A host (or admin) may have keyed an actual revenue value
        // through the close-card before INVU caught up, and a later sync
        // round must not silently rewind that figure to a stale POS gross.
        // updateMany with the actualRevenueCents=null guard makes this an
        // atomic conditional write — zero rows updated when a value is
        // already present, no error, no audit noise.
        await db.reservation.updateMany({
          where: { id: prior.reservationId, actualRevenueCents: null },
          data: { actualRevenueCents: financialsUpdate.grossCents },
        });
      }

      // Close the attribution loop: when the INVU sync proves this table
      // session resolves to a real closed/paid sale (AUTO_MATCHED), flip
      // the linked AttributionSession to VERIFIED_POS_SALE so the
      // commission minter is allowed to release allocations. Idempotent —
      // only advance forward, never rewind a session that already went
      // through verification.
      if (result.status === "AUTO_MATCHED" && result.attributionSessionId) {
        await db.attributionSession.updateMany({
          where: {
            id: result.attributionSessionId,
            // Accept every pre-verified lifecycle state, including the
            // deprecated BOUND_TO_POS (kept for one release cycle per
            // docs/invu-execution-roadmap.md §D1) and the replacement
            // state POS_BIND_INTENT_RECORDED. (POS_REFERENCE_WRITTEN was
            // retired Apr 28 2026 — vendor confirmed no INVU write path.)
            // VERIFIED_POS_SALE remains the single mint gate; this update
            // only advances rows toward it, never rewinds.
            status: {
              in: [
                "CAPTURED",
                "SEATED",
                "POS_BIND_INTENT_RECORDED",
                "BOUND_TO_POS",
              ],
            },
          },
          data: {
            status: "VERIFIED_POS_SALE",
            verifiedAt: new Date(),
          },
        });
      }

      // ─── Downgrade safety: reverse PENDING allocations ────────────────
      // If a session that previously AUTO-minted commissions now resolves
      // to anything other than AUTO_MATCHED or MANUALLY_OVERRIDDEN (which
      // locks at 100%), the existing PENDING allocations are no longer
      // valid. APPROVED/PAID allocations are NOT touched here — those are
      // managed through the explicit revenue-admin reverse flow with its
      // own audit. PAID allocations require treasury action; auto-flipping
      // them would create silent clawbacks.
      const isDowngrade =
        prior?.matchStatus === "AUTO_MATCHED" &&
        result.status !== "AUTO_MATCHED" &&
        result.status !== "MANUALLY_OVERRIDDEN";
      if (isDowngrade) {
        const reversal = await db.commissionAllocation.updateMany({
          where: {
            tableSessionId,
            status: "PENDING",
          },
          data: {
            status: "REVERSED",
          },
        });
        reversedAllocationCount = reversal.count;
      }
    }

    if (tableSessionId) {
      await db.invuOrderNormalized.update({
        where: { id: args.invuOrderNormalizedId },
        data: { tableSessionId },
      });
    }

    return { matchProofId, tableSessionId, reversedAllocationCount };
  };
  const runner = args.db ?? prisma;
  const persisted = "$transaction" in runner
    ? await (runner as typeof prisma).$transaction(exec)
    : await exec(runner as Prisma.TransactionClient);

  // Audit (post-commit so we never log a match that rolled back). Best-effort:
  // a failed audit must never bubble up and undo a successful match write.
  try {
    const action =
      result.status === "AUTO_MATCHED"
        ? result.tier === "TIER1_DETERMINISTIC"
          ? "INVU_MATCH_AUTO_TIER1"
          : result.tier === "TIER2_OPERATIONAL"
            ? "INVU_MATCH_AUTO_TIER2"
            : result.tier === "TIER2_PASSIVE"
              ? "INVU_MATCH_AUTO_TIER2_PASSIVE"
              : "INVU_MATCH_AUTO_TIER3"
        : result.status === "REVIEW_PENDING"
          ? "INVU_MATCH_REVIEW_PENDING"
          : result.status === "MANUALLY_OVERRIDDEN"
            ? "INVU_MATCH_OVERRIDE"
            : "INVU_MATCH_UNMATCHED";
    await prisma.auditLog.create({
      data: {
        actorId: args.performedByUserId ?? "system",
        action,
        metadata: {
          invuOrderNormalizedId: args.invuOrderNormalizedId,
          invuOrderId: args.invuOrderId,
          tier: result.tier ?? null,
          status: result.status,
          confidence: result.confidence,
          reservationId: result.reservationId ?? null,
          attributionSessionId: result.attributionSessionId ?? null,
          tableSessionId: persisted.tableSessionId,
          matchProofId: persisted.matchProofId,
          reversedAllocationCount: persisted.reversedAllocationCount,
        },
      },
    });
  } catch {
    // swallow — observability path must not break the match write
  }

  return persisted;
}

// ─── Backwards-compat shim for legacy callers ────────────────────────────────
export type { TrustScoreInput };
export interface MatchResult {
  reservationId: string | null;
  matchMethod: "AUTO" | "MANUAL" | "UNMATCHED";
  trustScore: number;
  trustScoreInput: TrustScoreInput;
  issueType?: string;
  multipleMatches?: boolean;
}
export interface MatchSignals {
  paymentTotalConsistent: boolean;
  noDuplicateConflict: boolean;
}
export function matchNormalizedToReservation(
  normalized: InvuOrderNormalized,
  candidates: Array<{ id?: string; reservationId?: string; reservationDate: Date; partySize: number; contactName: string; assignedTableLabel: string | null }>,
  _priorReservationId?: string | null,
  _signals?: MatchSignals
): MatchResult {
  const heuristicCandidates: HeuristicCandidate[] = candidates.map((c) => ({
    reservationId: c.reservationId ?? c.id ?? "",
    reservationDate: c.reservationDate,
    partySize: c.partySize,
    contactName: c.contactName,
    assignedTableLabel: c.assignedTableLabel,
  }));
  const t3 = resolveTier3Heuristic(normalized, heuristicCandidates);
  if (!t3) {
    return {
      reservationId: null,
      matchMethod: "UNMATCHED",
      trustScore: 0,
      trustScoreInput: {
        matchMethod: "UNMATCHED",
        hasExactMatch: false,
        tableLabelMatches: false,
        customerNameMatchQuality: 0,
        timeWindowFitMinutes: null,
        paymentTotalConsistent: false,
        noDuplicateConflict: true,
        noCreditAmbiguity: true,
      },
      issueType: "NO_MATCH",
    };
  }
  return {
    reservationId: t3.reservationId,
    matchMethod: "AUTO",
    trustScore: t3.trustScore,
    trustScoreInput: t3.trustScoreInput,
    issueType: t3.issueType,
    multipleMatches: t3.issueType === "MULTIPLE_MATCHES",
  };
}
