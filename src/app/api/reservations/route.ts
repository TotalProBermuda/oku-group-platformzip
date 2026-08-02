import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAttributionSession } from "@/server/services/invu/identityService";
import { resolveActorFromCode } from "@/server/referrals/referralActorService";
import {
  sendReservationConfirmationEmail,
  buildReservationConfirmationSubject,
} from "@/server/reservations/confirmationEmail";
import { gatePublicPostAsync } from "@/server/rateLimit";
import { emitLedgerEvent } from "@/server/services/ledger/ledgerEventService";

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

    const { conceptKey, reservationDate, partySize, occasion, seatingPreference, notes, addons, contactName, contactEmail, contactPhone, referralCode, requestedSpaceId } = body;

    if (!contactName || !contactEmail || !conceptKey || !reservationDate || !partySize) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const venue = await prisma.venue.findFirst({ where: { slug: "gold-house" } });
    if (!venue) return NextResponse.json({ error: "Venue not found." }, { status: 500 });

    const zone = await prisma.zone.findFirst({ where: { venueId: venue.id, conceptKey } });

    // If a specific space was requested, look up its requiresApproval flag so we
    // can gate the reservation at PENDING_APPROVAL rather than CONFIRMED.
    const requestedSpace = requestedSpaceId
      ? await prisma.restaurantSpace.findUnique({
          where: { id: requestedSpaceId },
          select: { requiresApproval: true },
        })
      : null;
    const pendingApproval = requestedSpace?.requiresApproval ?? false;

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

    const reservation = await prisma.reservation.create({
      data: {
        venueId: venue.id,
        zoneId: zone?.id ?? null,
        guestProfileId: guestProfile.id,
        source: "UMBRELLA_SITE",
        // Spaces that require host approval start in PENDING_APPROVAL;
        // all others go straight to CONFIRMED (host can still override later).
        status: pendingApproval ? "PENDING_APPROVAL" : "CONFIRMED",
        reservationDate: new Date(reservationDate),
        partySize: Number(partySize),
        conceptRequested: conceptKey,
        occasion: occasion || null,
        seatingPreference: seatingPreference || null,
        notes: notes || null,
        contactName,
        contactEmail,
        contactPhone: contactPhone || null,
        confirmationCode,
        requestedSpaceId: requestedSpaceId || null,
        estimatedRevenueCents: Number(partySize) * 4500,
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
                  suggestedAmountCents: Number(partySize) * 250,
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

    // Log confirmation communication, then attempt to actually send it.
    // We persist a PENDING row up front so that even if the Resend call
    // throws or the process dies mid-send, the booking still has an
    // audit trail of "we owed this guest an email" — ops can replay it
    // later from the admin queue.
    const subjectLine = buildReservationConfirmationSubject({
      venueName: venue.name,
      confirmationCode,
    });
    const commRow = await prisma.reservationCommunication.create({
      data: {
        reservationId: reservation.id,
        type: "EMAIL",
        templateKey: "CONFIRMATION",
        recipient: contactEmail,
        subject: subjectLine,
        status: "PENDING",
      },
    });

    // Send-and-forget: do NOT block the booking response on the email
    // round-trip. The diner already has their confirmation code in the
    // JSON response below; the email is a courtesy, and Resend has its
    // own retry logic. We still await long enough to update the comm
    // row's terminal status before returning so the admin queue is
    // accurate when the page reloads.
    try {
      const result = await sendReservationConfirmationEmail({
        contactName,
        contactEmail,
        confirmationCode,
        reservationDate: reservation.reservationDate,
        partySize: reservation.partySize,
        venueName: venue.name,
        venueCity: venue.city,
        zoneName: zone?.name ?? null,
        occasion: reservation.occasion,
        seatingPreference: reservation.seatingPreference,
        notes: reservation.notes,
        addons: ((addons as string[] | undefined) ?? []).map((key) => ({
          label: key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
        })),
      });
      await prisma.reservationCommunication.update({
        where: { id: commRow.id },
        data: {
          status: result.sent ? "SENT" : "FAILED",
          sentAt: result.sent ? new Date() : null,
          bodySnapshot: result.bodySnapshot,
        },
      });
      if (!result.sent) {
        console.warn(
          "[POST /api/reservations] confirmation email not sent",
          { reservationId: reservation.id, reason: result.reason }
        );
      }
    } catch (emailErr) {
      // Defensive: even sendReservationConfirmationEmail's own error
      // wrapping could be bypassed by an unexpected throw. Don't fail
      // the booking — just mark the comm row failed and log.
      await prisma.reservationCommunication.update({
        where: { id: commRow.id },
        data: { status: "FAILED" },
      }).catch(() => null);
      console.error(
        "[POST /api/reservations] unexpected error sending confirmation email",
        { reservationId: reservation.id, err: emailErr }
      );
    }

    // Emit canonical ledger events for the new reservation.
    // RESERVATION_REQUESTED fires unconditionally (it was requested and
    // accepted). RESERVATION_CONFIRMED fires because reservations created
    // through this public endpoint are always given status=CONFIRMED.
    // Both are CUSTOMER_CLAIMED_EVENT — the only evidence at this point is
    // the guest's self-reported form submission. Best-effort: failures here
    // must never block the booking response.
    try {
      await emitLedgerEvent({
        eventType: "RESERVATION_REQUESTED",
        source: { system: "reservations_api", connector: null, recordId: null },
        confidenceClass: "CUSTOMER_CLAIMED_EVENT",
        idempotencyKey: `reservation:${reservation.id}:status:REQUESTED`,
        reservationId: reservation.id,
        payload: { confirmationCode, partySize: Number(partySize), conceptKey, referralCode: referralCode ?? null },
      });
      await emitLedgerEvent({
        eventType: "RESERVATION_CONFIRMED",
        source: { system: "reservations_api", connector: null, recordId: null },
        confidenceClass: "CUSTOMER_CLAIMED_EVENT",
        idempotencyKey: `reservation:${reservation.id}:status:CONFIRMED`,
        reservationId: reservation.id,
        payload: { confirmationCode, partySize: Number(partySize), conceptKey },
      });
    } catch (emitErr) {
      console.error(
        "[POST /api/reservations] emitLedgerEvent failed (non-blocking)",
        { reservationId: reservation.id, err: emitErr }
      );
    }

    return NextResponse.json({ success: true, confirmationCode, reservationId: reservation.id, pendingApproval });
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
