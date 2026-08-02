import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

const ADMIN_ROLES = ["SUPERADMIN", "ADMIN_COMMERCIAL"];
function isSpacesAdmin(roles: string[]) {
  return roles.some((r) => ADMIN_ROLES.includes(r));
}

export async function GET() {
  try {
    const s = await requireSession();
    if (!isSpacesAdmin(s.roles)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }

  const spaces = await prisma.restaurantSpace.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      venue: { select: { id: true, name: true, slug: true } },
      _count: { select: { capacityHolds: { where: { status: "ACTIVE" } } } },
    },
  });

  return NextResponse.json({ ok: true, data: spaces });
}

export async function POST(req: NextRequest) {
  try {
    const s = await requireSession();
    if (!isSpacesAdmin(s.roles)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }

  const body = await req.json();
  const { venueId, name, capacity, reservable, requiresApproval, weatherSensitive, sortOrder } = body;

  if (!venueId || !name || capacity == null) {
    return NextResponse.json({ ok: false, error: "venueId, name, and capacity are required" }, { status: 400 });
  }
  if (typeof capacity !== "number" || capacity < 1) {
    return NextResponse.json({ ok: false, error: "capacity must be a positive number" }, { status: 400 });
  }

  // Check venue exists
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
  if (!venue) return NextResponse.json({ ok: false, error: "Venue not found" }, { status: 404 });

  try {
    const space = await prisma.restaurantSpace.create({
      data: {
        venueId,
        name,
        capacity: Number(capacity),
        reservable: reservable ?? true,
        requiresApproval: requiresApproval ?? false,
        weatherSensitive: weatherSensitive ?? false,
        sortOrder: sortOrder ?? 0,
        isActive: true,
      },
    });
    return NextResponse.json({ ok: true, data: space }, { status: 201 });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err.code === "P2002") {
      return NextResponse.json({ ok: false, error: "A space with that name already exists in this venue" }, { status: 409 });
    }
    console.error("[POST /api/v1/admin/spaces]", e);
    return NextResponse.json({ ok: false, error: "Failed to create space" }, { status: 500 });
  }
}
