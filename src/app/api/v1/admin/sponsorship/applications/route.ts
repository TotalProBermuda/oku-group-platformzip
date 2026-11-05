import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SponsorApplicationStatus } from "@prisma/client";

function isAdmin(s: Session | null) {
  return s?.user?.roles?.includes("SUPERADMIN") ?? false;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const statusRaw = searchParams.get("status") ?? "";
  const status = statusRaw ? Object.values(SponsorApplicationStatus).find((value) => value === statusRaw) : undefined;
  if (statusRaw && !status) return NextResponse.json({ ok: false, error: "Invalid application status" }, { status: 400 });
  const slotId = searchParams.get("slotId") ?? "";

  const applications = await prisma.sponsorApplication.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(slotId ? { slotId } : {}),
    },
    include: {
      slot:   { select: { id: true, title: true, category: true, series: { select: { id: true, title: true } } } },
      entity: { select: { id: true, displayName: true, logoUrl: true, type: true } },
      deal:   { select: { id: true, paymentStatus: true, agreedPriceCents: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({ ok: true, applications });
}
