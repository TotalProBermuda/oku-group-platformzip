import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { localizeSessions } from "@/server/series/localizeSessions";

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
      description: true,
      fieldModes: true,
      subtitle: true,
      flyerImageUrl: true,
      flyerImageUrlEn: true,
      flyerImageUrlEs: true,
      flyerImageUrlPt: true,
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
          subtitle: true,
          description: true,
          sessionDefaults: true,
          venue: true,
          heroImageUrl: true,
          heroImageUrlEn: true,
          heroImageUrlEs: true,
          heroImageUrlPt: true,
        },
      },
    },
  });

  const localized = await Promise.all(sessions.map(async s => (await localizeSessions(s.series, [s], searchParams.get("locale") ?? "en"))[0]));
  return NextResponse.json({ sessions: localized });
}
