import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as { id?: string }).id;
  const roles: string[] = (session.user as { roles?: string[] }).roles ?? [];

  if (!roles.includes("STREETSIDE_HOST") && !roles.some((r) => ["SUPERADMIN", "ADMIN_COMMERCIAL"].includes(r))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { isOnShift } = body as { isOnShift?: boolean };
  if (typeof isOnShift !== "boolean") {
    return NextResponse.json({ ok: false, error: "isOnShift (boolean) required" }, { status: 400 });
  }

  const profile = await prisma.restaurantHostProfile.findUnique({ where: { userId } });
  if (!profile) return NextResponse.json({ ok: false, error: "Host profile not found" }, { status: 404 });

  const updated = await prisma.restaurantHostProfile.update({
    where: { id: profile.id },
    data: { isActive: isOnShift },
  });

  return NextResponse.json({ ok: true, isOnShift: updated.isActive });
}
