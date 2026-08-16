import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { normalizeSpaceConceptKey } from "@/lib/locations";

const ADMIN_ROLES = ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"];
function isSpacesAdmin(roles: string[]) {
  return roles.some((r) => ADMIN_ROLES.includes(r));
}

/** Shared include shape — matches the list endpoint so every mutation response
 *  carries venue + active holds that the client can merge in directly. */
const SPACE_INCLUDE = {
  venue: { select: { id: true, name: true, slug: true } },
  capacityHolds: {
    where: { status: "ACTIVE" as const },
    select: { id: true, partySize: true },
    orderBy: { startAt: "asc" as const },
  },
} as const;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession();
    if (!isSpacesAdmin(s.roles)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }

  const { id } = await params;
  const space = await prisma.restaurantSpace.findUnique({
    where: { id },
    include: {
      venue: { select: { id: true, name: true, slug: true } },
      capacityHolds: {
        where: { status: "ACTIVE" },
        select: { id: true, partySize: true, startAt: true, endAt: true, reservationId: true },
        orderBy: { startAt: "asc" },
        take: 20,
      },
    },
  });
  if (!space) return NextResponse.json({ ok: false, error: "Space not found" }, { status: 404 });
  return NextResponse.json({ ok: true, data: space });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession();
    if (!isSpacesAdmin(s.roles)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { name, conceptKey, capacity, reservable, requiresApproval, weatherSensitive, sortOrder, isActive, depositRequiredCents } = body;

  const existing = await prisma.restaurantSpace.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: "Space not found" }, { status: 404 });

  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = name;
  if (conceptKey !== undefined) {
    const normalized = normalizeSpaceConceptKey(conceptKey);
    if (!normalized) return NextResponse.json({ ok: false, error: "A valid operational key is required" }, { status: 400 });
    update.conceptKey = normalized;
  }
  if (capacity !== undefined) {
    if (typeof capacity !== "number" || capacity < 1)
      return NextResponse.json({ ok: false, error: "capacity must be a positive number" }, { status: 400 });
    update.capacity = capacity;
  }
  if (reservable !== undefined) update.reservable = reservable;
  if (requiresApproval !== undefined) update.requiresApproval = requiresApproval;
  if (weatherSensitive !== undefined) update.weatherSensitive = weatherSensitive;
  if (sortOrder !== undefined) update.sortOrder = sortOrder;
  if (isActive !== undefined) update.isActive = isActive;
  if (depositRequiredCents !== undefined) {
    if (depositRequiredCents !== null) {
      if (typeof depositRequiredCents !== "number" || !Number.isInteger(depositRequiredCents) || depositRequiredCents < 1)
        return NextResponse.json({ ok: false, error: "depositRequiredCents must be a positive integer or null" }, { status: 400 });
    }
    update.depositRequiredCents = depositRequiredCents;
  }

  try {
    const space = await prisma.restaurantSpace.update({
      where: { id },
      data: update,
      include: SPACE_INCLUDE,
    });
    return NextResponse.json({ ok: true, data: space });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "P2002") {
      return NextResponse.json({ ok: false, error: "A space with that name already exists in this venue" }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: "Failed to update space" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const s = await requireSession();
    if (!isSpacesAdmin(s.roles)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  } catch (e) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "Unauthorized" }, { status: err.status ?? 401 });
  }

  const { id } = await params;
  const existing = await prisma.restaurantSpace.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return NextResponse.json({ ok: false, error: "Space not found" }, { status: 404 });

  // Soft-delete: deactivate rather than hard delete to preserve hold history
  const space = await prisma.restaurantSpace.update({
    where: { id },
    data: { isActive: false },
    include: SPACE_INCLUDE,
  });
  return NextResponse.json({ ok: true, data: space });
}
