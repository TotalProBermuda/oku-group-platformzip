/**
 * POST /api/reservations/[id]/payment/confirm
 *
 * Completes the payment step for a reservation that was created in
 * PENDING_PAYMENT status (because the requested space requires a deposit).
 *
 * Security:
 *   - `confirmationCode` (from the booking confirmation email/SMS) is required
 *     and must match the reservation record — this is the guest's proof of
 *     identity without requiring a full login.
 *   - Only Cybersource transient tokens are accepted. Raw card data is
 *     never processed by this server.
 *
 * Concurrency safety:
 *   - A capacity pre-check (with the same advisory lock used in the initial
 *     reservation transaction) runs BEFORE the Cybersource call so that a
 *     full space is rejected without incurring an authorization.
 *   - The post-auth transaction re-acquires the advisory lock and re-checks
 *     capacity to close the window between pre-check and hold creation.
 *   - If the space fills in that window, the authorization is voided
 *     OUTSIDE the rolled-back transaction.
 *   - If the intent is already AUTHORIZED (from a prior successful call
 *     whose response was lost), the confirm endpoint skips re-authorization
 *     and proceeds straight to hold creation — making it retry-safe.
 *
 * Flow:
 *   1. Validate confirmationCode matches the reservation.
 *   2. Assert reservation is PENDING_PAYMENT.
 *   3. Find the linked PaymentIntent.
 *   4. Pre-check space capacity under advisory lock.
 *   5. Authorize via Cybersource (or skip if already AUTHORIZED).
 *   6. In a $transaction:
 *        a. Link AttributionSession → PaymentIntent.
 *        b. Re-acquire advisory lock + re-check capacity.
 *        c. Advance reservation to CONFIRMED or PENDING_APPROVAL.
 *        d. If CONFIRMED: create CapacityHold + emit ledger events.
 *   7. On post-auth space-full: void the authorization, return 409.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  authorizePayment,
  voidPayment,
} from "@/server/payments/reservationPaymentService";
import { enqueueLedgerEvent } from "@/server/services/ledger/ledgerOutboxService";
import {
  DEFAULT_DURATION_MINUTES,
  FAR_FUTURE_EXPIRY,
} from "@/server/spaces/capacityService";

const Body = z.object({
  paymentIntentId: z.string(),
  /**
   * The booking confirmation code sent to the guest after reservation.
   * Required as proof the caller is the original booker — prevents a third
   * party who knows only the reservationId from triggering a payment.
   */
  confirmationCode: z.string(),
  /**
   * Transient JWT from Cybersource Flex / Unified Checkout.
   * This is the ONLY accepted payment credential — raw card numbers,
   * expiry dates, and CVV codes must never transit the OKÜ server.
   */
  transientToken: z.string(),
  customerEmail: z.string().email().optional(),
  billing: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      address1: z.string().optional(),
      locality: z.string().optional(),
      administrativeArea: z.string().optional(),
      postalCode: z.string().optional(),
      country: z.string().optional(),
    })
    .optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: reservationId } = await params;
    const body = Body.parse(await req.json());

    // ── Load reservation ───────────────────────────────────────────────────────
    const reservation = await prisma.reservation.findUnique({
      where: { id: reservationId },
      include: {
        requestedSpace: { select: { requiresApproval: true } },
      },
    });
    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    // ── Guest identity check (confirmationCode) ────────────────────────────────
    if (reservation.confirmationCode !== body.confirmationCode) {
      return NextResponse.json(
        { error: "Invalid confirmation code.", code: "INVALID_CONFIRMATION_CODE" },
        { status: 403 },
      );
    }

    // ── Status guard ───────────────────────────────────────────────────────────
    if (reservation.status !== "PENDING_PAYMENT") {
      return NextResponse.json(
        {
          error: `Reservation is in status ${reservation.status}, not PENDING_PAYMENT.`,
          code: "WRONG_STATUS",
        },
        { status: 409 },
      );
    }

    // ── Find linked PaymentIntent ──────────────────────────────────────────────
    const intent = await prisma.paymentIntent.findFirst({
      where: {
        reservationId,
        status: { notIn: ["CAPTURED", "CANCELLED", "REFUNDED"] },
      },
    });
    if (!intent) {
      return NextResponse.json(
        { error: "No active payment intent found for this reservation." },
        { status: 404 },
      );
    }
    if (intent.id !== body.paymentIntentId) {
      return NextResponse.json(
        { error: "paymentIntentId does not match the active intent for this reservation." },
        { status: 400 },
      );
    }

    const requiresApproval = reservation.requestedSpace?.requiresApproval ?? false;
    const nextStatus = requiresApproval ? "PENDING_APPROVAL" : "CONFIRMED";
    const spaceId = reservation.requestedSpaceId;
    const startAt = reservation.reservationDate;
    const endAt = new Date(
      startAt.getTime() +
        (reservation.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000,
    );

    // ── Step 1: Pre-auth capacity check (under advisory lock) ─────────────────
    // Reject fast if the space is already full, before touching Cybersource.
    // This covers the common case; a second check runs post-auth to close the
    // narrow race window between this transaction's commit and the hold write.
    if (spaceId) {
      const spaceAvailable = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${spaceId}))`;
        const competingHolds = await tx.capacityHold.findMany({
          where: {
            spaceId,
            status: "ACTIVE",
            expiresAt: { gt: new Date() },
            startAt: { lt: endAt },
            endAt:   { gt: startAt },
          },
          select: { partySize: true },
        });
        const heldCovers = competingHolds.reduce((s, h) => s + h.partySize, 0);
        const spaceRow = await tx.restaurantSpace.findUnique({
          where: { id: spaceId },
          select: { capacity: true },
        });
        const available = (spaceRow?.capacity ?? 0) - heldCovers;
        // requiresApproval spaces bypass capacity — they queue for host review
        return available >= reservation.partySize || requiresApproval;
      });

      if (!spaceAvailable) {
        return NextResponse.json(
          { error: "This space is at full capacity for the selected time.", code: "SPACE_FULL" },
          { status: 409 },
        );
      }
    }

    // ── Step 2: Authorize (or confirm already-authorized intent) ───────────────
    // Idempotency: if the intent is already AUTHORIZED (previous confirm call
    // succeeded but the response was dropped), skip the Cybersource call.
    let authTransactionId: string | null = intent.cybersourceTransactionId;

    if (intent.status !== "AUTHORIZED") {
      const authResult = await authorizePayment({
        paymentIntentId: intent.id,
        transientToken: body.transientToken,
        customerEmail: body.customerEmail,
        billing: body.billing,
      });

      if (!authResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: authResult.failureMessage ?? "Payment declined. Please try a different card.",
            code: authResult.failureCode ?? "PAYMENT_FAILED",
          },
          { status: 402 },
        );
      }
      authTransactionId = authResult.cybersourceTransactionId;
    }

    // ── Step 3: Post-auth transaction ─────────────────────────────────────────
    // Atomically: link attribution, re-check capacity, advance reservation,
    // create capacity hold (CONFIRMED path), emit ledger events.
    // The advisory lock is re-acquired here to close the race window.
    let spaceFullPostAuth = false;

    try {
      await prisma.$transaction(async (tx) => {
        // a. Link AttributionSession to PaymentIntent so attribution is
        //    preserved across the payment lifecycle (void, refund, webhook events).
        const attrSession = await tx.attributionSession.findFirst({
          where: { reservationId },
          select: { id: true },
        });
        if (attrSession && !intent.attributionSessionId) {
          await tx.paymentIntent.update({
            where: { id: intent.id },
            data: { attributionSessionId: attrSession.id },
          });
        }

        // b. Re-acquire advisory lock + re-check capacity
        if (spaceId) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${spaceId}))`;
          const competingHolds = await tx.capacityHold.findMany({
            where: {
              spaceId,
              status: "ACTIVE",
              expiresAt: { gt: new Date() },
              startAt: { lt: endAt },
              endAt:   { gt: startAt },
            },
            select: { partySize: true },
          });
          const heldCovers = competingHolds.reduce((s, h) => s + h.partySize, 0);
          const spaceRow = await tx.restaurantSpace.findUnique({
            where: { id: spaceId },
            select: { capacity: true },
          });
          const available = (spaceRow?.capacity ?? 0) - heldCovers;

          if (available < reservation.partySize && !requiresApproval) {
            // Signal outer code to void the authorization.
            // Do NOT update the intent inside this throw — the transaction will
            // roll back, undoing any inner writes. The void happens outside.
            throw new Error("__SPACE_FULL_POST_AUTH__");
          }
        }

        // c. Advance reservation status
        await tx.reservation.update({
          where: { id: reservationId },
          data: { status: nextStatus as import("@prisma/client").ReservationStatus },
        });

        // d. Capacity hold + ledger events (CONFIRMED path only)
        if (nextStatus === "CONFIRMED" && spaceId) {
          const hold = await tx.capacityHold.create({
            data: {
              spaceId,
              reservationId,
              startAt,
              endAt,
              partySize: reservation.partySize,
              status: "ACTIVE",
              expiresAt: FAR_FUTURE_EXPIRY,
            },
          });
          await enqueueLedgerEvent(tx, {
            eventType: "CAPACITY_HOLD_CREATED",
            source: { system: "reservations_api", connector: null, recordId: null },
            confidenceClass: "PARTNER_REPORTED_EVENT",
            idempotencyKey: `capacity_hold:${hold.id}:created:post_payment`,
            capacityHoldId: hold.id,
            reservationId,
            paymentIntentId: intent.id,
            payload: {
              spaceId,
              partySize: reservation.partySize,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
            },
          });
        }

        if (nextStatus === "CONFIRMED") {
          await enqueueLedgerEvent(tx, {
            eventType: "RESERVATION_CONFIRMED",
            source: { system: "reservations_api", connector: null, recordId: null },
            confidenceClass: "CUSTOMER_CLAIMED_EVENT",
            idempotencyKey: `reservation:${reservationId}:status:CONFIRMED:post_payment`,
            reservationId,
            paymentIntentId: intent.id,
            payload: {
              confirmationCode: reservation.confirmationCode,
              partySize: reservation.partySize,
              cybersourceTransactionId: authTransactionId,
            },
          });
        }
      });
    } catch (txErr: any) {
      if (txErr?.message === "__SPACE_FULL_POST_AUTH__") {
        spaceFullPostAuth = true;
      } else {
        throw txErr;
      }
    }

    if (spaceFullPostAuth) {
      // Void the authorization OUTSIDE any transaction — the transaction above
      // already rolled back, so no void attempt inside it could have survived.
      try {
        await voidPayment({ paymentIntentId: intent.id });
      } catch (voidErr) {
        console.error(
          "[payment/confirm] space-full post-auth: voidPayment failed — intent left AUTHORIZED",
          { reservationId, intentId: intent.id, err: voidErr },
        );
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            "This space reached capacity between authorization and confirmation. " +
            "Your authorization will be voided and no charge will appear.",
          code: "SPACE_FULL",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      reservationId,
      confirmationCode: reservation.confirmationCode,
      status: nextStatus,
      paymentIntentId: intent.id,
      cybersourceTransactionId: authTransactionId,
    });
  } catch (err: any) {
    console.error("[POST /api/reservations/[id]/payment/confirm]", err);
    if (err?.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request body.", details: err.errors },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Failed to process payment." }, { status: 500 });
  }
}
