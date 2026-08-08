import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { reserveCapacityOrThrow } from "@/server/commerce/capacity";
import { getEventReferrerByCode } from "@/server/events/eventReferrerService";
import { resolveActorFromCode } from "@/server/referrals/referralActorService";

const Body = z.object({
  sessionId: z.string(),
  items: z.array(z.object({ ticketTypeId: z.string(), qty: z.number().int().positive() })).min(1),
  couponCode: z.string().optional(),
  attributionId: z.string().optional(),
  // Optional event referrer code scanned from QR or link (NOT a CompensationPlan code)
  eventReferrerCode: z.string().optional(),
  // Unified ReferralLink code (preferred path going forward — resolves to
  // a ReferralActor + ReferralAssignment so the new wallet/assignment UX
  // can credit the right offer when commissions are computed).
  referralCode: z.string().optional(),
  // Source hint so analytics know how the user arrived
  attributionSource: z.enum(["EVENT_REFERRER_QR", "EVENT_REFERRER_LINK", "DIRECT"]).optional(),
});

export async function POST(req: Request) {
  const { userId } = await requireSession();
  const body = Body.parse(await req.json());

  // Load ticket types
  const ticketTypes = await prisma.ticketType.findMany({
    where: { id: { in: body.items.map(i => i.ticketTypeId) } },
  });
  if (ticketTypes.length !== body.items.length) {
    return NextResponse.json({ ok: false, error: "Invalid ticket type" }, { status: 400 });
  }

  // Compute subtotal
  const subtotalCents = body.items.reduce((sum, item) => {
    const tt = ticketTypes.find(t => t.id === item.ticketTypeId)!;
    return sum + tt.priceCents * item.qty;
  }, 0);

  const qtyTotal = body.items.reduce((s, i) => s + i.qty, 0);

  // Reserve capacity atomically
  await reserveCapacityOrThrow(body.sessionId, qtyTotal);

  // Create order PENDING
  const session = await prisma.session.findUnique({ where: { id: body.sessionId } });
  if (!session) throw new Error("Session not found");
  const series = await prisma.series.findUnique({ where: { id: session.seriesId } });
  if (!series) throw new Error("Series not found");

  // Resolve event referrer assignment (SYSTEM 2 — paid by influencer, NOT OKU)
  let eventReferrerAssignmentId: string | undefined;
  let referralAssignmentId: string | undefined;
  let resolvedAttributionSource: string = body.attributionSource ?? "DIRECT";

  if (body.eventReferrerCode) {
    const referrerAssignment = await getEventReferrerByCode(body.eventReferrerCode);
    if (
      referrerAssignment &&
      referrerAssignment.status === "ACTIVE" &&
      // Verify scope: series-level referrer must match this series
      (!referrerAssignment.seriesId || referrerAssignment.seriesId === series.id)
    ) {
      eventReferrerAssignmentId = referrerAssignment.id;
      resolvedAttributionSource = body.attributionSource ?? "EVENT_REFERRER_LINK";
    }
  }

  // Unified ReferralLink resolution (Task #104). Coexists with the legacy
  // eventReferrerCode path: we record BOTH ids when available so historical
  // ledgers keep working and the new assignment-driven UX can read the
  // canonical id. Scope-mismatched links are silently ignored — the order
  // still flows, attribution simply stays DIRECT/legacy.
  if (body.referralCode) {
    const resolved = await resolveActorFromCode(body.referralCode.toUpperCase());
    if (resolved?.assignment && resolved.assignment.isActive) {
      const a = resolved.assignment;
      const scopeOk =
        a.scopeType === "GLOBAL" ||
        (a.scopeType === "SERIES" && a.scopeId === series.id) ||
        a.scopeType === "VENUE" ||
        a.scopeType === "CAMPAIGN";
      if (scopeOk) {
        referralAssignmentId = a.id;
        if (resolvedAttributionSource === "DIRECT") {
          resolvedAttributionSource = "EVENT_REFERRER_LINK";
        }
      }
    }
  }

  // Determine influencer attribution from series host or commercial owner
  const attributedInfluencerId =
    series.commercialOwnerInfluencerId ?? series.influencerId ?? undefined;

  // If attributed to an event referrer, also set influencer source
  if (eventReferrerAssignmentId && attributedInfluencerId) {
    resolvedAttributionSource = body.attributionSource ?? "EVENT_REFERRER_LINK";
  } else if (attributedInfluencerId) {
    resolvedAttributionSource = "INFLUENCER_HOST";
  }

  const order = await prisma.order.create({
    data: {
      userId,
      seriesId: series.id,
      sessionId: session.id,
      status: "PENDING",
      subtotalCents,
      totalCents: subtotalCents,
      currency: "USD",
      couponCode: body.couponCode,
      attributionId: body.attributionId,
      // SYSTEM 1: OKU pays the influencer based on commissionRateBps
      attributedInfluencerId,
      // SYSTEM 2: Influencer pays their event referrer (separate ledger)
      attributedEventReferrerAssignmentId: eventReferrerAssignmentId,
      // Unified ReferralAssignment attribution (Task #104) — coexists with
      // the legacy field so refund/reporting can read either id.
      attributedReferralAssignmentId: referralAssignmentId,
      attributionSource: resolvedAttributionSource as never,
    },
  });

  await prisma.orderLineItem.createMany({
    data: body.items.map(i => {
      const tt = ticketTypes.find(t => t.id === i.ticketTypeId)!;
      return { orderId: order.id, ticketTypeId: tt.id, qty: i.qty, unitPriceCents: tt.priceCents, totalCents: tt.priceCents * i.qty };
    })
  });

  return NextResponse.json({ ok: true, data: { intentId: order.id, orderId: order.id, totalCents: order.totalCents, currency: order.currency } });
}
