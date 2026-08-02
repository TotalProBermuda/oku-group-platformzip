import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import type { Prisma } from "@prisma/client";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const session = await prisma.session.findUnique({
      where: { id },
      select: { id: true, title: true, startsAt: true, giftBagEnabled: true, streetsideEnabled: true },
    });

    if (!session) {
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: session });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();

    const update: Prisma.SessionUpdateInput = {};
    if (body.giftBagEnabled !== undefined) update.giftBagEnabled = Boolean(body.giftBagEnabled);
    if (body.streetsideEnabled !== undefined) update.streetsideEnabled = Boolean(body.streetsideEnabled);

    const session = await prisma.session.update({
      where: { id },
      data: update,
      select: { id: true, title: true, startsAt: true, giftBagEnabled: true, streetsideEnabled: true },
    });

    return NextResponse.json({ ok: true, data: session });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
