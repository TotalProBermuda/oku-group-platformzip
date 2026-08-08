import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { getReferralActorById } from "@/server/referrals/referralActorService";
import { prisma } from "@/lib/prisma";
import { resolveDateRange, type DateRangeInput } from "@/lib/analytics/dateFilters";
import { commissionWhereForEarner } from "@/server/commissions/earnerScope";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    // Honor the same date range contract as Compensation/operator surfaces so
    // drawer totals stay consistent with the page-level scoped view.
    const url = new URL(req.url);
    const rangeInput: DateRangeInput = {
      preset: (url.searchParams.get("preset") as DateRangeInput["preset"]) ?? undefined,
      startDate: url.searchParams.get("startDate") ?? url.searchParams.get("from") ?? undefined,
      endDate: url.searchParams.get("endDate") ?? url.searchParams.get("to") ?? undefined,
    };
    const { from, to } = resolveDateRange(rangeInput);
    const dateFilter = from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lte: to }) } } : {};

    const actor = await getReferralActorById(id);
    if (!actor) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    const legacyReferrerId = actor.legacyReferrerId;

    let commissionStats = {
      pendingCents: 0,
      approvedCents: 0,
      paidCents: 0,
      totalCents: 0,
      entryCount: 0,
    };
    let attributionStats = {
      total: 0,
      arrived: 0,
      seated: 0,
      completed: 0,
    };
    let recentCommissions: unknown[] = [];
    let recentAttributions: unknown[] = [];

    if (legacyReferrerId) {
      // Build the canonical earner scope directly: we already know both halves
      // of the Referrer ↔ ReferralActor pair, so no extra DB lookup is needed.
      // commissionWhereForEarner returns an OR clause that picks up commissions
      // attributed via either FK — see src/server/commissions/earnerScope.ts.
      const earnerWhere = commissionWhereForEarner({
        referrerId: legacyReferrerId,
        actorId: actor.id,
      });
      const [commissions, attributions] = await Promise.all([
        prisma.commissionEntry.findMany({
          where: { ...earnerWhere, ...dateFilter },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.reservationAttribution.findMany({
          where: { referrerId: legacyReferrerId, ...dateFilter },
          include: {
            reservation: {
              select: {
                id: true,
                partySize: true,
                reservationDate: true,
                status: true,
                conceptRequested: true,
                contactName: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      ]);

      commissionStats = {
        pendingCents: commissions.filter(c => c.status === "PENDING").reduce((s, c) => s + c.amountCents, 0),
        approvedCents: commissions.filter(c => c.status === "APPROVED").reduce((s, c) => s + c.amountCents, 0),
        paidCents: commissions.filter(c => c.status === "PAID").reduce((s, c) => s + c.amountCents, 0),
        totalCents: commissions.reduce((s, c) => s + c.amountCents, 0),
        entryCount: commissions.length,
      };

      attributionStats = {
        total: attributions.length,
        arrived: attributions.filter(a => ["ARRIVED", "PATRONIZED"].includes(a.conversionStage)).length,
        seated: attributions.filter(a => a.conversionStage === "PATRONIZED").length,
        completed: attributions.filter(a => a.conversionStage === "PATRONIZED").length,
      };

      recentCommissions = commissions.map(c => ({
        id: c.id,
        amountCents: c.amountCents,
        status: c.status,
        covers: c.covers,
        conceptKey: c.conceptKey,
        createdAt: c.createdAt,
      }));

      recentAttributions = attributions.map(a => ({
        id: a.id,
        conversionStage: a.conversionStage,
        lossReason: a.lossReason,
        reservation: a.reservation,
        createdAt: a.createdAt,
      }));
    }

    return NextResponse.json({
      ok: true,
      actor: {
        id: actor.id,
        actorType: actor.actorType,
        displayName: actor.displayName,
        organizationName: actor.organizationName,
        status: actor.status,
        email: actor.email,
        phone: actor.phone,
        whatsapp: actor.whatsapp,
        user: actor.user,
        legacyReferrerId: actor.legacyReferrerId,
        legacyEventReferrerAssignmentId: actor.legacyEventReferrerAssignmentId,
      },
      assignments: actor.assignments,
      links: actor.links,
      commissionStats,
      attributionStats,
      recentCommissions,
      recentAttributions,
      range: { from, to },
    });
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Failed" }, { status: err.status ?? 500 });
  }
}
