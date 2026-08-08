import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { getHostAnalytics } from "@/server/host/hostService";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { userId, roles } = await requireSession();
  const isAllowed = roles.some(r => ["SUPERADMIN", "RESTAURANT_HOST", "RESTAURANT_SUPERVISOR"].includes(r));
  if (!isAllowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const days = Number(searchParams.get("days") ?? 30);

  // Resolve venue — RESTAURANT_HOST and RESTAURANT_SUPERVISOR must have a profile
  // to avoid cross-venue analytics disclosure. SUPERADMIN falls back to the first venue.
  let venueId: string | null = null;
  if (roles.includes("SUPERADMIN")) {
    const venue = await prisma.venue.findFirst({ select: { id: true } });
    venueId = venue?.id ?? null;
  } else {
    const profile = await prisma.restaurantHostProfile.findUnique({
      where: { userId },
      select: { venueId: true },
    });
    if (!profile?.venueId) {
      return NextResponse.json(
        { error: "Forbidden: no host profile associated with your account" },
        { status: 403 }
      );
    }
    venueId = profile.venueId;
  }

  if (!venueId) return NextResponse.json({ ok: true, data: null });

  const analytics = await getHostAnalytics(venueId, days);
  return NextResponse.json({ ok: true, data: analytics });
}
