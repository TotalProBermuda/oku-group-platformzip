import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Sponsorship payment creation is a financial/governance write — SUPERADMIN only.
function isAdmin(s: any) {
  return s?.user?.roles?.some((r: string) => ["SUPERADMIN"].includes(r));
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
    const paymentStatus = paidTotalCents >= (d?.agreedPriceCents ?? 0) ? "PAID"
      : paidTotalCents > 0 ? "PARTIALLY_PAID" : "UNPAID";

    const updated = await tx.sponsorDeal.update({
      where: { id: dealId },
      data: { paidTotalCents, paymentStatus: paymentStatus as any },
    });

    return [p, updated];
  });

  return NextResponse.json({ ok: true, payment, deal }, { status: 201 });
}
