import { NextResponse } from "next/server";


import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import {
  commissionWhereForEarner,
  resolveEarnerScopeForReferrer,
} from "@/server/commissions/earnerScope";

function periodKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function aggregateByPeriod(rows: { date: Date; amountCents: number }[]) {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = periodKey(r.date);
    map.set(k, (map.get(k) ?? 0) + r.amountCents);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, amountCents]) => ({ period, amountCents }));
}

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

    const ledger = await prisma.ledgerEntry.findMany({
      where: { influencerId: profile.id },
      select: { type: true, amountCents: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const earned = ledger
      .filter(e => e.type === "COMMISSION_EARNED")
      .map(e => ({ date: e.createdAt, amountCents: e.amountCents }));

    const paid = ledger
      .filter(e => e.type === "COMMISSION_PAID")
      .map(e => ({ date: e.createdAt, amountCents: e.amountCents }));

    return NextResponse.json({
      ok: true,
      earningsTrend: aggregateByPeriod(earned),
      payoutTrend: aggregateByPeriod(paid),
    });
  }

  if (isReferrer) {
    const referrer = await prisma.referrer.findUnique({ where: { userId } });
    if (!referrer) return NextResponse.json({ error: "No referrer profile" }, { status: 403 });

    const earnerScope = (await resolveEarnerScopeForReferrer(referrer.id))!;
    const commissions = await prisma.commissionEntry.findMany({
      where: commissionWhereForEarner(earnerScope),
      select: { status: true, amountCents: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    });

    const earned = commissions
      .filter(c => c.status === "APPROVED" || c.status === "PAID")
      .map(c => ({ date: c.createdAt, amountCents: c.amountCents }));

    const paid = commissions
      .filter(c => c.status === "PAID")
      .map(c => ({ date: c.updatedAt, amountCents: c.amountCents }));

    return NextResponse.json({
      ok: true,
      earningsTrend: aggregateByPeriod(earned),
      payoutTrend: aggregateByPeriod(paid),
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
