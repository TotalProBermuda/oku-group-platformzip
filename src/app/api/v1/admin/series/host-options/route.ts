import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/rbac";
import { requireSession } from "@/server/auth/session";

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:experiences:write");
    const [influencers, partners] = await Promise.all([
      prisma.influencerProfile.findMany({
        select: {
          id: true,
          displayName: true,
          handle: true,
          approved: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.partnerProfile.findMany({
        select: {
          id: true,
          name: true,
          approved: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return NextResponse.json({ ok: true, data: { influencers, partners } });
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load host options." }, { status });
  }
}
