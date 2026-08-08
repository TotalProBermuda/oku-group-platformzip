import { NextResponse } from "next/server";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import {
  commissionWhereForEarner,
  resolveEarnerScopeForReferrer,
} from "@/server/commissions/earnerScope";

function cents(n: number) { return Math.round(n); }

export async function GET() {
  const auth = await getOptionalSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = auth.userId;
  const roles: string[] = auth.roles;

  const isInfluencer = roles.includes("INFLUENCER");
  const isReferrer = roles.includes("REFERRER") || roles.includes("STREETSIDE_HOST") ||
    roles.includes("RESTAURANT_HOST");

  if (isInfluencer) {
    const profile = await prisma.influencerProfile.findUnique({
      where: { userId },
      select: {
        id: true, handle: true, payoutCycle: true, minPayoutThresholdCents: true,
      },
    });
    if (!profile) return NextResponse.json({ error: "No influencer profile" }, { status: 403 });

    const [orders, ledger] = await Promise.all([
      prisma.order.findMany({
        where: { attributedInfluencerId: profile.id, status: "PAID" },
        select: { totalCents: true },
      }),
      prisma.ledgerEntry.findMany({
        where: { influencerId: profile.id },
        select: { type: true, amountCents: true, createdAt: true },
      }),
    ]);

    const grossAttributedRevenueCents = orders.reduce((s, o) => s + o.totalCents, 0);
    const earnedCents = ledger.filter(e => e.type === "COMMISSION_EARNED").reduce((s, e) => s + e.amountCents, 0);
    const reversedCents = ledger.filter(e => e.type === "COMMISSION_REVERSED").reduce((s, e) => s + Math.abs(e.amountCents), 0);
    const paidCents = ledger.filter(e => e.type === "COMMISSION_PAID").reduce((s, e) => s + e.amountCents, 0);
    const netEarned = earnedCents - reversedCents;
    const outstandingCents = Math.max(0, netEarned - paidCents);

    const subLedger = await prisma.influencerSubCommissionLedger.findMany({
      where: { parentInfluencerId: profile.id },
      select: { referrerShareCents: true, influencerRetainedCents: true },
    });
    const downstreamObligationsCents = subLedger.reduce((s, e) => s + e.referrerShareCents, 0);
    const retainedNetCents = netEarned - downstreamObligationsCents;

    return NextResponse.json({
      roleContext: "INFLUENCER",
      actorName: profile.handle ? `@${profile.handle}` : "Influencer",
      payerNotice: {
        payerType: "OKU",
        message: "OKU Hospitality Group is responsible for your direct influencer commissions.",
      },
      totals: {
        grossAttributedRevenueCents,
        earnedCents: netEarned,
        paidCents,
        outstandingCents,
        pendingValidationCents: 0,
        nextPayoutDate: null,
      },
      influencerExtra: {
        downstreamObligationsCents,
        retainedNetCents,
        payoutCycle: profile.payoutCycle,
        minPayoutThresholdCents: profile.minPayoutThresholdCents,
      },
    });
  }

  if (isReferrer) {
    const referrer = await prisma.referrer.findUnique({ where: { userId } });
    if (!referrer) return NextResponse.json({ error: "No referrer profile" }, { status: 403 });

    const earnerScope = (await resolveEarnerScopeForReferrer(referrer.id))!;
    const [commissions, attributions] = await Promise.all([
      prisma.commissionEntry.findMany({
        where: commissionWhereForEarner(earnerScope),
        select: { amountCents: true, status: true },
      }),
      prisma.reservationAttribution.findMany({
        where: { referrerId: referrer.id },
        include: { reservation: { select: { estimatedRevenueCents: true, actualRevenueCents: true } } },
      }),
    ]);

    const grossAttributedRevenueCents = attributions.reduce((s, a) => {
      return s + (a.reservation?.actualRevenueCents ?? a.reservation?.estimatedRevenueCents ?? 0);
    }, 0);
    const pendingCents = commissions.filter(c => c.status === "PENDING").reduce((s, c) => s + c.amountCents, 0);
    const approvedCents = commissions.filter(c => c.status === "APPROVED").reduce((s, c) => s + c.amountCents, 0);
    const paidCents = commissions.filter(c => c.status === "PAID").reduce((s, c) => s + c.amountCents, 0);
    const earnedCents = approvedCents + paidCents;
    const outstandingCents = approvedCents;

    return NextResponse.json({
      roleContext: "REFERRAL_ACTOR",
      actorName: referrer.fullName,
      payerNotice: {
        payerType: "OKU",
        message: "OKU Hospitality Group is responsible for your validated referral payouts.",
      },
      totals: {
        grossAttributedRevenueCents,
        earnedCents,
        paidCents,
        outstandingCents,
        pendingValidationCents: pendingCents,
        nextPayoutDate: null,
      },
      influencerExtra: null,
    });
  }

  return NextResponse.json({ error: "No payout dashboard available for your role" }, { status: 403 });
}
