import { NextResponse } from "next/server";
import { getOptionalSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await getOptionalSession();
  if (!auth) {
    return NextResponse.json({ membership: null });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId: auth.userId },
    select: {
      id: true,
      tier: true,
      status: true,
      startsAt: true,
      renewsAt: true,
      cancelAtPeriodEnd: true,
      priceAnnualCents: true,
      currency: true,
      avacaContributionBps: true,
      benefitsJson: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ membership });
}
