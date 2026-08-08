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
    const userId = searchParams.get("userId");

    if (userId) {
      const config = await prisma.streetsideScanConfig.findUnique({ where: { userId } });
      return NextResponse.json({ ok: true, data: config });
    }

    // Return all streetside hosts with their configs
    const streetsideHosts = await prisma.user.findMany({
      where: { roles: { some: { roleKey: "STREETSIDE_HOST" } } },
      select: {
        id: true,
        name: true,
        email: true,
        streetsideScanConfig: true,
      },
      orderBy: { name: "asc" },
    });

    const globalDefault = await prisma.streetsideScanConfig.findFirst({
      where: { isGlobalDefault: true },
    });

    return NextResponse.json({ ok: true, data: { streetsideHosts, globalDefault } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { userId, isGlobalDefault, canScanMembers, canScanTickets, canScanReservationBlocks } = body;

    if (!userId && !isGlobalDefault) {
      return NextResponse.json({ ok: false, error: "userId or isGlobalDefault required" }, { status: 400 });
    }

    const data = {
      canScanMembers: canScanMembers ?? true,
      canScanTickets: canScanTickets ?? false,
      canScanReservationBlocks: canScanReservationBlocks ?? false,
    };

    let config;
    if (isGlobalDefault) {
      const existing = await prisma.streetsideScanConfig.findFirst({ where: { isGlobalDefault: true } });
      if (existing) {
        config = await prisma.streetsideScanConfig.update({ where: { id: existing.id }, data });
      } else {
        config = await prisma.streetsideScanConfig.create({ data: { isGlobalDefault: true, ...data } });
      }
    } else {
      config = await prisma.streetsideScanConfig.upsert({
        where: { userId },
        create: { userId, ...data },
        update: { ...data },
      });
    }

    return NextResponse.json({ ok: true, data: config });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
