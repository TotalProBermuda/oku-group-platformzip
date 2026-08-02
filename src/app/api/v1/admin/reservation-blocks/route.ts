import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

export async function GET(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const seriesId = searchParams.get("seriesId");
    const sessionId = searchParams.get("sessionId");

    const where: any = {};
    if (seriesId) where.seriesId = seriesId;
    if (sessionId) where.sessionId = sessionId;

    const blocks = await prisma.reservationBlock.findMany({
      where,
      include: {
        arrivals: { select: { id: true, partySize: true, arrivedAt: true } },
        session: { select: { id: true, title: true, startsAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, data: blocks });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { seriesId, sessionId, groupLabel, expectedCount, giftBagEnabled } = body;

    if (!seriesId || !groupLabel || !expectedCount) {
      return NextResponse.json({ ok: false, error: "seriesId, groupLabel, and expectedCount are required" }, { status: 400 });
    }

    const block = await prisma.reservationBlock.create({
      data: {
        seriesId,
        sessionId: sessionId || null,
        groupLabel,
        expectedCount: parseInt(expectedCount),
        giftBagEnabled: giftBagEnabled ?? false,
      },
      include: {
        arrivals: true,
        session: { select: { id: true, title: true, startsAt: true } },
      },
    });

    return NextResponse.json({ ok: true, data: block });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
