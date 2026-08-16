import { prisma } from "@/lib/prisma";
import type { ReservationStatus } from "@prisma/client";
import { getResendClient, isResendConfigured } from "@/server/invitation/resend";
import { createAttributionSession } from "@/server/services/invu/identityService";
import { ensureHostAttributionForReservation } from "@/server/referrals/hostAttributionResolver";
import { enqueueLedgerEvent } from "@/server/services/ledger/ledgerOutboxService";
// Capacity hold lifecycle is handled inline in transitionStatus using the
// prisma client directly so the mutations are atomic with the reservation update.
// createCapacityHold / assignSpace are used by the dedicated assign-space route.
import { DEFAULT_DURATION_MINUTES, FAR_FUTURE_EXPIRY } from "@/server/spaces/capacityService";
import { assertNoBlockingOccupancy } from "@/server/events/eventOccupancyService";

export const INCLUDE_FULL = {
  zone: true,
  guestProfile: true,
  handoffs: { orderBy: { createdAt: "desc" as const }, take: 1 },
  attributions: { include: { referrer: true }, take: 1 },
  // The new attribution chain is the source of truth for QR-booked guests
  // (the legacy `attributions` row is only written when the resolved actor
  // happens to have a legacyReferrerId, which excludes every host-link /
  // event-referrer-only actor like RAFNH01). Pulling both `referralActor`
  // and `legacyReferrer` lets the drawer's "Referred by" line render the
  // correct name no matter which of the three resolution paths fired.
  attributionSession: {
    include: {
      referralActor:  { select: { id: true, displayName: true, actorType: true } },
      legacyReferrer: { select: { id: true, fullName: true,    referrerType: true } },
    },
  },
  addons: true,
  statusLogs: { orderBy: { changedAt: "desc" as const }, take: 10 },
  assignedHost: true,
  // Space-aware capacity (Task #181)
  requestedSpace: { select: { id: true, name: true, capacity: true } },
  assignedSpace:  { select: { id: true, name: true, capacity: true } },
};

