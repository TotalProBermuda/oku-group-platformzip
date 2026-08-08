import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { Prisma, ReviewQueueStatus } from "@prisma/client";

const VALID_REVIEW_QUEUE_STATUSES = new Set<string>(Object.values(ReviewQueueStatus));

export async function GET(req: NextRequest) {
  const { roles } = await requireSession();
  if (!roles.includes("SUPERADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const venueId = searchParams.get("venueId");
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const skip = (page - 1) * limit;

  if (status && !VALID_REVIEW_QUEUE_STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: `Invalid status value: ${status}` }, { status: 400 });
  }

  const where: Prisma.IntegrationReviewQueueWhereInput = {};
  if (venueId) where.venueId = venueId;
  if (status) where.status = status as ReviewQueueStatus;

  const [items, total] = await Promise.all([
    prisma.integrationReviewQueue.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.integrationReviewQueue.count({ where }),
  ]);

  return NextResponse.json({ ok: true, data: items, total, page, limit });
}
