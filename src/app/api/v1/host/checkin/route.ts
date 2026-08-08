import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { createAttributionSession } from "@/server/services/invu/identityService";
import { recordIntegrationAudit } from "@/server/services/invu/invuAuditService";
import { ensureHostAttributionForReservation } from "@/server/referrals/hostAttributionResolver";
import { emitLedgerEvent } from "@/server/services/ledger/ledgerEventService";

type Body = {
  reservationId?: string;
  tableLabel?: string;
  zoneId?: string | null;
  hostUserId?: string | null;
  hostProfileId?: string | null;
  referralActorId?: string | null;
  legacyReferrerId?: string | null;
};

export async function POST(req: NextRequest) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "host:reservations:checkin");

    const body = (await req.json()) as Body;
    if (!body.reservationId) {
      return NextResponse.json({ ok: false, error: "reservationId is required" }, { status: 400 });
    }
    if (!body.tableLabel?.trim()) {
      return NextResponse.json({ ok: false, error: "tableLabel is required" }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id: body.reservationId! },
        select: {
          id: true,
          venueId: true,
          zoneId: true,
          assignedRestaurantHostId: true,
          attributionSession: {
            select: {
              id: true,
              bookingCode: true,
              status: true,
              tableSession: { select: { id: true } },
            },
          },
        },
      });
      if (!reservation) {
        const e = new Error("reservation not found") as Error & { status?: number };
        e.status = 404;
        throw e;
      }

      let minted: { attributionSessionId: string; tableSessionId: string; bookingCode: string };

      if (reservation.attributionSession) {
        // QR-driven path: the public POST /api/reservations already opened
        // a CAPTURED session for this booking. Transition it to SEATED and
        // stamp tableLabel + zoneId on both the attribution row and its
        // already-linked table session so the trust chain is complete.
        const existing = reservation.attributionSession;
        if (existing.status !== "CAPTURED" && existing.status !== "SEATED") {
          // POS_BIND_INTENT_RECORDED / BOUND_TO_POS (deprecated) /
          // VERIFIED_POS_SALE / CANCELED — refuse to rewind the lifecycle
          // from a check-in.
          const e = new Error(
            `attribution session ${existing.bookingCode} is in status ${existing.status}; cannot re-seat`
          ) as Error & { status?: number };
          e.status = 409;
          throw e;
        }
        const tableLabel = body.tableLabel!.trim();
        // Forward-only lifecycle transition. `updateMany` with a status guard
        // ensures we cannot rewind a row that a concurrent INVU bind/match
        // already advanced past SEATED — even though the read above checked
        // status, an interleaving write between read and write would bypass
        // a plain `update`. If the count is 0, the row has moved beyond
        // SEATED (which is fine — we still write the seat metadata below);
        // if it stays at CAPTURED|SEATED we stamp seatedAt as the latest
        // arrival time the host confirmed.
        await tx.attributionSession.updateMany({
          where: { id: existing.id, status: { in: ["CAPTURED", "SEATED"] } },
          data: { status: "SEATED", seatedAt: new Date() },
        });
        // Seat metadata (table label, zone, host attribution) is decoupled
        // from the lifecycle status and always reflects the most recent
        // host action — safe to write unconditionally.
        await tx.attributionSession.update({
          where: { id: existing.id },
          data: {
            tableLabel,
            zoneId: body.zoneId ?? reservation.zoneId ?? null,
            hostUserId: body.hostUserId ?? userId ?? null,
            hostProfileId:
              body.hostProfileId ?? reservation.assignedRestaurantHostId ?? null,
            referralActorId: body.referralActorId ?? undefined,
            legacyReferrerId: body.legacyReferrerId ?? undefined,
          },
        });
        const updated = await tx.attributionSession.findUnique({
          where: { id: existing.id },
          select: { id: true, bookingCode: true, tableSession: { select: { id: true } } },
        });
        if (!updated) {
          const e = new Error(
            `attribution session ${existing.bookingCode} disappeared mid-checkin`
          ) as Error & { status?: number };
          e.status = 500;
          throw e;
        }
        if (updated.tableSession) {
          await tx.tableSession.update({
            where: { id: updated.tableSession.id },
            data: { tableLabel },
          });
        }
        if (!updated.tableSession) {
          // Defensive: createAttributionSession always pairs a table session,
          // but if a legacy row lacks one we still need a usable id downstream.
          const e = new Error(
            `attribution session ${updated.bookingCode} has no table session — cannot seat`
          ) as Error & { status?: number };
          e.status = 500;
          throw e;
        }
        minted = {
          attributionSessionId: updated.id,
          tableSessionId: updated.tableSession.id,
          bookingCode: updated.bookingCode,
        };
      } else {
        // No QR pre-capture — host walks the booking through check-in cold.
        // Mint a fresh session straight at SEATED.
        minted = await createAttributionSession(
          {
            kind: "RESERVATION",
            source: "HOST_CHECKIN",
            initialStatus: "SEATED",
            venueId: reservation.venueId,
            reservationId: reservation.id,
            tableLabel: body.tableLabel!.trim(),
            zoneId: body.zoneId ?? reservation.zoneId ?? null,
            hostUserId: body.hostUserId ?? userId ?? null,
            hostProfileId: body.hostProfileId ?? reservation.assignedRestaurantHostId ?? null,
            referralActorId: body.referralActorId ?? null,
            legacyReferrerId: body.legacyReferrerId ?? null,
            createdByUserId: userId ?? null,
          },
          tx
        );
      }

      const now = new Date();
      await tx.reservation.update({
        where: { id: reservation.id },
        data: {
          arrivalConfirmedAt: now,
          assignedTableLabel: body.tableLabel!.trim(),
          status: "SEATED",
          seatedAt: now,
        },
      });

      // Write a status log so this transition has an audit trail consistent
      // with board-driven transitions (transitionStatus also creates one).
      // Capture the ID for the LedgerEvent idempotency key below.
      const statusLog = await tx.reservationStatusLog.create({
        data: {
          reservationId: reservation.id,
          fromStatus: null, // checkin doesn't read prior status from DB
          toStatus: "SEATED",
          changedByUserId: userId ?? null,
          changedByLabel: "HOST_CHECKIN",
          notes: `Check-in via host checkin flow. Table: ${body.tableLabel!.trim()}`,
        },
        select: { id: true },
      });

      return { minted, reservationId: reservation.id, venueId: reservation.venueId, statusLogId: statusLog.id };
    });

    await recordIntegrationAudit("HOST_RESERVATION_CHECKIN", userId ?? null, null, {
      reservationId: result.reservationId,
      venueId: result.venueId,
      ...result.minted,
    });

    // Emit canonical GUEST_SEATED event. The idempotency key is anchored to
    // the status-log row ID — each distinct check-in action maps to exactly
    // one LedgerEvent. Best-effort: failures here must never block the
    // check-in response that has already committed.
    try {
      await emitLedgerEvent({
        eventType: "GUEST_SEATED",
        source: { system: "host_ops", connector: null, recordId: null },
        // HOST_CHECKIN is a trusted restaurant-staff action — PARTNER_REPORTED.
        confidenceClass: "PARTNER_REPORTED_EVENT",
        idempotencyKey: `reservation:${result.reservationId}:status_log:${result.statusLogId}`,
        reservationId: result.reservationId,
        attributionSessionId: result.minted.attributionSessionId,
        payload: {
          tableLabel: body.tableLabel!.trim(),
          hostUserId: userId ?? null,
          checkinPath: "host_checkin",
        },
      });
    } catch (emitErr) {
      console.error(
        "[host/checkin] emitLedgerEvent GUEST_SEATED failed (non-blocking)",
        { reservationId: result.reservationId, err: emitErr }
      );
    }

    // Stamp the assigned host's commission attribution onto the freshly-
    // sealed AttributionSession. Best-effort, runs OUTSIDE the seating
    // transaction so a referral-resolver hiccup never reverts a successful
    // check-in. Idempotent on its own — re-runs are no-ops via the
    // null-guarded updateMany inside the resolver.
    const finalHostProfileId =
      body.hostProfileId ??
      (await prisma.reservation
        .findUnique({
          where: { id: result.reservationId },
          select: { assignedRestaurantHostId: true },
        })
        .then((r) => r?.assignedRestaurantHostId ?? null)
        .catch(() => null));
    if (finalHostProfileId) {
      try {
        await ensureHostAttributionForReservation(result.reservationId, finalHostProfileId);
      } catch (err) {
        console.error(
          "[host/checkin] ensureHostAttributionForReservation failed",
          { reservationId: result.reservationId, hostProfileId: finalHostProfileId, err }
        );
      }
    }

    return NextResponse.json({ ok: true, ...result.minted }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}
