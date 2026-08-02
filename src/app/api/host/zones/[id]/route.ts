import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Setting broadcast wait times is operational floor control — restaurant
  // hosts / admins only. This route was previously unauthenticated.
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "host:reservations:checkin");
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }
  const { id } = await params;
  const body = await req.json();
  const { currentWaitMinutes } = body;

  if (typeof currentWaitMinutes !== "number" && currentWaitMinutes !== null) {
    return NextResponse.json({ error: "Invalid wait time" }, { status: 400 });
  }

  const zone = await prisma.zone.update({
    where: { id },
    data: { currentWaitMinutes },
  });

  return NextResponse.json({ id: zone.id, currentWaitMinutes: zone.currentWaitMinutes });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const zone = await prisma.zone.findUnique({
    where: { id },
    select: { id: true, name: true, currentWaitMinutes: true },
  });
  if (!zone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(zone);
}
