import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { getHostAnalytics } from "@/server/host/hostService";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { roles } = await requireSession();
  const isAllowed = roles.some(r => ["SUPERADMIN", "ADMIN_COMMERCIAL", "RESTAURANT_HOST"].includes(r));
  if (!isAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days") ?? 30);

  const venue = await prisma.venue.findFirst();
  if (!venue) return NextResponse.json({ ok: true, data: null });

  const analytics = await getHostAnalytics(venue.id, days);
  return NextResponse.json({ ok: true, data: analytics });
}
