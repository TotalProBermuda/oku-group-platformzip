import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const plans = await prisma.membershipPlanConfig.findMany({
    where: { active: true },
    orderBy: { priceAnnualCents: "asc" },
  });
  return NextResponse.json({ plans });
}
