import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { getShareSurfaceForPartner } from "@/server/referrals/referrerShareSurfaceService";

const PARTNER_ROLES = new Set(["PARTNER", "PARTNER_OWNER"]);

export async function GET() {
  let userId: string;
  let roles: string[];
  try {
    ({ userId, roles } = await requireSession());
  } catch (e) {
    const status = (e as { status?: number }).status ?? 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
  if (!roles.some((r) => PARTNER_ROLES.has(r))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const profile = await prisma.partnerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) {
    return NextResponse.json({ error: "No partner profile" }, { status: 404 });
  }
  const surface = await getShareSurfaceForPartner(profile.id);
  return NextResponse.json(surface);
}
