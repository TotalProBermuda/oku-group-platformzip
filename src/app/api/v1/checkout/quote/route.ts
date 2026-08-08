import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOptionalSession } from "@/server/auth/session";

export async function POST(req: NextRequest) {
  const auth = await getOptionalSession();
  const body    = await req.json().catch(() => ({}));

  const { seriesSlug, sessionId, items } = body as {
    seriesSlug: string;
    sessionId: string;
    items: Array<{ ticketTypeId?: string; addonId?: string; qty: number }>;
  };

  if (!seriesSlug || !sessionId || !items?.length) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const series = await prisma.series.findUnique({
    where: { slug: seriesSlug },
    include: {
      ticketTypes: { include: { pricingRules: { where: { isActive: true }, orderBy: { priority: "asc" } } } },
      addons: { where: { isActive: true } },
      sessions: { where: { id: sessionId } },
    },
  });

  if (!series) return NextResponse.json({ error: "Experience not found" }, { status: 404 });
  if (!series.sessions.length) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const sess = series.sessions[0];

  // Load user membership
  let userMembership: any = null;
  if (auth) {
    userMembership = await prisma.membership.findUnique({
      where: { userId: auth.userId, status: "ACTIVE" } as any,
    });
  }

  const lineItems: any[] = [];
  let subtotalCents = 0;

  for (const item of items) {
    if (item.ticketTypeId) {
      const tt = series.ticketTypes.find((t) => t.id === item.ticketTypeId);
      if (!tt) return NextResponse.json({ error: `Ticket type ${item.ticketTypeId} not found` }, { status: 400 });

      // Access control
      const tierRank: Record<string, number> = { EXPLORER: 0, INSIDER: 1, PATRON: 2, FOUNDER: 3 };
      const userTierRank = userMembership ? (tierRank[userMembership.tier] ?? 0) : -1;

      if (tt.requiresMembership && !userMembership) {
        return NextResponse.json({
          error: "MEMBERSHIP_REQUIRED",
          message: `This experience is reserved for OKÜ Members.`,
          gating: { reason: "membership_required", minTier: "PATRON", upgradeUrl: "/membership" },
        }, { status: 403 });
      }

      if (series.minMembershipTier && userTierRank < (tierRank[series.minMembershipTier] ?? 0)) {
        const isFounderOnly = series.isFounderOnly || series.minMembershipTier === "FOUNDER";
        return NextResponse.json({
          error: "INSUFFICIENT_TIER",
          message: isFounderOnly
            ? `This experience is reserved for Founder Members.`
            : `This experience requires ${series.minMembershipTier.charAt(0) + series.minMembershipTier.slice(1).toLowerCase()} membership or higher.`,
          gating: {
            reason: "insufficient_tier",
            minTier: series.minMembershipTier,
            currentTier: userMembership?.tier ?? null,
            upgradeUrl: isFounderOnly ? "/membership#founder" : "/membership",
          },
        }, { status: 403 });
      }

      if (tt.saleStartsAt && new Date() < tt.saleStartsAt && !userMembership?.benefitsJson?.earlyAccess) {
        return NextResponse.json({
          error: "NOT_YET_ON_SALE",
          message: `This ticket is not yet on sale. Members get early access.`,
          gating: { reason: "early_access", saleStartsAt: tt.saleStartsAt, upgradeUrl: "/membership" },
        }, { status: 400 });
      }

      // Dynamic pricing
      let unitPrice = tt.priceCents;
      const remaining = Math.max(0, (tt.typeCapacity ?? 9999) - tt.soldCount);
      const remainingPct = remaining / (tt.typeCapacity ?? 1);

      for (const rule of tt.pricingRules) {
        const cond = rule.conditionJson as any;
        const action = rule.actionJson as any;
        let matches = false;

        if (cond.field === "remainingPct" && cond.operator === "lt") {
          matches = remainingPct < cond.value / 100;
        }
        if (matches && action.type === "price_increase_pct") {
          unitPrice = Math.round(unitPrice * (1 + action.value / 100));
        }
      }

      // Member discount
      if (userMembership?.benefitsJson?.discountBps && series.membershipRuleMode === "MEMBERS_DISCOUNT") {
        unitPrice = Math.round(unitPrice * (1 - userMembership.benefitsJson.discountBps / 10000));
      }

      lineItems.push({ ticketTypeId: tt.id, nameSnapshot: tt.name, itemType: "ticket", qty: item.qty, unitPriceCents: unitPrice, totalCents: unitPrice * item.qty });
      subtotalCents += unitPrice * item.qty;
    }

    if (item.addonId) {
      const addon = series.addons.find((a) => a.id === item.addonId);
      if (!addon) return NextResponse.json({ error: `Add-on ${item.addonId} not found` }, { status: 400 });

      lineItems.push({ addonId: addon.id, nameSnapshot: addon.name, itemType: "addon", qty: item.qty, unitPriceCents: addon.priceCents, totalCents: addon.priceCents * item.qty });
      subtotalCents += addon.priceCents * item.qty;
    }
  }

  const feesCents  = Math.round(subtotalCents * 0.05);
  const taxCents   = Math.round(subtotalCents * 0.084);
  const totalCents = subtotalCents + feesCents + taxCents;

  return NextResponse.json({
    seriesId: series.id,
    sessionId: sess.id,
    lineItems,
    subtotalCents,
    feesCents,
    taxCents,
    totalCents,
    currency: "USD",
    memberDiscount: !!userMembership,
  });
}
