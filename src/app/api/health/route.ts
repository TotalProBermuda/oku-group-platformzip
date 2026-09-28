import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    await prisma.$queryRaw`SELECT 1`;

    try {
      await prisma.commerceSettings.findUnique({
        where: { id: "global" },
        select: {
          reservationServiceStartMinutes: true,
          reservationServiceEndMinutes: true,
        },
      });
    } catch {
      return NextResponse.json(
        {
          ok: false,
          checkedAt,
          checks: {
            application: "ok",
            database: "ok",
            reservationSettings: "unavailable",
          },
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        ok: true,
        checkedAt,
        checks: {
          application: "ok",
          database: "ok",
          reservationSettings: "ok",
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        checkedAt,
        checks: {
          application: "ok",
          database: "unavailable",
          reservationSettings: "unavailable",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
