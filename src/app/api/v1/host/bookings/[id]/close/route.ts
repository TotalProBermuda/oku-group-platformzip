import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import {
  CommissionAllocationStatus,
  CommissionEligibilityStatus,
  DeterministicMatchStatus,
  InvuSyncStatus,
  MatchMethod,
  ReservationStatus,
  TableSessionStatus,
} from "@prisma/client";

// POST /api/v1/host/bookings/[id]/close
// Called when a host records an INVU table close.
// Derives commission rates from active CompensationPlan records; falls back to
// the submitted commissionPercent only when no plan is configured.
// All writes (reservation update, table session, allocations, status log)
// are executed inside a single Prisma transaction to ensure consistency.
//
// This is the explicitly-labelled fallback for a bound table when INVU's
// read credential cannot retrieve a closed check. It never writes to INVU.
// A later manual correction replaces only PENDING allocations on the same
// table session; it cannot duplicate or rewrite a paid commission.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, roles } = await requireSession();
  const isSuperAdmin = roles.includes("SUPERADMIN");
  const { tableTotalCents, commissionPercent } = await req.json();

  if (!Number.isInteger(tableTotalCents) || tableTotalCents <= 0) {
    return NextResponse.json({ ok: false, error: "tableTotalCents is required and must be > 0" }, { status: 400 });
  }

  const fallbackPct = parseFloat(commissionPercent ?? "5");
  if (!Number.isFinite(fallbackPct) || fallbackPct < 0 || fallbackPct > 100) {
    return NextResponse.json({ ok: false, error: "commissionPercent must be between 0 and 100" }, { status: 400 });
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      contactName: true,
      status: true,
      commissionValidatedAt: true,
      venueId: true,
      assignedTableLabel: true,
      assignedRestaurantHostId: true,
      assignedHost: { select: { userId: true } },
      attributions: {
        select: {
          referrerId: true,
          referrer: {
            select: {
              compensationPlanId: true,
              compensationPlan: { select: { commissionPercent: true, isActive: true } },
            },
          },
        },
        take: 1,
      },
      // Modern referrer chain — required because legacy `attributions` is
      // empty for any host-link-only referrer (a streetside host like RAFNH01
      // has only a ReferralActor + EventReferrerAssignment, no Referrer row).
      // Without this fallback, those bookings closed via the manual host
      // path silently mint $0 referrer commission even though the host card
      // clearly shows "Referred by …".
      attributionSession: {
        select: {
          referralActorId: true,
          legacyReferrerId: true,
          tableSession: {
            select: {
              id: true,
              openedInvuOrderId: true,
              matchMethod: true,
              allocations: { select: { id: true, status: true } },
            },
          },
          referralActor: {
            select: {
              id: true,
              displayName: true,
              legacyEventReferrerAssignmentId: true,
              assignments: {
                where: { isActive: true, isCommissionEligible: true },
                select: { rateBps: true, compensationMode: true },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
              legacyEventReferrerAssignment: {
                select: { commissionShareBps: true, isCommissionEligible: true },
              },
              legacyReferrer: {
                select: {
                  compensationPlan: { select: { commissionPercent: true, isActive: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!reservation) {
    return NextResponse.json({ ok: false, error: "Reservation not found" }, { status: 404 });
  }

  // Authorization: caller must be the assigned host for this reservation or a SUPERADMIN.
  const isAssignedHost = reservation.assignedHost?.userId === userId;
  if (!isSuperAdmin && !isAssignedHost) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  // Historical versions created a second MANUAL TableSession for a bound
  // booking. Keep it correctable for backwards compatibility, but new closes
  // update the attribution's canonical table session in place.
  const existingManualSession = await prisma.tableSession.findFirst({
    where: { reservationId: params.id, matchMethod: MatchMethod.MANUAL },
    select: {
      id: true,
      grossCents: true,
      closedAt: true,
      allocations: { select: { id: true, status: true } },
    },
  });

  const canonicalSession = reservation.attributionSession?.tableSession ?? null;
  if (reservation.attributionSession && !canonicalSession?.openedInvuOrderId) {
    return NextResponse.json(
      { ok: false, error: "Bind the open INVU check before recording a manual fallback close" },
      { status: 409 }
    );
  }
  const manualSession =
    canonicalSession?.matchMethod === MatchMethod.MANUAL
      ? canonicalSession
      : existingManualSession;

  // Never silently overwrite an INVU-confirmed financial close. Manual
  // correction is intentionally limited to manual fallback data.
  if (reservation.actualRevenueCents != null && !manualSession) {
    return NextResponse.json(
      { ok: false, error: "This reservation was already closed from INVU and cannot be replaced manually" },
      { status: 409 }
    );
  }

  if (manualSession?.allocations.some((allocation) => allocation.status !== CommissionAllocationStatus.PENDING)) {
    return NextResponse.json(
      {
        ok: false,
        error: "This manual close already has a non-pending commission. Use the payout correction workflow instead.",
        tableSessionId: manualSession.id,
      },
      { status: 409 }
    );
  }

  // Resolve host commission percent:
  // Look up the host's Profile via AccountProfileLink → ProfileCompensationSettings → CompensationPlan
  let hostPlanPct: number | null = null;
  const hostUserId = reservation.assignedHost?.userId;
  if (hostUserId) {
    const link = await prisma.accountProfileLink.findFirst({
      where: { userId: hostUserId },
      select: {
        profile: {
          select: {
            compensationSettings: {
              select: { compensationPlanId: true },
            },
          },
        },
      },
    });
    const planId = link?.profile?.compensationSettings?.compensationPlanId;
    if (planId) {
      const plan = await prisma.compensationPlan.findUnique({
        where: { id: planId },
        select: { commissionPercent: true, isActive: true },
      });
      if (plan?.isActive && plan.commissionPercent != null) {
        hostPlanPct = Number(plan.commissionPercent);
      }
    }
  }
  const hostPct = hostPlanPct ?? fallbackPct;
  const hostCommissionCents = Math.round(tableTotalCents * hostPct / 100);

  // ── Resolve referrer commission ────────────────────────────────────────
  // Tier-priority resolution MIRRORS commissionMintingService EXACTLY so
  // a manual close and an auto-INVU-match converge on the same earner:
  //   1. AttributionSession.referralActorId  (modern; preferred — this is
  //      the explicit per-session attribution and supersedes any legacy
  //      ReservationAttribution row that may exist for the booking)
  //   2. AttributionSession.legacyReferrerId
  //   3. Reservation.attributions[0].referrerId  (legacy fallback)
  //
  // Rate resolution for tier 1: ReferralAssignment.rateBps →
  // legacyEventReferrerAssignment.commissionShareBps → linked legacy
  // Referrer's CompensationPlan → fallback. earnerType=REFERRER,
  // earnerRefId is whichever id resolved (ReferralActor.id OR Referrer.id).
  let referrerEarnerType: "REFERRER" | null = null;
  let referrerEarnerRefId: string | null = null;
  let referrerPct = fallbackPct;
  let referrerPlanSource: "compensation_plan" | "manual_fallback" = "manual_fallback";

  const sess = reservation.attributionSession;
  const actor = sess?.referralActor;
  const legacyAttrib = reservation.attributions?.[0];

  if (actor && sess?.referralActorId) {
    referrerEarnerType = "REFERRER";
    referrerEarnerRefId = sess.referralActorId;
    const assignment = actor.assignments?.[0];
    if (assignment?.rateBps && assignment.rateBps > 0) {
      referrerPct = assignment.rateBps / 100;
      referrerPlanSource = "compensation_plan";
    } else if (
      actor.legacyEventReferrerAssignment?.isCommissionEligible &&
      actor.legacyEventReferrerAssignment.commissionShareBps != null &&
      actor.legacyEventReferrerAssignment.commissionShareBps > 0
    ) {
      referrerPct = actor.legacyEventReferrerAssignment.commissionShareBps / 100;
      referrerPlanSource = "compensation_plan";
    } else if (
      actor.legacyReferrer?.compensationPlan?.isActive &&
      actor.legacyReferrer.compensationPlan.commissionPercent != null
    ) {
      referrerPct = Number(actor.legacyReferrer.compensationPlan.commissionPercent);
      referrerPlanSource = "compensation_plan";
    }
  } else if (sess?.legacyReferrerId) {
    referrerEarnerType = "REFERRER";
    referrerEarnerRefId = sess.legacyReferrerId;
    // No selected plan in this shape; fall through to manual %.
  } else if (legacyAttrib?.referrerId) {
    referrerEarnerType = "REFERRER";
    referrerEarnerRefId = legacyAttrib.referrerId;
    const plan = legacyAttrib.referrer?.compensationPlan;
    if (plan?.isActive && plan.commissionPercent != null) {
      referrerPct = Number(plan.commissionPercent);
      referrerPlanSource = "compensation_plan";
    }
  }

  const referrerCommissionCents =
    referrerEarnerType && referrerEarnerRefId
      ? Math.round((tableTotalCents * referrerPct) / 100)
      : 0;
  // Aliases preserved so the rest of this handler reads naturally.
  const referrerId = referrerEarnerRefId;
  const referrerPlanPct = referrerPlanSource === "compensation_plan" ? referrerPct : null;

  const closedAt = new Date();
  const correction = !!manualSession;
  const noteText = `Manual fallback close${correction ? " corrected" : ""}: $${(tableTotalCents / 100).toFixed(2)} · Host commission (${hostPct}%): $${(hostCommissionCents / 100).toFixed(2)}${referrerId ? ` · Referrer commission (${referrerPct}%): $${(referrerCommissionCents / 100).toFixed(2)}` : ""}`;

  // --- Atomic transaction: reservation update + table session + allocations + status log ---
  const tableSession = await prisma.$transaction(async (tx) => {
    // 1. Update reservation with actual revenue and mark commission validated
    await tx.reservation.update({
      where: { id: params.id },
      data: {
        actualRevenueCents: tableTotalCents,
        commissionEligible: true,
        commissionValidatedAt: closedAt,
      },
    });

    // 2. Use the bound table session where possible. This retains the INVU
    // order link so an eventual provider repair can reconcile the record
    // rather than creating a second, competing table session.
    const manualCloseData = {
      reservationId: params.id,
      tableLabel: reservation.assignedTableLabel,
      ...(canonicalSession?.openedInvuOrderId ? { invuOrderId: canonicalSession.openedInvuOrderId } : {}),
      closedAt,
      grossCents: tableTotalCents,
      discountCents: 0,
      taxCents: 0,
      tipCents: 0,
      refundCents: 0,
      netRevenueCents: tableTotalCents,
      commissionableCents: tableTotalCents,
      matchMethod: MatchMethod.MANUAL,
      matchStatus: DeterministicMatchStatus.MANUALLY_OVERRIDDEN,
      syncStatus: InvuSyncStatus.CLOSED,
      commissionEligibility: CommissionEligibilityStatus.OVERRIDE_LOCKED,
      trustScore: 1.0,
      status: TableSessionStatus.MATCHED,
    };
    const session = manualSession
      ? await tx.tableSession.update({ where: { id: manualSession.id }, data: manualCloseData })
      : canonicalSession
        ? await tx.tableSession.update({ where: { id: canonicalSession.id }, data: manualCloseData })
        : await tx.tableSession.create({ data: { venueId: reservation.venueId, ...manualCloseData } });

    // Correction replaces the pending, manually-calculated allocations. The
    // guard above ensures neither paid nor otherwise finalized allocations
    // can be erased by a host correction.
    if (manualSession) {
      await tx.commissionAllocation.deleteMany({ where: { tableSessionId: session.id, status: CommissionAllocationStatus.PENDING } });
    }

    // 3. Create CommissionAllocation for host if applicable
    if (reservation.assignedRestaurantHostId) {
      await tx.commissionAllocation.create({
        data: {
          tableSessionId: session.id,
          earnerType: "HOST",
          earnerRefId: reservation.assignedRestaurantHostId,
          amountCents: hostCommissionCents,
          currency: "USD",
          status: "PENDING",
          commissionRuleSnapshot: {
            commissionPercent: hostPct,
            planSource: hostPlanPct !== null ? "compensation_plan" : "manual_fallback",
            source: "manual_host_close",
            closedAt: closedAt.toISOString(),
          },
        },
      });
    }

    // 4. Create CommissionAllocation for referrer if applicable
    if (referrerId && referrerCommissionCents > 0) {
      await tx.commissionAllocation.create({
        data: {
          tableSessionId: session.id,
          earnerType: "REFERRER",
          earnerRefId: referrerId,
          amountCents: referrerCommissionCents,
          currency: "USD",
          status: "PENDING",
          commissionRuleSnapshot: {
            commissionPercent: referrerPct,
            planSource: referrerPlanPct !== null ? "compensation_plan" : "manual_fallback",
            source: "manual_host_close_referrer",
            closedAt: closedAt.toISOString(),
          },
        },
      });
    }

    // 5. Log the close event in status logs
    await tx.reservationStatusLog.create({
      data: {
        reservationId: params.id,
        fromStatus: reservation.status as ReservationStatus,
        toStatus: reservation.status as ReservationStatus,
        changedByUserId: userId,
        changedByLabel: correction ? "HOST_MANUAL_CLOSE_CORRECTED" : "HOST_MANUAL_CLOSE",
        notes: noteText,
      },
    });

    return session;
  });

  return NextResponse.json({
    ok: true,
    data: {
      reservationId: params.id,
      tableSessionId: tableSession.id,
      corrected: correction,
      tableTotalCents,
      host: {
        commissionPercent: hostPct,
        commissionCents: hostCommissionCents,
        planSource: hostPlanPct !== null ? "compensation_plan" : "manual_fallback",
      },
      referrer: referrerId
        ? {
            referrerId,
            commissionPercent: referrerPct,
            commissionCents: referrerCommissionCents,
            planSource: referrerPlanPct !== null ? "compensation_plan" : "manual_fallback",
          }
        : null,
    },
  });
}
