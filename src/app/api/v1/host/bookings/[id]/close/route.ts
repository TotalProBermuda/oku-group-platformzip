import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { MatchMethod, ReservationStatus, TableSessionStatus } from "@prisma/client";

// POST /api/v1/host/bookings/[id]/close
// Called when a host records an INVU table close.
// Derives commission rates from active CompensationPlan records; falls back to
// the submitted commissionPercent only when no plan is configured.
// All writes (reservation update, table session, allocations, status log)
// are executed inside a single Prisma transaction to ensure consistency.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId, roles } = await requireSession();
  const isSuperAdmin = roles.includes("SUPERADMIN");
  const { tableTotalCents, commissionPercent } = await req.json();

  if (!tableTotalCents || tableTotalCents <= 0) {
    return NextResponse.json({ ok: false, error: "tableTotalCents is required and must be > 0" }, { status: 400 });
  }

  const fallbackPct = parseFloat(commissionPercent ?? "5");

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

  // Idempotency guard: return 409 if a MANUAL TableSession already exists for this reservation.
  const existingManualSession = await prisma.tableSession.findFirst({
    where: { reservationId: params.id, matchMethod: MatchMethod.MANUAL },
    select: { id: true, grossCents: true, closedAt: true },
  });
  if (existingManualSession) {
    return NextResponse.json(
      { ok: false, error: "A manual table session already exists for this reservation", tableSessionId: existingManualSession.id },
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
  const noteText = `INVU table closed: $${(tableTotalCents / 100).toFixed(2)} · Host commission (${hostPct}%): $${(hostCommissionCents / 100).toFixed(2)}${referrerId ? ` · Referrer commission (${referrerPct}%): $${(referrerCommissionCents / 100).toFixed(2)}` : ""}`;

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

    // 2. Create a TableSession for this manual host close
    const session = await tx.tableSession.create({
      data: {
        venueId: reservation.venueId,
        reservationId: params.id,
        tableLabel: reservation.assignedTableLabel,
        closedAt,
        grossCents: tableTotalCents,
        discountCents: 0,
        taxCents: 0,
        tipCents: 0,
        refundCents: 0,
        netRevenueCents: tableTotalCents,
        commissionableCents: tableTotalCents,
        matchMethod: MatchMethod.MANUAL,
        trustScore: 1.0,
        status: TableSessionStatus.MATCHED,
      },
    });

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
        changedByLabel: "HOST_INVU_CLOSE",
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
