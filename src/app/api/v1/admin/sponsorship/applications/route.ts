import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(s: any) {
  return s?.user?.roles?.some((r: string) => ["SUPERADMIN", "FB_DIRECTOR"].includes(r));
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "";
  const slotId = searchParams.get("slotId") ?? "";

  const applications = await prisma.sponsorApplication.findMany({
    where: {
      ...(status ? { status: status as any } : {}),
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
