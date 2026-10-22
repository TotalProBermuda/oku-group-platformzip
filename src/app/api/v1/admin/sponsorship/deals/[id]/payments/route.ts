import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession, type Session } from "next-auth";
import { SponsorDealPaymentStatus } from "@prisma/client";
import { authOptions } from "@/lib/auth";

// Sponsorship payment creation is a financial/governance write — SUPERADMIN only.
function isAdmin(s: Session | null) {
  return s?.user?.roles?.includes("SUPERADMIN") ?? false;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: dealId } = await params;
  const body = await req.json().catch(() => ({}));
  const { amountCents, paidAt, method, reference, notes } = body;

  if (!amountCents) return NextResponse.json({ error: "amountCents required" }, { status: 400 });

  const [payment, deal] = await prisma.$transaction(async (tx) => {
    const p = await tx.sponsorPayment.create({
      data: {
        dealId,
        amountCents,
        paidAt:    paidAt    ? new Date(paidAt) : new Date(),
        method:    method    || null,
        reference: reference || null,
        notes:     notes     || null,
      },
    });

    const allPayments = await tx.sponsorPayment.findMany({ where: { dealId }, select: { amountCents: true } });
    const paidTotalCents = allPayments.reduce((s, p) => s + p.amountCents, 0);

    const d = await tx.sponsorDeal.findUnique({ where: { id: dealId }, select: { agreedPriceCents: true } });
    const paymentStatus: SponsorDealPaymentStatus = paidTotalCents >= (d?.agreedPriceCents ?? 0)
      ? SponsorDealPaymentStatus.PAID
      : paidTotalCents > 0 ? SponsorDealPaymentStatus.PARTIALLY_PAID : SponsorDealPaymentStatus.UNPAID;

    const updated = await tx.sponsorDeal.update({
      where: { id: dealId },
      data: { paidTotalCents, paymentStatus },
    });

    return [p, updated];
  });

  return NextResponse.json({ ok: true, payment, deal }, { status: 201 });
}
