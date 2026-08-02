import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { Prisma, TableSessionStatus, MatchMethod } from "@prisma/client";

const VALID_TABLE_SESSION_STATUSES = new Set<string>(Object.values(TableSessionStatus));
const VALID_MATCH_METHODS = new Set<string>(Object.values(MatchMethod));

export async function GET(req: NextRequest) {
  const { roles } = await requireSession();
  if (!roles.includes("SUPERADMIN")) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const venueId = searchParams.get("venueId");
  const status = searchParams.get("status");
  const matchMethod = searchParams.get("matchMethod");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const skip = (page - 1) * limit;

  if (status && !VALID_TABLE_SESSION_STATUSES.has(status)) {
    return NextResponse.json({ ok: false, error: `Invalid status value: ${status}` }, { status: 400 });
  }
  if (matchMethod && !VALID_MATCH_METHODS.has(matchMethod)) {
    return NextResponse.json({ ok: false, error: `Invalid matchMethod value: ${matchMethod}` }, { status: 400 });
  }

  const where: Prisma.TableSessionWhereInput = {};
  if (venueId) where.venueId = venueId;
  if (status) where.status = status as TableSessionStatus;
  if (matchMethod) where.matchMethod = matchMethod as MatchMethod;
  if (dateFrom || dateTo) {
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo) : null;
    if (fromDate && isNaN(fromDate.getTime())) {
      return NextResponse.json({ ok: false, error: `Invalid dateFrom value: ${dateFrom}` }, { status: 400 });
    }
    if (toDate && isNaN(toDate.getTime())) {
      return NextResponse.json({ ok: false, error: `Invalid dateTo value: ${dateTo}` }, { status: 400 });
    }
    where.closedAt = {};
    if (fromDate) where.closedAt.gte = fromDate;
    if (toDate) where.closedAt.lte = toDate;
  }

  const [sessions, total] = await Promise.all([
    prisma.tableSession.findMany({
      where,
      orderBy: { closedAt: "desc" },
      skip,
      take: limit,
      include: {
        venue: { select: { name: true } },
        reservation: { select: { confirmationCode: true, contactName: true } },
      },
    }),
    prisma.tableSession.count({ where }),
  ]);

  return NextResponse.json({ ok: true, data: sessions, total, page, limit });
}
