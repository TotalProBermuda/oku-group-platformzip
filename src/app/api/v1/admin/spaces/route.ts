import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { normalizeSpaceConceptKey } from "@/lib/locations";

const ADMIN_ROLES = ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"];
function isSpacesAdmin(roles: string[]) {
  return roles.some((r) => ADMIN_ROLES.includes(r));
}

/** Shared include shape — used by GET list, POST, PATCH, DELETE so every
 *  mutation response carries the same shape the client expects to merge. */
const SPACE_INCLUDE = {
  venue: { select: { id: true, name: true, slug: true } },
  capacityHolds: {
    where: { status: "ACTIVE" as const },
    select: { id: true, partySize: true },
    orderBy: { startAt: "asc" as const },
  },
} as const;

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
    include: SPACE_INCLUDE,
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
  const { venueId, name, conceptKey, capacity, reservable, requiresApproval, weatherSensitive, sortOrder } = body;

  if (!venueId || !name || capacity == null) {
    return NextResponse.json({ ok: false, error: "venueId, name, and capacity are required" }, { status: 400 });
  }
  if (typeof capacity !== "number" || capacity < 1) {
    return NextResponse.json({ ok: false, error: "capacity must be a positive number" }, { status: 400 });
  }
  const normalizedConceptKey = normalizeSpaceConceptKey(conceptKey || name);
  if (!normalizedConceptKey) return NextResponse.json({ ok: false, error: "A valid operational key is required" }, { status: 400 });

  // Check venue exists
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
  if (!venue) return NextResponse.json({ ok: false, error: "Venue not found" }, { status: 404 });

  try {
    const space = await prisma.restaurantSpace.create({
      data: {
        venueId,
        name,
        conceptKey: normalizedConceptKey,
        capacity: Number(capacity),
        reservable: reservable ?? true,
        requiresApproval: requiresApproval ?? false,
        weatherSensitive: weatherSensitive ?? false,
        sortOrder: sortOrder ?? 0,
        isActive: true,
      },
      include: SPACE_INCLUDE,
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
