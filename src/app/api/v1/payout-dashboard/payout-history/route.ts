import { NextResponse } from "next/server";


import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import {
  commissionWhereForEarner,
  resolveEarnerScopeForReferrer,
} from "@/server/commissions/earnerScope";

export async function GET() {
  const auth = await getOptionalSession();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = auth.userId;
  const roles: string[] = auth.roles;

  const isInfluencer = roles.includes("INFLUENCER");
  const isReferrer = roles.includes("REFERRER") || roles.includes("STREETSIDE_HOST") ||
    roles.includes("RESTAURANT_HOST");

  if (isInfluencer) {
    const profile = await prisma.influencerProfile.findUnique({ where: { userId } });
    if (!profile) return NextResponse.json({ error: "No influencer profile" }, { status: 403 });

    const paid = await prisma.ledgerEntry.findMany({
      where: { influencerId: profile.id, type: "COMMISSION_PAID" },
      include: { order: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    });

    const rows = paid.map((e, i) => ({
      id: e.id,
      batchId: `PAY-INF-${e.id.slice(0, 8).toUpperCase()}`,
      payoutDate: e.createdAt,
      amountCents: e.amountCents,
      payerType: "OKU",
      payerDisplayName: "OKU Hospitality Group",
      coveredItemCount: 1,
      method: "BANK_TRANSFER",
      status: "PAID",
      currency: e.currency,
      notes: e.note,
    }));

    return NextResponse.json({ ok: true, rows });
  }

  if (isReferrer) {
    const referrer = await prisma.referrer.findUnique({ where: { userId } });
    if (!referrer) return NextResponse.json({ error: "No referrer profile" }, { status: 403 });

    const earnerScope = (await resolveEarnerScopeForReferrer(referrer.id))!;
    const paid = await prisma.commissionEntry.findMany({
      where: { ...commissionWhereForEarner(earnerScope), status: "PAID" },
      orderBy: { updatedAt: "desc" },
    });

    const rows = paid.map(e => ({
      id: e.id,
      batchId: `PAY-REF-${e.id.slice(0, 8).toUpperCase()}`,
      payoutDate: e.updatedAt,
      amountCents: e.amountCents,
      payerType: "OKU",
      payerDisplayName: "OKU Hospitality Group",
      coveredItemCount: 1,
      method: "BANK_TRANSFER",
      status: "PAID",
      currency: e.currency,
      notes: e.reason,
    }));

    return NextResponse.json({ ok: true, rows });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
