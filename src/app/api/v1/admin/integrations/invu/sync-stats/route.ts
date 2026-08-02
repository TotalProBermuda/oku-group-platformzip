import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { roles } = await requireSession();
  if (!roles.includes("SUPERADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const venueId = searchParams.get("venueId") || undefined;

  const where = venueId ? { venueId } : {};

  const [
    rawCount,
    normalizedCount,
    sessionTotal,
    reviewOpenCount,
    reviewInReviewCount,
    matchedCount,
    unmatchedCount,
    disputedCount,
  ] = await Promise.all([
    prisma.invuOrderRaw.count({ where }),
    prisma.invuOrderNormalized.count({ where }),
    prisma.tableSession.count({ where }),
    prisma.integrationReviewQueue.count({ where: { ...where, status: "OPEN" } }),
    prisma.integrationReviewQueue.count({ where: { ...where, status: "IN_REVIEW" } }),
    prisma.tableSession.count({ where: { ...where, matchMethod: { in: ["AUTO", "MANUAL"] } } }),
    prisma.tableSession.count({ where: { ...where, matchMethod: "UNMATCHED" } }),
    prisma.tableSession.count({ where: { ...where, status: "DISPUTED" } }),
  ]);

  return NextResponse.json({
    ok: true,
    data: {
      rawCount,
      normalizedCount,
      sessionTotal,
      reviewOpenCount,
      reviewInReviewCount,
      matchedCount,
      unmatchedCount,
      disputedCount,
    },
  });
}
