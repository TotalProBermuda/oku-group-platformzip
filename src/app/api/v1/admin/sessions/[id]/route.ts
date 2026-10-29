import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import type { Prisma } from "@prisma/client";

function parseSaleDate(value: unknown): Date | null | "INVALID" {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? "INVALID" : date;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const session = await prisma.session.findUnique({
      where: { id },
      select: {
        id: true, title: true, startsAt: true, endsAt: true,
        giftBagEnabled: true, streetsideEnabled: true,
        ticketSalesMode: true, ticketSalesStartAt: true, ticketSalesEndAt: true,
      },
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

    const current = await prisma.session.findUnique({
      where: { id },
      select: { id: true, ticketSalesStartAt: true, ticketSalesEndAt: true },
    });
    if (!current) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });

    const update: Prisma.SessionUpdateInput = {};
    if (body.giftBagEnabled !== undefined) update.giftBagEnabled = Boolean(body.giftBagEnabled);
    if (body.streetsideEnabled !== undefined) update.streetsideEnabled = Boolean(body.streetsideEnabled);
    if (body.ticketSalesMode !== undefined) {
      if (!["INHERIT", "OVERRIDE"].includes(body.ticketSalesMode)) {
        return NextResponse.json({ ok: false, error: "ticketSalesMode must be INHERIT or OVERRIDE" }, { status: 400 });
      }
      update.ticketSalesMode = body.ticketSalesMode;
    }
    const startsAt = body.ticketSalesStartAt === undefined ? current.ticketSalesStartAt : parseSaleDate(body.ticketSalesStartAt);
    const endsAt = body.ticketSalesEndAt === undefined ? current.ticketSalesEndAt : parseSaleDate(body.ticketSalesEndAt);
    if (startsAt === "INVALID") {
      return NextResponse.json({ ok: false, error: "Invalid ticket sale start date" }, { status: 400 });
    }
    if (endsAt === "INVALID") {
      return NextResponse.json({ ok: false, error: "Invalid ticket sale end date" }, { status: 400 });
    }
    if (startsAt && endsAt && endsAt <= startsAt) {
      return NextResponse.json({ ok: false, error: "Ticket sale end must be after its start" }, { status: 400 });
    }
    if (body.ticketSalesStartAt !== undefined) update.ticketSalesStartAt = startsAt;
    if (body.ticketSalesEndAt !== undefined) update.ticketSalesEndAt = endsAt;

    const session = await prisma.session.update({
      where: { id },
      data: update,
      select: {
        id: true, title: true, startsAt: true, endsAt: true,
        giftBagEnabled: true, streetsideEnabled: true,
        ticketSalesMode: true, ticketSalesStartAt: true, ticketSalesEndAt: true,
      },
    });

    return NextResponse.json({ ok: true, data: session });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
