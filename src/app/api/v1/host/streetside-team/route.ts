import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
  const roles: string[] = (session.user as { roles?: string[] }).roles ?? [];
  const allowed = roles.some((r) => ["RESTAURANT_HOST", "STREETSIDE_HOST", "SUPERADMIN", "ADMIN_COMMERCIAL"].includes(r));
  if (!allowed) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });

  const profiles = await prisma.restaurantHostProfile.findMany({
    where: {
      user: { roles: { some: { roleKey: "STREETSIDE_HOST" } } },
    },
    include: {
      user: { select: { id: true, name: true, email: true, updatedAt: true } },
      venue: { select: { id: true, name: true, slug: true } },
    },
    orderBy: [{ isActive: "desc" }, { displayName: "asc" }],
  });

  return NextResponse.json({
    ok: true,
    team: profiles.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      isOnShift: p.isActive,
      badgeColor: p.badgeColor,
      venue: p.venue ? { id: p.venue.id, name: p.venue.name } : null,
      userId: p.userId,
      userEmail: p.user.email,
      lastSeen: p.user.updatedAt,
      isSelf: p.userId === userId,
    })),
  });
}