export async function getHostQueue(venueId: string) {
  // Rolling window instead of UTC-midnight bounds. The server runs in UTC
  // and Venue has no timezone column, so a Panama booking at 22:30 local
  // (= 03:30 UTC next day) was being shoved into "yesterday" and dropped
  // from the queue. The window below shows anything from a few hours ago
  // (still-seated tables) through the next ~30h (tonight + tomorrow), which
  // is timezone-tolerant for any venue between roughly UTC-12 and UTC+12.
  const now = new Date();
  const windowStart = new Date(now.getTime() - 12 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 30 * 60 * 60 * 1000);

  const [reservations, waitlist, zones] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        venueId,
        reservationDate: { gte: windowStart, lt: windowEnd },
        status: { notIn: ["CANCELLED"] },
      },
      include: INCLUDE_FULL,
      orderBy: { reservationDate: "asc" },
    }),
    prisma.resWaitlistEntry.findMany({
      where: { venueId, status: { in: ["ACTIVE", "READY"] } },
      include: { zone: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.zone.findMany({
      where: { venueId, isBookable: true },
      include: { tables: { where: { isActive: true } } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.venue.findUnique({
      where: { id: venueId },
      select: { commissionValidationMode: true },
    }),
  ]);

  return { reservations, waitlist, zones };
}

export async function createStreetsideBooking(data: {
  venueId: string;
  guestName: string;
  guestEmail: string;
  guestWhatsapp?: string | null;
  visitorType?: string | null;
  emailOptIn?: boolean;
  partySize: number;
  conceptRequested?: string | null;
  occasion?: string | null;
  notes?: string | null;
  requestedTime?: string | null;
  sourceUserId: string;
}) {
  const confirmationCode = `SH-${Date.now().toString(36).toUpperCase()}`;

  // Upsert guest profile
  let guestProfile = await prisma.resGuestProfile.findFirst({
    where: { email: data.guestEmail },
  });
  if (!guestProfile) {
    guestProfile = await prisma.resGuestProfile.create({
      data: {
        fullName: data.guestName,
        email: data.guestEmail,
        whatsapp: data.guestWhatsapp ?? null,
        guestTagsJson: data.visitorType ? { visitorType: data.visitorType } : undefined,
      },
    });
  } else if (data.guestWhatsapp && !guestProfile.whatsapp) {
    guestProfile = await prisma.resGuestProfile.update({
      where: { id: guestProfile.id },
      data: { whatsapp: data.guestWhatsapp },
    });
  }

  // Build notes with visitor type prefix
  const notesWithMeta = [
    data.visitorType ? `[${data.visitorType}]` : null,
    data.emailOptIn ? "[Email Opt-In]" : null,
    data.notes || null,
  ].filter(Boolean).join(" ");

  // Wrap reservation creation + durable outbox intent in one transaction so
  // the proof-trail intent and the business write commit atomically.
  const reservation = await prisma.$transaction(async (tx) => {
    const startAt = data.requestedTime ? new Date(data.requestedTime) : new Date();
    // A host-created request may not have a physical space yet, but it cannot
    // be used to bypass a whole-restaurant exclusive event. Space-specific
    // policy is enforced again at manual assignment.
    await assertNoBlockingOccupancy(tx, {
      venueId: data.venueId,
      startAt,
      endAt: new Date(startAt.getTime() + DEFAULT_DURATION_MINUTES * 60_000),
    });
    const res = await tx.reservation.create({
      data: {
        venueId: data.venueId,
        source: "STREETSIDE_HOST",
        status: "PENDING",
        reservationDate: startAt,
        partySize: data.partySize,
        conceptRequested: data.conceptRequested ?? null,
        occasion: data.occasion ?? null,
        notes: notesWithMeta || null,
        contactName: data.guestName,
        contactEmail: data.guestEmail,
        contactWhatsapp: data.guestWhatsapp ?? null,
        confirmationCode,
        sourceContext: data.sourceUserId,
        guestProfileId: guestProfile.id,
      },
    });

    await tx.reservationHandoff.create({
      data: {
        reservationId: res.id,
        sentByRole: "STREETSIDE_HOST",
        sentByLabel: data.sourceUserId,
        handoffStatus: "PENDING",
      },
    });

    await tx.reservationStatusLog.create({
      data: {
        reservationId: res.id,
        fromStatus: null,
        toStatus: "PENDING",
        changedByUserId: data.sourceUserId,
        changedByLabel: "STREETSIDE_HOST",
        notes: "Booking submitted by streetside host",
      },
    });

    // Durable outbox row — committed atomically with the reservation.
    await enqueueLedgerEvent(tx, {
      eventType: "RESERVATION_REQUESTED",
      source: { system: "host_ops", connector: null, recordId: null },
      confidenceClass: "PARTNER_REPORTED_EVENT",
      idempotencyKey: `reservation:${res.id}:status:REQUESTED`,
      reservationId: res.id,
      payload: {
        source: "STREETSIDE_HOST",
        partySize: data.partySize,
        conceptRequested: data.conceptRequested ?? null,
        hostUserId: data.sourceUserId,
      },
    });

    return res;
  });

  // Open the deterministic AttributionSession for this streetside walk-in.
  // Without this, the host who took the walk-in has no path to verification
  // and cannot earn a commission no matter how the matcher resolves later.
  // Source = HOST_WALKIN, status starts at SEATED because the host is
  // putting them at a table immediately. hostUserId is stamped so commission
  // allocations resolve back to the streetside host. Best-effort: a failure
  // here must NOT block the booking — the diner already has a confirmation
  // code, and an admin can heal manually via the backfill script.
  try {
    await createAttributionSession({
      kind: "RESERVATION",
      source: "HOST_WALKIN",
      initialStatus: "SEATED",
      venueId: data.venueId,
      reservationId: reservation.id,
      hostUserId: data.sourceUserId,
      createdByUserId: data.sourceUserId,
    });

    // Stamp the streetside host's referral identity onto the new
    // AttributionSession so commission flows back to them at INVU close.
    // The host took the walk-in: they ARE the referrer for this booking
    // unless a more specific QR attribution overwrites it later.
    const hp = await prisma.restaurantHostProfile.findUnique({
      where: { userId: data.sourceUserId },
      select: { id: true },
    });
    if (hp) {
      await ensureHostAttributionForReservation(reservation.id, hp.id);
    }
  } catch (sessionErr) {
    console.error(
      "[createStreetsideBooking] failed to open AttributionSession",
      { reservationId: reservation.id, hostUserId: data.sourceUserId, err: sessionErr }
    );
  }

  // Send confirmation email (best-effort, non-blocking)
  sendBookingConfirmationEmail({
    guestName: data.guestName,
    guestEmail: data.guestEmail,
    confirmationCode,
    partySize: data.partySize,
    conceptRequested: data.conceptRequested ?? null,
    occasion: data.occasion ?? null,
    visitorType: data.visitorType ?? null,
    emailOptIn: data.emailOptIn ?? false,
  }).catch((err) => console.error("[email] Confirmation send failed:", err));

  return reservation;
}

async function sendBookingConfirmationEmail(opts: {
  guestName: string;
  guestEmail: string;
  confirmationCode: string;
  partySize: number;
  conceptRequested: string | null;
  occasion: string | null;
  visitorType: string | null;
  emailOptIn: boolean;
}) {
  if (!isResendConfigured()) return;
  const { client, fromEmail } = await getResendClient();

  const conceptLabel = opts.conceptRequested || "OKÜ";
  const occasionLine = opts.occasion ? `<p style="margin:0 0 6px;color:#9ca3af;font-size:14px;">Occasion: <strong style="color:#d1d5db">${opts.occasion}</strong></p>` : "";
  const visitorLine = opts.visitorType ? `<p style="margin:0 0 6px;color:#9ca3af;font-size:14px;">Visitor profile: <strong style="color:#d1d5db">${opts.visitorType}</strong></p>` : "";
  const optInNote = opts.emailOptIn
    ? `<p style="margin:20px 0 0;color:#6b7280;font-size:12px;">You've opted in to future updates from OKÜ Hospitality Group. We'll be in touch with exclusive events and experiences.</p>`
    : "";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0f;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#111113;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#1a1614 0%,#111113 100%);padding:36px 40px;text-align:center;border-bottom:1px solid rgba(200,169,110,0.15);">
          <p style="margin:0 0 4px;font-size:22px;font-weight:800;letter-spacing:0.08em;color:#c8a96e;">OKÜ</p>
          <p style="margin:0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#6b7280;">Hospitality Group</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 40px;">
          <p style="margin:0 0 20px;font-size:18px;font-weight:700;color:#f3f4f6;">Welcome, ${opts.guestName} 👋</p>
          <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;line-height:1.6;">Your booking has been received and is being confirmed by our team. A host will be with you shortly.</p>

          <!-- Booking details -->
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#6b7280;">Booking Details</p>
            <p style="margin:0 0 6px;color:#9ca3af;font-size:14px;">Confirmation: <strong style="color:#c8a96e;font-family:monospace">${opts.confirmationCode}</strong></p>
            <p style="margin:0 0 6px;color:#9ca3af;font-size:14px;">Experience: <strong style="color:#d1d5db">${conceptLabel}</strong></p>
            <p style="margin:0 0 6px;color:#9ca3af;font-size:14px;">Party size: <strong style="color:#d1d5db">${opts.partySize} guest${opts.partySize !== 1 ? "s" : ""}</strong></p>
            ${occasionLine}
            ${visitorLine}
          </div>

          <!-- Vision blurb -->
          <div style="border-left:2px solid rgba(200,169,110,0.4);padding-left:16px;margin-bottom:24px;">
            <p style="margin:0 0 8px;font-size:13px;color:#d1d5db;line-height:1.6;">OKÜ Hospitality Group is building a curated ecosystem of dining, events, and cultural experiences rooted in Panama — connecting locals, visitors, and the global community through exceptional hospitality.</p>
            <p style="margin:0;font-size:12px;color:#6b7280;">Membership · Private Events · Restaurant Concepts · Rooftop Experiences</p>
          </div>

          ${optInNote}
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 40px 32px;border-top:1px solid rgba(255,255,255,0.06);text-align:center;">
          <p style="margin:0;font-size:11px;color:#374151;">© OKÜ Hospitality Group · Panama City</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await client.emails.send({
    from: fromEmail,
    to: opts.guestEmail,
    subject: `Your OKÜ booking is confirmed — ${opts.confirmationCode}`,
    html,
  });
}

export async function transitionStatus(
  reservationId: string,
  toStatus: ReservationStatus,
  actorId: string,
  opts?: {
    tableLabel?: string;
    lossReason?: string;
    lossReasonNotes?: string;
    internalNotes?: string;
    // Partial-arrival count (Apr 28 2026). Optional override for the
    // common "only N of partySize actually walked in" case. Stamped
    // whenever a host transitions to or stays at ARRIVED — not cleared
    // on forward moves so the closed card retains the original head-
    // count audit even after SEATED/COMPLETED.
    arrivedHeadcount?: number;
  }
) {
  const existing = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { venue: true, handoffs: true },
  });

  // Hard guard (Apr 28 2026): SEATED requires a tableLabel either now or
  // already on the row. The Operations Board UI enforces this client-side,
  // but the API was previously permissive — meaning a stale client (or a
  // direct curl) could land a reservation in SEATED with no table, which
  // breaks the bind UI and the close-of-sale table-match heuristic.
  if (toStatus === "SEATED") {
    const effectiveTable =
      opts?.tableLabel?.trim() || existing.assignedTableLabel?.trim();
    if (!effectiveTable) {
      const e = new Error("tableLabel is required to seat a reservation") as Error & { status?: number };
      e.status = 400;
      throw e;
    }
  }

  const now = new Date();
  const update: Record<string, unknown> = { status: toStatus };

  // Detect reverse moves up-front so we can gate forward-stamping on
  // !isReverse — otherwise SEATED→ARRIVED would re-stamp arrivalConfirmedAt
  // with `now` and clobber the original arrival timestamp.
  const STATUS_ORDER: Record<string, number> = {
    PENDING: 0, WAITLISTED: 0,
    CONFIRMED: 1, ACKNOWLEDGED: 2,
    ARRIVED: 3, SEATED: 4, COMPLETED: 5,
  };
  const fromOrder = STATUS_ORDER[existing.status];
  const toOrder = STATUS_ORDER[toStatus];
  const isReverse =
    fromOrder !== undefined && toOrder !== undefined && toOrder < fromOrder;

  if (!isReverse) {
    if (toStatus === "ARRIVED") {
      update.arrivalConfirmedAt = now;
      if (typeof opts?.arrivedHeadcount === "number") {
        update.arrivedHeadcount = opts.arrivedHeadcount;
      }
    }
    // Allow ARRIVED→ARRIVED corrections (host re-scans to update the
    // partial count) without re-stamping arrivalConfirmedAt.
    if (toStatus === existing.status && toStatus === "ARRIVED" && typeof opts?.arrivedHeadcount === "number") {
      update.arrivedHeadcount = opts.arrivedHeadcount;
    }
    if (toStatus === "SEATED") {
      update.seatedAt = now;
      // actorId is a User.id — look up the RestaurantHostProfile to get the correct FK value
      const hostProfile = await prisma.restaurantHostProfile.findUnique({
        where: { userId: actorId },
        select: { id: true },
      });
      if (hostProfile) update.assignedRestaurantHostId = hostProfile.id;
      if (opts?.tableLabel) update.assignedTableLabel = opts.tableLabel;

      const validationMode = existing.venue.commissionValidationMode;
      if (validationMode === "ON_SEATED") {
        update.commissionEligible = true;
        update.commissionValidatedAt = now;
      }
    }
    if (toStatus === "COMPLETED") {
      const validationMode = existing.venue.commissionValidationMode;
      if (validationMode === "ON_COMPLETED") {
        update.commissionEligible = true;
        update.commissionValidatedAt = now;
      }
    }
  } else {
    // ── Reverse-transition normalization ───────────────────────────────────
    // Hosts can walk a booking BACK along the journey (e.g., they fat-fingered
    // "Seated" or the guest left mid-seat). We clear side-effect fields when
    // the move crosses back over the boundary that originally set them, so
    // the row remains internally consistent (no status=ARRIVED + seatedAt).
    // Commission ELIGIBILITY is safely reversible because actual minting
    // happens later, post-INVU-close, in commissionMintingService — the flag
    // here is only a gate, not a payment record.
    if (toOrder! < 4 && fromOrder! >= 4) {
      update.seatedAt = null;
      update.assignedRestaurantHostId = null;
      update.assignedTableLabel = null;
      if (existing.venue.commissionValidationMode === "ON_SEATED") {
        update.commissionEligible = false;
        update.commissionValidatedAt = null;
      }
    }
    if (toOrder! < 3 && fromOrder! >= 3) {
      update.arrivalConfirmedAt = null;
    }
    if (toOrder! < 5 && fromOrder! >= 5) {
      if (existing.venue.commissionValidationMode === "ON_COMPLETED") {
        update.commissionEligible = false;
        update.commissionValidatedAt = null;
      }
    }
  }

  // ── All state-changing writes are inside a single transaction ───────────
  // This includes: status log, loss-attribution, capacity holds, reservation
  // update, and durable outbox rows. Every write or none — the audit trail
  // and the business state always agree.
  //
  // Both this transaction and `assignSpace` acquire advisory locks in the same
  // deterministic order — reservation lock (category 1) first, then space lock
  // (category 2) — so they are mutually exclusive on the same reservation,
  // preventing the race where a terminal transition commits after a concurrent
  // assignment creates a new ACTIVE hold.
  let confirmedHoldId: string | null = null;
  let confirmedSpaceId: string | null = null;
  let confirmedOverCapacity = false;
  let releasedHoldIds: string[] = [];
  const holdReleaseStatus: "RELEASED" | "CANCELLED" =
    toStatus === "CANCELLED" ? "CANCELLED" : "RELEASED";

  const reservation = await prisma.$transaction(async (tx) => {
    // ── Reservation advisory lock (same category/order as assignSpace) ──────
    // Serializes this transition with any concurrent assignSpace call on the
    // same reservation, preventing orphan active holds on terminal reservations.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(1, hashtext(${reservationId}))`;

    // ── Status log — inside the transaction so it only persists if every
    // subsequent write (reservation update, outbox) also succeeds. The ID
    // is used as the LedgerEvent idempotency key suffix so each distinct
    // status-log row maps to exactly one LedgerEvent, even on retries.
    const statusLog = await tx.reservationStatusLog.create({
      data: {
        reservationId,
        fromStatus: existing.status,
        toStatus,
        changedByUserId: actorId,
        lossReason: opts?.lossReason ?? null,
        lossReasonNotes: opts?.lossReasonNotes ?? null,
        notes: opts?.internalNotes ?? null,
      },
      select: { id: true },
    });

    // ── Loss attribution — also inside the transaction ────────────────────
    if (["NO_SHOW", "CANCELLED"].includes(toStatus) && opts?.lossReason) {
      await tx.reservationAttribution.updateMany({
        where: { reservationId },
        data: {
          lossReason: opts.lossReason as never,
          lossReasonNotes: opts.lossReasonNotes ?? null,
        },
      });
    }

    // 1. Capacity hold: create on CONFIRMED.
    //
    //    Two paths share the same advisory-lock + capacity-check + hold-upsert
    //    logic, differing only in which field supplies the space ID:
    //
    //    a) Normal path: host used assignSpace / the booking already has an
    //       assignedSpaceId. Always confirm (host accepted the overbooking risk);
    //       confirmedOverCapacity drives post-tx warning events.
    //
    //    b) PENDING_APPROVAL → CONFIRMED promotion: a QR guest picked a
    //       requiresApproval space; the space ID lived in requestedSpaceId only.
    //       This path promotes requestedSpaceId to assignedSpaceId atomically
    //       under the space advisory lock, runs a hard capacity check (throws 409
    //       if exhausted so the host can resolve before confirming), then creates
    //       the ACTIVE hold — all in the same transaction.
    //
    // Both paths acquire the space lock in category 2, matching the convention
    // in capacityService.assignSpace so there is no deadlock with concurrent
    // host-assignment calls for the same space.

    const isPendingApprovalPromotion =
      existing.status === "PENDING_APPROVAL" &&
      toStatus === "CONFIRMED" &&
      !existing.assignedSpaceId &&
      !!existing.requestedSpaceId;

    // Effective space: prefer assignedSpaceId; fall back to requestedSpaceId
    // only for the PENDING_APPROVAL promotion path.
    const effectiveSpaceId: string | null =
      existing.assignedSpaceId ??
      (isPendingApprovalPromotion ? (existing.requestedSpaceId ?? null) : null);

    if (toStatus === "CONFIRMED" && !isReverse && effectiveSpaceId) {
      // Acquire space advisory lock (category 2, same order as assignSpace).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${effectiveSpaceId}))`;

      const startAt = new Date(existing.reservationDate);
      const endAt = new Date(startAt.getTime() + (existing.durationMinutes ?? 120) * 60_000);

      // Confirming a pending approval is another reservation write path. It
      // cannot turn a guest request into a confirmed dining hold inside an
      // exclusive event/buyout window.
      await assertNoBlockingOccupancy(tx, {
        venueId: existing.venueId,
        spaceId: effectiveSpaceId,
        startAt,
        endAt,
      });

      // Overlap-aware capacity check under the space lock.
      const space = await tx.restaurantSpace.findUnique({
        where: { id: effectiveSpaceId },
        select: { capacity: true },
      });
      const competing = await tx.capacityHold.findMany({
        where: {
          spaceId: effectiveSpaceId,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
          startAt: { lt: endAt },
          endAt:   { gt: startAt },
          reservationId: { not: reservationId },
        },
        select: { partySize: true },
      });
      const held = competing.reduce((s, h) => s + h.partySize, 0);
      const available = (space?.capacity ?? 0) - held;
      confirmedOverCapacity = existing.partySize > available;

      if (confirmedOverCapacity && isPendingApprovalPromotion) {
        // Hard block on the PENDING_APPROVAL acceptance path: the space filled
        // up between the guest's request and the host's accept action. The host
        // must either assign a different space or override explicitly.
        // (assignedSpaceId path: host already accepted the risk; always confirm.)
        const e = new Error(
          `Space is at full capacity (${available} cover${available !== 1 ? "s" : ""} available, ` +
          `${existing.partySize} requested). Assign a different space or override manually.`
        ) as Error & { status?: number };
        e.status = 409;
        throw e;
      }

      // Promote requestedSpaceId → assignedSpaceId for PENDING_APPROVAL transitions
      // so the reservation row reflects the space that is now holding capacity.
      if (isPendingApprovalPromotion) {
        update.assignedSpaceId = effectiveSpaceId;
      }

      const hold = await tx.capacityHold.upsert({
        where: { spaceId_reservationId: { spaceId: effectiveSpaceId, reservationId } },
        create: {
          spaceId: effectiveSpaceId,
          reservationId,
          startAt,
          endAt,
          partySize: existing.partySize,
          status: "ACTIVE",
          // Confirmed holds are never expired by the time-based sweep;
          // released only by terminal-state transitions (cancel/no-show/complete).
          expiresAt: FAR_FUTURE_EXPIRY,
        },
        update: {
          startAt,
          endAt,
          partySize: existing.partySize,
          status: "ACTIVE",
          expiresAt: FAR_FUTURE_EXPIRY,
        },
        select: { id: true },
      });
      confirmedHoldId = hold.id;
      confirmedSpaceId = effectiveSpaceId;
    }

    // 2. Capacity hold: release on terminal statuses
    if (["NO_SHOW", "CANCELLED", "COMPLETED"].includes(toStatus) && !isReverse) {
      const active = await tx.capacityHold.findMany({
        where: { reservationId, status: "ACTIVE" },
        select: { id: true },
      });
      releasedHoldIds = active.map((h) => h.id);
      if (releasedHoldIds.length > 0) {
        await tx.capacityHold.updateMany({
          where: { id: { in: releasedHoldIds } },
          data: { status: holdReleaseStatus },
        });
      }
    }

    // 3. Reservation status update (same transaction)
    const updatedReservation = await tx.reservation.update({
      where: { id: reservationId },
      data: update,
      include: INCLUDE_FULL,
    });

    // ── Durable outbox writes — atomic with the reservation update ───────
    // Capacity hold events use IDs computed above in this transaction.
    if (confirmedHoldId && confirmedSpaceId) {
      await enqueueLedgerEvent(tx, {
        eventType: "CAPACITY_HOLD_CREATED",
        source: { system: "host_status_transition" },
        confidenceClass: "PARTNER_REPORTED_EVENT",
        idempotencyKey: `capacity_hold:${confirmedHoldId}:created`,
        capacityHoldId: confirmedHoldId,
        reservationId,
        payload: { spaceId: confirmedSpaceId, partySize: existing.partySize, overCapacity: confirmedOverCapacity },
      });
      if (confirmedOverCapacity) {
        await enqueueLedgerEvent(tx, {
          eventType: "CAPACITY_WARNING_SHOWN",
          source: { system: "host_status_transition" },
          confidenceClass: "PARTNER_REPORTED_EVENT",
          idempotencyKey: `capacity_hold:${confirmedHoldId}:warning`,
          capacityHoldId: confirmedHoldId,
          reservationId,
          payload: { spaceId: confirmedSpaceId, partySize: existing.partySize },
        });
      }
    }
    for (const holdId of releasedHoldIds) {
      await enqueueLedgerEvent(tx, {
        eventType: "CAPACITY_HOLD_RELEASED",
        source: { system: "host_status_transition" },
        confidenceClass: "PARTNER_REPORTED_EVENT",
        idempotencyKey: `capacity_hold:${holdId}:released`,
        capacityHoldId: holdId,
        reservationId,
        payload: { toStatus: holdReleaseStatus },
      });
    }

    // Status transition event — use statusLog.id for the idempotency key.
    const STATUS_TO_LEDGER_EVENT_TX: Partial<Record<ReservationStatus, string>> = {
      CONFIRMED:  "RESERVATION_CONFIRMED",
      CANCELLED:  "RESERVATION_CANCELLED",
      NO_SHOW:    "RESERVATION_NO_SHOW",
      ARRIVED:    "GUEST_ARRIVED",
      SEATED:     "GUEST_SEATED",
    };
    const ledgerEventTypeTx = STATUS_TO_LEDGER_EVENT_TX[toStatus];
    if (ledgerEventTypeTx) {
      const attrSessionId =
        (updatedReservation.attributionSession as { id: string } | null | undefined)?.id ?? null;
      await enqueueLedgerEvent(tx, {
        eventType: ledgerEventTypeTx as import("@prisma/client").LedgerEventType,
        source: { system: "host_ops", connector: null, recordId: null },
        confidenceClass: "PARTNER_REPORTED_EVENT",
        idempotencyKey: `reservation:${reservationId}:status_log:${statusLog.id}`,
        reservationId,
        attributionSessionId: attrSessionId,
        payload: {
          fromStatus: existing.status,
          toStatus,
          actorId,
          tableLabel: opts?.tableLabel ?? null,
          lossReason: opts?.lossReason ?? null,
        },
      });
    }

    return updatedReservation;
  });

  // ── Attribution session lifecycle on quick-action SEATED ─────────────
  // The formal check-in dialog (POST /api/v1/host/checkin) handles the
  // full mint-or-advance flow, but hosts also seat bookings via the
  // one-click status pill on the queue card, which routes through this
  // function. Without this hook, those seatings produce no
  // AttributionSession or TableSession, the host card later shows
  // "No attribution session — INVU bind unavailable", and the trust
  // chain for that booking is silently broken.
  //
  // Forward-only: if a CAPTURED/SEATED row already exists (QR pre-capture
  // or repeat seating), we advance via updateMany so a concurrent INVU
  // bind/match cannot be downgraded; if no row exists, we mint a fresh
  // one stamped HOST_CHECKIN/SEATED.
  if (toStatus === "SEATED" && !isReverse) {
    try {
      const existingSession = await prisma.attributionSession.findUnique({
        where: { reservationId },
        select: { id: true, status: true, tableSession: { select: { id: true } } },
      });

      if (existingSession) {
        await prisma.attributionSession.updateMany({
          where: {
            id: existingSession.id,
            status: { in: ["CAPTURED", "SEATED"] },
          },
          data: { status: "SEATED", seatedAt: now },
        });
        if (opts?.tableLabel) {
          await prisma.attributionSession.update({
            where: { id: existingSession.id },
            data: { tableLabel: opts.tableLabel },
          });
          if (existingSession.tableSession) {
            await prisma.tableSession.update({
              where: { id: existingSession.tableSession.id },
              data: { tableLabel: opts.tableLabel },
            });
          }
        }
      } else {
        const hostProfile = await prisma.restaurantHostProfile.findUnique({
          where: { userId: actorId },
          select: { id: true },
        });
        await createAttributionSession({
          kind: "RESERVATION",
          source: "HOST_CHECKIN",
          initialStatus: "SEATED",
          venueId: existing.venueId,
          reservationId,
          tableLabel: opts?.tableLabel ?? reservation.assignedTableLabel ?? null,
          zoneId: reservation.zoneId ?? null,
          hostUserId: actorId,
          hostProfileId: hostProfile?.id ?? reservation.assignedRestaurantHostId ?? null,
          createdByUserId: actorId,
        });
      }

      // ── Commission-attribution chain for the assigned host ─────────────
      // The AttributionSession exists by the time we get here (mint above
      // OR pre-existing). Now ensure its referralActorId / legacyReferrerId
      // reflect the host who just took ownership of this booking — that is
      // what makes the "REFERRED BY" line populate in the host card AND
      // makes the close-of-sale referrer commission flow to the right
      // earner. For host-link-only referrers (no legacy Referrer row),
      // only the AttributionSession is updated; for hosts with a legacy
      // Referrer, a backfill ReservationAttribution row is also created
      // so the legacy reports keep working.
      const finalHostProfileId =
        (update.assignedRestaurantHostId as string | undefined) ??
        reservation.assignedRestaurantHostId ??
        null;
      if (finalHostProfileId) {
        await ensureHostAttributionForReservation(reservationId, finalHostProfileId);
      }
    } catch (sessionErr) {
      // Never fail the seating because of an attribution-session hiccup —
      // the reservation row is already SEATED, the host can re-trigger
      // (or the formal check-in flow can heal it). Loud log so ops sees it.
      console.error(
        "[transitionStatus] failed to mint/advance AttributionSession on SEATED",
        { reservationId, err: sessionErr }
      );
    }
  }

  if (existing.handoffs.length > 0 || toStatus === "SEATED") {
    // Includes mappings for the early/backward statuses (PENDING, CONFIRMED,
    // WAITLISTED) so a host walking a booking back doesn't leave the
    // handoff pipeline stuck at a later stage than the reservation itself.
    const handoffMap: Record<string, string> = {
      PENDING: "PENDING",
      CONFIRMED: "PENDING",
      WAITLISTED: "PENDING",
      ACKNOWLEDGED: "ACKNOWLEDGED",
      ARRIVED: "GUEST_ARRIVED",
      SEATED: "SEATED",
      COMPLETED: "CLOSED",
      CANCELLED: "CANCELLED",
      NO_SHOW: "CLOSED",
    };
    const hStatus = handoffMap[toStatus];
    if (hStatus) {
      await prisma.reservationHandoff.updateMany({
        where: { reservationId },
        data: { handoffStatus: hStatus as never },
      });
    }
  }

  // Status transition and capacity hold ledger events are now written as
  // durable outbox rows inside the $transaction above. No post-transaction
  // best-effort emitLedgerEvent calls needed for these events.

  return reservation;
}

export async function getHostAnalytics(venueId: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const reservations = await prisma.reservation.findMany({
    where: { venueId, createdAt: { gte: since } },
    include: {
      attributions: { include: { referrer: true } },
      statusLogs: { orderBy: { changedAt: "asc" } },
    },
  });

  const total = reservations.length;
  const byStatus = {
    pending: reservations.filter(r => r.status === "PENDING").length,
    acknowledged: reservations.filter(r => r.status === "ACKNOWLEDGED").length,
    arrived: reservations.filter(r => r.status === "ARRIVED").length,
    seated: reservations.filter(r => r.status === "SEATED").length,
    completed: reservations.filter(r => r.status === "COMPLETED").length,
    noShow: reservations.filter(r => r.status === "NO_SHOW").length,
    cancelled: reservations.filter(r => r.status === "CANCELLED").length,
    waitlisted: reservations.filter(r => r.status === "WAITLISTED").length,
  };

  const converted = byStatus.seated + byStatus.completed;
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  const bySource: Record<string, number> = {};
  for (const r of reservations) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  }

  const lossReasons: Record<string, number> = {};
  for (const r of reservations) {
    const lossLog = r.statusLogs.find(l => l.lossReason);
    if (lossLog?.lossReason) {
      lossReasons[lossLog.lossReason] = (lossReasons[lossLog.lossReason] ?? 0) + 1;
    }
  }

  const avgWaitMs = (() => {
    const waits: number[] = [];
    for (const r of reservations) {
      if (r.arrivalConfirmedAt && r.seatedAt) {
        waits.push(r.seatedAt.getTime() - r.arrivalConfirmedAt.getTime());
      }
    }
    if (!waits.length) return null;
    return Math.round(waits.reduce((a, b) => a + b, 0) / waits.length / 60000);
  })();

  return {
    total,
    byStatus,
    conversionRate,
    bySource,
    lossReasons,
    avgWaitMinutes: avgWaitMs,
    period: days,
  };
}

export async function getMyStreetsideBookings(userId: string) {
  return prisma.reservation.findMany({
    where: { source: "STREETSIDE_HOST", sourceContext: userId },
    include: {
      handoffs: { orderBy: { createdAt: "desc" }, take: 1 },
      zone: true,
      // Surface attribution lifecycle + the resolved referrer (3-tier:
      // host → referralActor → legacyReferrer) so the streetside list can
      // show the same "who earned this" chip the Operations Board uses.
      attributionSession: {
        select: {
          id: true,
          bookingCode: true,
          status: true,
          source: true,
          seatedAt: true,
          boundAt: true,
          verifiedAt: true,
          invuOrderId: true,
          bindMethod: true,
          referralActor: { select: { id: true, displayName: true, actorType: true } },
          legacyReferrer: { select: { id: true, fullName: true, referralCode: true } },
          tableSession: {
            select: {
              id: true,
              openedInvuOrderId: true,
              invuReferenceField: true,
              invuReferenceWritten: true,
              syncStatus: true,
              matchStatus: true,
            },
          },
          bindings: {
            select: { id: true, invuOrderId: true, bindingType: true, createdAt: true },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
