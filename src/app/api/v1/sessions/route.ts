import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const after = searchParams.get("after");
  const before = searchParams.get("before");

  const now = new Date();
  const afterDate = after ? new Date(after) : now;
  const beforeDate = before
    ? new Date(before)
    : new Date(now.getFullYear(), now.getMonth() + 3, 1);

  const sessions = await prisma.session.findMany({
    where: {
      status: "SCHEDULED",
      startsAt: { gte: afterDate, lte: beforeDate },
      series: { status: { in: ["PUBLISHED", "SOLD_OUT"] } },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      capacity: true,
      soldCount: true,
      status: true,
      series: {
        select: {
          id: true,
          slug: true,
          title: true,
          venue: true,
          heroImageUrl: true,
        },
      },
    },
  });

  return NextResponse.json({ sessions });
}
