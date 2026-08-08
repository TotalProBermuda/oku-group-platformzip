import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import type { Prisma } from "@prisma/client";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const update: Prisma.ReservationBlockUpdateInput = {};
    if (body.groupLabel !== undefined) update.groupLabel = String(body.groupLabel);
    if (body.expectedCount !== undefined) update.expectedCount = Math.max(1, parseInt(body.expectedCount, 10) || 1);
    if (body.giftBagEnabled !== undefined) update.giftBagEnabled = Boolean(body.giftBagEnabled);

    const block = await prisma.reservationBlock.update({
      where: { id },
      data: update,
      include: {
        arrivals: { select: { id: true, partySize: true, arrivedAt: true } },
        session: { select: { id: true, title: true, startsAt: true } },
      },
    });

    return NextResponse.json({ ok: true, data: block });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.reservationBlock.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
