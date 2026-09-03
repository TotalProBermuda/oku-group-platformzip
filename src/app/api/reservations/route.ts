import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttributionSession } from "@/server/services/invu/identityService";
import { resolveActorFromCode } from "@/server/referrals/referralActorService";
import { deliverReservationStateEmail } from "@/server/reservations/reservationNotificationService";
import { gatePublicPostAsync } from "@/server/rateLimit";
import { enqueueLedgerEvent } from "@/server/services/ledger/ledgerOutboxService";
import { DEFAULT_DURATION_MINUTES, FAR_FUTURE_EXPIRY } from "@/server/spaces/capacityService";
import { findBlockingOccupancy } from "@/server/events/eventOccupancyService";

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

export async function POST(req: NextRequest) {
  try {
    // .catch keeps malformed JSON from bypassing the gate via the outer try/catch.
    const body = await req.json().catch(() => ({}));

    const gate = await gatePublicPostAsync(req, body, "reservations", {
      limit: 10,
      windowMs: 60_000,
      botSuccessBody: { success: true, confirmationCode: "PENDING", reservationId: "pending" },
    });
    if (!gate.ok) return gate.response as NextResponse;

    const { conceptKey, reservationDate, partySize, occasion, seatingPreference, notes, addons, contactName, contactEmail, contactPhone, referralCode, requestedSpaceId, source, locale } = body;

    if (!contactName || !contactEmail || !conceptKey || !reservationDate || !partySize) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    // ── partySize validation ──────────────────────────────────────────────────
    // Must be a finite positive integer. Negative or fractional values corrupt
    // capacity arithmetic (a negative partySize makes any space appear to have
    // MORE available covers) and would create invalid CapacityHold rows.
    const parsedPartySize = Number(partySize);
    if (!Number.isFinite(parsedPartySize) || !Number.isInteger(parsedPartySize) || parsedPartySize < 1 || parsedPartySize > 100) {
      return NextResponse.json(
        { error: "partySize must be a whole number between 1 and 100.", code: "INVALID_PARTY_SIZE" },
        { status: 400 }
      );
    }

    // ── Source whitelisting ───────────────────────────────────────────────────
    // Client sends "QR_SCAN" for the /r/[referralCode] flow. Map it to the
    // QR_CODE enum value; REFERRER_LINK has no direct enum match → UMBRELLA_SITE.
    const SOURCE_MAP: Record<string, string> = {
      QR_SCAN: "QR_CODE",
      QR_CODE: "QR_CODE",
      UMBRELLA_SITE: "UMBRELLA_SITE",
      REFERRER_LINK: "UMBRELLA_SITE",
    };
    const persistedSource = (SOURCE_MAP[source as string] ?? "UMBRELLA_SITE") as import("@prisma/client").ReservationSource;

    const venue = await prisma.venue.findFirst({ where: { slug: "gold-house" } });
    if (!venue) return NextResponse.json({ error: "Venue not found." }, { status: 500 });

    const zone = await prisma.zone.findFirst({ where: { venueId: venue.id, conceptKey } });

    // ── requestedSpaceId server-side validation ───────────────────────────────
    // Verify the space belongs to this venue and is active + reservable.
    // A forged, out-of-venue, inactive, or non-reservable ID is rejected 400.
    const requestedSpace = requestedSpaceId
      ? await prisma.restaurantSpace.findFirst({
          where: { id: requestedSpaceId, venueId: venue.id, isActive: true, reservable: true },
          select: { requiresApproval: true },
        })
      : null;

    if (requestedSpaceId && !requestedSpace) {
      return NextResponse.json(
        { error: "The selected space is not available for this venue.", code: "SPACE_INVALID" },
        { status: 400 }
      );
    }

    // "No preference — host will assign" is also an approval workflow. It
    // cannot be CONFIRMED without a space/hold and then depend on a host fixing
    // it later. The host must choose the final space, time and table plan first.
    let pendingApproval = requestedSpace ? requestedSpace.requiresApproval : true;

    // Every request has a window. No-preference requests may wait for host
    // assignment, but must still honour a venue-wide exclusive event block.
    const reservationStartAt = new Date(reservationDate);
    const reservationEndAt = new Date(reservationStartAt.getTime() + DEFAULT_DURATION_MINUTES * 60_000);

    let confirmationCode = genCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.reservation.findUnique({ where: { confirmationCode } });
      if (!existing) break;
      confirmationCode = genCode();
      attempts++;
    }

    // Find or create guest profile
    let guestProfile = await prisma.resGuestProfile.findFirst({ where: { email: contactEmail } });
    if (!guestProfile) {
      guestProfile = await prisma.resGuestProfile.create({
        data: { fullName: contactName, email: contactEmail, phone: contactPhone ?? null, preferredConceptKey: conceptKey },
      });
    }

    // ── Atomic reservation + capacity hold ───────────────────────────────────
    // All writes — advisory lock, capacity check, reservation row, CapacityHold,
    // and ledger outbox rows — commit in a single transaction so concurrent
    // requests for the same space are serialized at the DB level (advisory lock
    // on the space id) and nothing is written when capacity is exceeded.
    //
    // Hold creation policy:
    //   CONFIRMED  + requestedSpaceId → create ACTIVE CapacityHold + durable
    //     CAPACITY_HOLD_CREATED outbox row, all atomically in the transaction.
    //   PENDING_APPROVAL + requestedSpaceId → NO hold yet; the host flow creates
    //     the hold when the booking is accepted/assigned.
    //   No requestedSpaceId → no hold; host assignment creates the hold later.
    let reservation: Awaited<ReturnType<typeof prisma.reservation.create>>;
    let requestEventConflict: Awaited<ReturnType<typeof findBlockingOccupancy>> = null;
    // Payments P215 — set inside the transaction if a deposit intent is created.
    let reservationPaymentIntentId: string | null = null;
    let reservationDepositAmountCents: number | null = null;
    try {
      reservation = await prisma.$transaction(async (tx) => {
        // ── Step 1: advisory lock + capacity check (space requests only) ─────
        // Acquire a PostgreSQL advisory lock on the target space so concurrent
        // requests for the same space are serialized. This prevents write-skew
        // where two simultaneous submissions both pass getAvailableCovers() and
        // both create CONFIRMED reservations for an already-full space.
        // Lock category 2 matches the convention in capacityService.assignSpace.
        let depositCents = 0; // Payments P215 — set when space has depositRequiredCents > 0
        if (requestedSpaceId) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${requestedSpaceId}))`;

          // Event occupancy is advisory at the guest-request stage. Persist the
          // request for human review, but never auto-confirm or charge/hold the
          // blocked section. The host confirmation flow remains the hard
          // operational boundary and must assign an available space.
          requestEventConflict = await findBlockingOccupancy(tx, {
            venueId: venue.id,
            spaceId: requestedSpaceId,
            startAt: reservationStartAt,
            endAt: reservationEndAt,
            locale: typeof locale === "string" ? locale : "en",
          });
          if (requestEventConflict) pendingApproval = true;

          // Re-read capacity under the lock. We sum ACTIVE holds that overlap our
          // window — identical overlap logic to getHeldCovers() in capacityService.
          const competingHolds = await tx.capacityHold.findMany({
            where: {
              spaceId: requestedSpaceId,
              status: "ACTIVE",
              expiresAt: { gt: new Date() },
              startAt: { lt: reservationEndAt },
              endAt:   { gt: reservationStartAt },
            },
            select: { partySize: true },
          });
          const heldCovers = competingHolds.reduce((s, h) => s + h.partySize, 0);
          const spaceRow = await tx.restaurantSpace.findUnique({
            where: { id: requestedSpaceId },
            select: { capacity: true, depositRequiredCents: true },
          });
          depositCents = spaceRow?.depositRequiredCents ?? 0;
          const available = (spaceRow?.capacity ?? 0) - heldCovers;

          if (available < parsedPartySize && !pendingApproval) {
            // Non-approval space is full — abort the transaction.
            // Sentinel string is caught below and converted to a 409 response.
            throw new Error("__SPACE_FULL__");
          }
          // requiresApproval + full → fall through; booking becomes PENDING_APPROVAL.
        } else {
          requestEventConflict = await findBlockingOccupancy(tx, {
            venueId: venue.id,
            startAt: reservationStartAt,
            endAt: reservationEndAt,
            locale: typeof locale === "string" ? locale : "en",
          });
          if (requestEventConflict) pendingApproval = true;
        }

        // Payments P215 — when the space requires a deposit, the reservation
        // starts in PENDING_PAYMENT. It advances to CONFIRMED (or PENDING_APPROVAL
        // for requiresApproval spaces) only after the payment is authorized.
        // Never collect a deposit for a section already known to require event
        // conflict review. Payment can follow after staff offers a viable plan.
        const depositRequired = depositCents > 0 && !requestEventConflict;

        // ── Step 2: create reservation ────────────────────────────────────────
        const res = await tx.reservation.create({
          data: {
            venueId: venue.id,
            zoneId: zone?.id ?? null,
            guestProfileId: guestProfile.id,
            source: persistedSource,
            // Deposit-required reservations start PENDING_PAYMENT; spaces that
            // require host approval start PENDING_APPROVAL; all others go straight
            // to CONFIRMED (host can still override later).
            status: (depositRequired ? "PENDING_PAYMENT" : pendingApproval ? "PENDING_APPROVAL" : "CONFIRMED") as import("@prisma/client").ReservationStatus,
            reservationDate: new Date(reservationDate),
            partySize: parsedPartySize,
            conceptRequested: conceptKey,
            occasion: occasion || null,
            seatingPreference: seatingPreference || null,
            notes: notes || null,
            contactName,
            contactEmail,
            contactPhone: contactPhone || null,
            confirmationCode,
            requestedSpaceId: requestedSpaceId || null,
            estimatedRevenueCents: parsedPartySize * 4500,
            addons: addons?.length
              ? {
                  create: (addons as string[]).map((key: string) => ({
                    addonType: key as any,
                    label: key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()),
                  })),
                }
              : undefined,
          },
        });

        if (requestEventConflict) {
          await tx.eventReservationConflict.create({
            data: {
              occupancyId: requestEventConflict.occupancy.id,
              reservationId: res.id,
              note: "Guest submitted the request after viewing the event notice; host follow-up required.",
            },
          });
        }

        // ── Step 3: ledger outbox rows ────────────────────────────────────────
        // RESERVATION_REQUESTED — always, for every new reservation.
        await enqueueLedgerEvent(tx, {
          eventType: "RESERVATION_REQUESTED",
          source: { system: "reservations_api", connector: null, recordId: null },
          confidenceClass: "CUSTOMER_CLAIMED_EVENT",
          idempotencyKey: `reservation:${res.id}:status:REQUESTED`,
          reservationId: res.id,
          payload: { confirmationCode, partySize: parsedPartySize, conceptKey, referralCode: referralCode ?? null },
        });
        // RESERVATION_CONFIRMED — only when the reservation lands in CONFIRMED
        // immediately. PENDING_APPROVAL reservations do NOT get a CONFIRMED
        // outbox row here; that event is emitted when the host explicitly
        // approves the booking (a separate status-transition flow).
        if (res.status === "CONFIRMED") {
          await enqueueLedgerEvent(tx, {
            eventType: "RESERVATION_CONFIRMED",
            source: { system: "reservations_api", connector: null, recordId: null },
            confidenceClass: "CUSTOMER_CLAIMED_EVENT",
            idempotencyKey: `reservation:${res.id}:status:CONFIRMED`,
            reservationId: res.id,
            payload: { confirmationCode, partySize: parsedPartySize, conceptKey },
          });
        }

        // ── Step 4 (P215): create PaymentIntent when deposit is required ─────
        // Atomically create the PaymentIntent in the same transaction so the
        // reservation row and its associated intent always commit together or
        // not at all. Attribution context is NOT yet available at this point
        // (it is resolved below after the tx commits) — it is written to the
        // intent by the payment confirm endpoint via updateAttributionSession.
        if (depositRequired) {
          const depositIntent = await tx.paymentIntent.create({
            data: {
              reservationId: res.id,
              amountCents: depositCents,
              currency: "USD",
              idempotencyKey: `deposit:${res.id}`,
              status: "CREATED",
              provider: "CYBERSOURCE",
              orderType: "RESERVATION_DEPOSIT",
            },
            select: { id: true },
          });
          // Surface intent ID to the outer closure so the response can include it
          reservationPaymentIntentId = depositIntent.id;
          reservationDepositAmountCents = depositCents;
        }

        // ── Step 5: create CapacityHold + durable ledger event (CONFIRMED + space only) ──
        // All three writes — reservation, hold, and the CAPACITY_HOLD_CREATED
        // outbox row — commit atomically. If any write fails nothing is persisted,
        // consistent with the #186 durable-outbox pattern used for
        // RESERVATION_REQUESTED and RESERVATION_CONFIRMED above.
        // PENDING_APPROVAL and PENDING_PAYMENT reservations deliberately have no
        // hold here; the hold is created when the booking transitions to CONFIRMED.
        if (res.status === "CONFIRMED" && requestedSpaceId && reservationStartAt && reservationEndAt) {
          const hold = await tx.capacityHold.create({
            data: {
              spaceId: requestedSpaceId,
              reservationId: res.id,
              startAt: reservationStartAt,
              endAt: reservationEndAt,
              partySize: parsedPartySize,
              status: "ACTIVE",
              // Confirmed holds are never expired by the time-based sweep.
              // They are released only when the reservation reaches a terminal
              // state (CANCELLED, NO_SHOW, COMPLETED) via releaseCapacityHolds.
              expiresAt: FAR_FUTURE_EXPIRY,
            },
          });
          // CAPACITY_HOLD_CREATED — enqueued inside the same transaction so the
          // proof event is durable and atomic with the hold write.
          await enqueueLedgerEvent(tx, {
            eventType: "CAPACITY_HOLD_CREATED",
            source: { system: "reservations_api", connector: null, recordId: null },
            confidenceClass: "PARTNER_REPORTED_EVENT",
            idempotencyKey: `capacity_hold:${hold.id}:created`,
            capacityHoldId: hold.id,
            reservationId: res.id,
            payload: {
              spaceId: requestedSpaceId,
              partySize: parsedPartySize,
              startAt: reservationStartAt.toISOString(),
              endAt:   reservationEndAt.toISOString(),
            },
          });
        }

        return res;
      }, { timeout: 10_000 });
    } catch (txErr: unknown) {
      if (txErr instanceof Error && txErr.message === "__SPACE_FULL__") {
        return NextResponse.json(
          { error: "This space is at full capacity for the selected time.", code: "SPACE_FULL" },
          { status: 409 }
        );
      }
      throw txErr;
    }

    // Track whether the referral branch successfully opened an
    // AttributionSession. If it didn't (no referralCode and code didn't
    // resolve to any actor), we open a DIRECT session below.
    // INVARIANT: DIRECT is ONLY written for genuinely un-referred bookings.
    // Any failure that occurs AFTER resolveActorFromCode returns a non-null
    // result MUST produce a PENDING_ATTRIBUTION session — never DIRECT — so
    // the referrer's commission context is never silently discarded.
    let attributionSessionOpened = false;
    // Set to true when resolveActorFromCode returns a non-null result.
    // Used by the DIRECT guard below: DIRECT must never be written when a
    // referrer was successfully identified, even if all session writes fail.
    let referralContextKnown = false;

    if (referralCode) {
      // ── Step 1: resolve the referrer context (isolated catch) ────────────
      // If the resolver throws we truly don't know who referred this guest
      // and can legitimately fall through to DIRECT. Any subsequent failure
      // (legacy writes, session creation) happens with `resolved` in-hand
      // and MUST NOT reach this outer try — those are handled inside.
      let resolved: Awaited<ReturnType<typeof resolveActorFromCode>> = null;
      try {
        resolved = await resolveActorFromCode(referralCode.toUpperCase());
      } catch (resolverErr) {
        console.error(
          "[POST /api/reservations] resolveActorFromCode threw; attribution context unknown",
          { reservationId: reservation.id, referralCode, err: resolverErr }
        );
      }

      if (!resolved) {
        // Code did not resolve to any actor (or resolver threw). Log and
        // fall through to the DIRECT fallback below.
        console.warn(
          "[POST /api/reservations] referralCode did not resolve to any actor; attribution will not be recorded",
          {
            reservationId: reservation.id,
            rawReferralCode: referralCode,
            normalizedReferralCode: referralCode.toUpperCase(),
          }
        );
      }

      if (resolved) {
        referralContextKnown = true;
        const referralLinkId = "linkId" in resolved ? (resolved.linkId ?? null) : null;

        // ── Step 2: write PENDING_ATTRIBUTION first (single session create) ──
        // AttributionSession.reservationId is globally unique (@unique).
        // Writing PENDING first and then promoting to ANCHORED via update
        // guarantees exactly one session row even when a network timeout makes
        // the first response ambiguous. Creating ANCHORED then falling back to
        // PENDING as a second create would hit P2002 on the unique constraint
        // whenever the first write committed before the timeout was reported.
        let pendingSession: { attributionSessionId: string } | null = null;
        try {
          pendingSession = await createAttributionSession({
            kind: "RESERVATION",
            source: "QR_RESERVATION",
            initialStatus: "CAPTURED",
            venueId: venue.id,
            reservationId: reservation.id,
            zoneId: zone?.id ?? null,
            referralActorId: resolved.referralActorId ?? null,
            legacyReferrerId: resolved.legacyReferrerId ?? null,
            referralLinkId,
            anchorStatus: "PENDING_ATTRIBUTION",
            anchorLastError: "Anchor writes in progress",
          });
          attributionSessionOpened = true;
        } catch (createErr) {
          // Session create failed. Log critical — we cannot write DIRECT
          // because the referrer IS known. The booking is committed; the sweep
          // will find this reservation has no session and alert ops.
          console.error(
            "[POST /api/reservations] CRITICAL: could not create PENDING_ATTRIBUTION session; referrer context lost for booking",
            { reservationId: reservation.id, referralCode, err: createErr }
          );
        }

        if (pendingSession) {
          // ── Step 3: attempt legacy writes and promote to ANCHORED ──────────
          // All writes use upsert / P2002-catch so they are safe to retry.
          // If any write fails the session stays PENDING_ATTRIBUTION and the
          // retry worker (or sweep) will complete the writes later.
          let legacyWriteError: string | null = null;
          if (resolved.legacyReferrerId) {
            try {
              const legacyReferrer = await prisma.referrer.findUnique({
                where: { id: resolved.legacyReferrerId },
                select: { compensationPlanId: true },
              });
              // Idempotent via partial unique index on (reservationId, referrerId)
              // WHERE referrerId IS NOT NULL; P2002 means the row already exists.
              try {
                await prisma.reservationAttribution.create({
                  data: {
                    reservationId: reservation.id,
                    referrerId: resolved.legacyReferrerId,
                    sourceType: "UMBRELLA_SITE",
                    commissionEligible: true,
                    conversionStage: "REFERRED_UPSTAIRS",
                  },
                });
              } catch (e: unknown) {
                if ((e as { code?: string }).code !== "P2002") throw e;
              }
              // Idempotent via @@unique([reservationId, referrerId]).
              await prisma.commissionSuggestion.upsert({
                where: {
                  reservationId_referrerId: {
                    reservationId: reservation.id,
                    referrerId: resolved.legacyReferrerId,
                  },
                },
                create: {
                  reservationId: reservation.id,
                  referrerId: resolved.legacyReferrerId,
                  compensationPlanId: legacyReferrer?.compensationPlanId ?? null,
                  suggestedAmountCents: parsedPartySize * 250,
                  status: "SUGGESTED",
                  rationaleJson: { partySize, conceptKey, flatPerCover: 250 },
                },
                update: {},
              });
            } catch (legacyErr) {
              legacyWriteError = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
              console.error(
                "[POST /api/reservations] legacy attribution/suggestion write failed; session will stay PENDING",
                { reservationId: reservation.id, referralCode, err: legacyErr }
              );
            }
          }

          if (!legacyWriteError) {
            // ── All writes succeeded — promote to ANCHORED via update ────────
            // This is a plain update keyed by session ID; no unique constraint
            // risk because the row was already created in Step 2.
            try {
              const now = new Date();
              await prisma.attributionSession.update({
                where: { id: pendingSession.attributionSessionId },
                data: {
                  anchorStatus: "ANCHORED",
                  anchorLastError: null,
                  anchorLastAttemptAt: now,
                  anchorResolvedAt: now,
                },
              });
              try {
                const { emitLedgerEvent } = await import("@/server/services/ledger/ledgerEventService");
                await emitLedgerEvent({
                  eventType: "ATTRIBUTION_ANCHOR_RESOLVED",
                  source: { system: "reservations_api" },
                  confidenceClass: "PARTNER_REPORTED_EVENT",
                  idempotencyKey: `attribution_session:${pendingSession.attributionSessionId}:anchor_resolved`,
                  attributionSessionId: pendingSession.attributionSessionId,
                  reservationId: reservation.id,
                  payload: {
                    referralActorId: resolved.referralActorId ?? null,
                    legacyReferrerId: resolved.legacyReferrerId ?? null,
                    referralCode,
                  },
                });
              } catch (ledgerErr) {
                console.warn(
                  "[POST /api/reservations] anchor-resolved ledger event failed (non-blocking)",
                  { reservationId: reservation.id, err: ledgerErr }
                );
              }
            } catch (promoteErr) {
              // Update to ANCHORED failed — session stays PENDING. The retry
              // worker will re-run legacy writes (idempotent) and re-attempt
              // the promotion. No new session create is needed.
              console.error(
                "[POST /api/reservations] failed to promote session to ANCHORED; session stays PENDING",
                { reservationId: reservation.id, sessionId: pendingSession.attributionSessionId, err: promoteErr }
              );
            }
          } else {
            // ── Legacy writes failed — update error on PENDING session ────────
            // Session stays PENDING_ATTRIBUTION; update error field so ops /
            // the admin review surface can see why it's pending.
            try {
              await prisma.attributionSession.update({
                where: { id: pendingSession.attributionSessionId },
                data: { anchorLastError: legacyWriteError },
              });
            } catch { /* best-effort */ }
            // Enqueue a retry job; the sweep covers Redis-unavailable cases.
            try {
              const { attributionAnchorQueue } = await import("@/server/queue/queue");
              if (attributionAnchorQueue) {
                await attributionAnchorQueue.add(
                  "attribution_anchor_retry",
                  { attributionSessionId: pendingSession.attributionSessionId },
                  { attempts: 5, backoff: { type: "exponential", delay: 10_000 } }
                );
              }
            } catch (qErr) {
              console.warn("[POST /api/reservations] failed to enqueue anchor retry (sweep will pick up)", { err: qErr });
            }
            try {
              const { emitLedgerEvent } = await import("@/server/services/ledger/ledgerEventService");
              await emitLedgerEvent({
                eventType: "ATTRIBUTION_ANCHOR_PENDING",
                source: { system: "reservations_api" },
                confidenceClass: "MANUAL_REVIEW_EVENT",
                idempotencyKey: `attribution_session:${pendingSession.attributionSessionId}:anchor_pending`,
                attributionSessionId: pendingSession.attributionSessionId,
                reservationId: reservation.id,
                payload: {
                  referralActorId: resolved.referralActorId ?? null,
                  legacyReferrerId: resolved.legacyReferrerId ?? null,
                  referralCode,
                },
              });
            } catch (ledgerErr) {
              console.warn(
                "[POST /api/reservations] anchor-pending ledger event failed (non-blocking)",
                { reservationId: reservation.id, err: ledgerErr }
              );
            }
          }
        }
      }
    }

    // DIRECT-source session: written ONLY when no referrer context existed
    // (no referralCode, or the code did not resolve to any actor).
    // When a referrer WAS resolved but all session writes failed, we log
    // critical above and skip DIRECT — it must never override a known referrer.
    if (!attributionSessionOpened && !referralContextKnown) {
      try {
        await createAttributionSession({
          kind: "RESERVATION",
          source: "DIRECT",
          initialStatus: "CAPTURED",
          venueId: venue.id,
          reservationId: reservation.id,
          zoneId: zone?.id ?? null,
        });
      } catch (sessionErr) {
        console.error(
          "[POST /api/reservations] failed to open DIRECT AttributionSession",
          { reservationId: reservation.id, err: sessionErr }
        );
      }
    } else if (!attributionSessionOpened && referralContextKnown) {
      // Referrer was resolved but all session writes failed — log for ops.
      // We cannot write DIRECT; the booking has no AttributionSession.
      console.error(
        "[POST /api/reservations] CRITICAL: referrer was resolved but no AttributionSession could be written; booking has no session",
        { reservationId: reservation.id, referralCode }
      );
    }

    // Email copy follows the persisted state. Approval/payment requests get a
    // receipt that explicitly says they are not confirmed; only an actually
    // CONFIRMED reservation gets the arrival confirmation and code wording.
    try {
      const emailKind = reservation.status === "CONFIRMED" ? "CONFIRMATION" : "REQUEST_RECEIVED";
      const result = await deliverReservationStateEmail(reservation.id, emailKind);
      if (!("skipped" in result) || !result.skipped) {
        if ("sent" in result && !result.sent) {
          console.warn("[POST /api/reservations] reservation email not sent", {
            reservationId: reservation.id,
            emailKind,
            reason: result.reason,
          });
        }
      }
    } catch (emailErr) {
      console.error(
        "[POST /api/reservations] unexpected error sending reservation email",
        { reservationId: reservation.id, err: emailErr }
      );
    }

    // RESERVATION_REQUESTED and RESERVATION_CONFIRMED outbox rows were written
    // atomically inside the reservation creation $transaction above.

    return NextResponse.json({
      success: true,
      confirmationCode,
      reservationId: reservation.id,
      pendingApproval,
      eventNotice: requestEventConflict?.card ?? null,
      // Payments P215 — included when the space requires a deposit before confirmation
      ...(reservationPaymentIntentId != null
        ? {
            paymentRequired: true,
            paymentIntentId: reservationPaymentIntentId,
            depositAmountCents: reservationDepositAmountCents,
          }
        : { paymentRequired: false }),
    });
  } catch (err) {
    console.error("[POST /api/reservations]", err);
    return NextResponse.json({ error: "Failed to create reservation." }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const email = searchParams.get("email");

  if (code) {
    const res = await prisma.reservation.findUnique({
      where: { confirmationCode: code },
      include: { zone: true, addons: true },
    });
    if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(res);
  }

  if (email) {
    const reservations = await prisma.reservation.findMany({
      where: { contactEmail: email },
      include: { zone: true, addons: true },
      orderBy: { reservationDate: "desc" },
      take: 10,
    });
    return NextResponse.json(reservations);
  }

  return NextResponse.json({ error: "Provide code or email param" }, { status: 400 });
}
