import { customAlphabet } from "nanoid";
import type {
  Prisma,
  AttributionSessionKind,
  AttributionSessionSource,
  AttributionSessionStatus,
  AnchorStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

const BOOKING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const bookingCodeBody = customAlphabet(BOOKING_CODE_ALPHABET, 8);

export function generateBookingCode(year = new Date().getUTCFullYear()): string {
  return `OKU-${year}-${bookingCodeBody()}`;
}

export type CreateAttributionSessionInput = {
  kind: AttributionSessionKind;
  venueId: string;
  reservationId?: string | null;
  walkinContactName?: string | null;
  walkinPartySize?: number | null;
  walkinNotes?: string | null;
  tableLabel?: string | null;
  zoneId?: string | null;
  hostUserId?: string | null;
  hostProfileId?: string | null;
  referralActorId?: string | null;
  legacyReferrerId?: string | null;
  /** The specific ReferralLink that was scanned/followed (proof-chain context). */
  referralLinkId?: string | null;
  createdByUserId?: string | null;
  /**
   * Where this attribution session originated. Required so the lifecycle
   * pipeline (CAPTURED → SEATED → POS_BIND_INTENT_RECORDED →
   * VERIFIED_POS_SALE) can tag every row at the source of truth instead
   * of guessing later.
   */
  source: AttributionSessionSource;
  /**
   * Initial lifecycle status. Defaults to CAPTURED for QR-driven public
   * reservations (no table assigned yet); host check-in / walk-in flows
   * pass SEATED because they create the row only at seating time.
   */
  initialStatus?: AttributionSessionStatus;
  /**
   * Anchor status. Defaults to ANCHORED (fully attributed). Pass
   * PENDING_ATTRIBUTION when the referral write failed after a referrer
   * context was resolved, so the booking is not silently downgraded to DIRECT.
   */
  anchorStatus?: AnchorStatus;
  /**
   * The error message from the attribution failure, stored so admins can see
   * why a session is in PENDING_ATTRIBUTION / FAILED_REVIEW.
   */
  anchorLastError?: string | null;
};

export type AttributionMintResult = {
  attributionSessionId: string;
  tableSessionId: string;
  bookingCode: string;
};

/**
 * Mint a deterministic table_session_id + booking_code anchored to either a
 * reservation or a walk-in. Both rows are created in a single transaction so
 * the attribution chain is committed atomically before any revenue posts.
 */
export async function createAttributionSession(
  input: CreateAttributionSessionInput,
  tx?: Prisma.TransactionClient
): Promise<AttributionMintResult> {
  const exec = async (db: Prisma.TransactionClient) => {
    let bookingCode = generateBookingCode();
    let attempts = 0;
    while (await db.attributionSession.findUnique({ where: { bookingCode }, select: { id: true } })) {
      if (attempts++ > 10) throw new Error("Could not generate unique booking code");
      bookingCode = generateBookingCode();
    }

    const tableSession = await db.tableSession.create({
      data: {
        venueId: input.venueId,
        reservationId: input.reservationId ?? null,
        tableLabel: input.tableLabel ?? null,
        bookingCode,
        status: "PENDING_REVIEW",
        matchStatus: "UNMATCHED",
        syncStatus: "NOT_SEEN",
        commissionEligibility: "NOT_ELIGIBLE",
      },
      select: { id: true },
    });

    const initialStatus: AttributionSessionStatus = input.initialStatus ?? "CAPTURED";
    // When the helper is used at seating time (host check-in / walk-in), the
    // SEATED transition is implicit — stamp seatedAt at insert so downstream
    // queries don't need to special-case status without timestamps.
    const seatedAt = initialStatus === "SEATED" ? new Date() : null;

    const attribution = await db.attributionSession.create({
      data: {
        kind: input.kind,
        venueId: input.venueId,
        reservationId: input.reservationId ?? null,
        walkinContactName: input.walkinContactName ?? null,
        walkinPartySize: input.walkinPartySize ?? null,
        walkinNotes: input.walkinNotes ?? null,
        bookingCode,
        tableLabel: input.tableLabel ?? null,
        zoneId: input.zoneId ?? null,
        hostUserId: input.hostUserId ?? null,
        hostProfileId: input.hostProfileId ?? null,
        referralActorId: input.referralActorId ?? null,
        legacyReferrerId: input.legacyReferrerId ?? null,
        referralLinkId: input.referralLinkId ?? null,
        createdByUserId: input.createdByUserId ?? null,
        source: input.source,
        status: initialStatus,
        seatedAt,
        anchorStatus: input.anchorStatus ?? "ANCHORED",
        anchorLastError: input.anchorLastError ?? null,
        anchorLastAttemptAt: input.anchorStatus === "PENDING_ATTRIBUTION" ? new Date() : null,
      },
      select: { id: true, bookingCode: true },
    });

    await db.tableSession.update({
      where: { id: tableSession.id },
      data: { attributionSessionId: attribution.id },
    });

    return { attributionSessionId: attribution.id, tableSessionId: tableSession.id, bookingCode: attribution.bookingCode };
  };

  if (tx) return exec(tx);
  return prisma.$transaction(exec);
}
