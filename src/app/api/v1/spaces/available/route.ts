/**
 * GET /api/v1/spaces/available
 *
 * Public endpoint — no auth required. Returns active, reservable
 * RestaurantSpaces for a venue with real-time cover availability for the
 * requested time window (overlap-aware, same logic as capacityService).
 *
 * Query params:
 *   venueSlug  — venue slug (default: "gold-house")
 *   date       — YYYY-MM-DD (required)
 *   time       — HH:MM in 24-hour format (required)
 *   partySize  — integer (default: 2)
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHeldCovers, DEFAULT_DURATION_MINUTES } from "@/server/spaces/capacityService";

/** Derive a Zone conceptKey from a RestaurantSpace name. */
function deriveConceptKey(spaceName: string): string {
  const lower = spaceName.toLowerCase();
  if (lower.includes("catch")) return "CATCH";
  if (lower.includes("terrace")) return "TERRACE";
  return "OKU"; // OKÜ Dining Room, VIP, or any unlabelled space
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const venueSlug = searchParams.get("venueSlug") ?? "gold-house";
  const date = searchParams.get("date");        // YYYY-MM-DD
  const time = searchParams.get("time");        // HH:MM
  const partySize = Math.max(1, parseInt(searchParams.get("partySize") ?? "2", 10));

  if (!date || !time) {
    return NextResponse.json(
      { error: "date (YYYY-MM-DD) and time (HH:MM) are required" },
      { status: 400 }
    );
  }

  // Validate date/time format to avoid injection
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return NextResponse.json({ error: "Invalid date or time format" }, { status: 400 });
  }

  const startAt = new Date(`${date}T${time}:00`);
  if (isNaN(startAt.getTime())) {
    return NextResponse.json({ error: "Invalid date/time combination" }, { status: 400 });
  }
  const endAt = new Date(startAt.getTime() + DEFAULT_DURATION_MINUTES * 60_000);

  const venue = await prisma.venue.findFirst({ where: { slug: venueSlug } });
  if (!venue) {
    return NextResponse.json({ error: "Venue not found" }, { status: 404 });
  }

  const spaces = await prisma.restaurantSpace.findMany({
    where: { venueId: venue.id, isActive: true, reservable: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      name: true,
      capacity: true,
      requiresApproval: true,
      weatherSensitive: true,
    },
  });

  // Compute availability in parallel — same overlap formula as capacityService
  const result = await Promise.all(
    spaces.map(async (s) => {
      const held = await getHeldCovers(s.id, startAt, endAt);
      const available = s.capacity - held;
      return {
        id: s.id,
        name: s.name,
        capacity: s.capacity,
        held,
        available: Math.max(0, available),
        isAvailable: available >= partySize,
        requiresApproval: s.requiresApproval,
        weatherSensitive: s.weatherSensitive,
        /** Derived from space name — used by the frontend to set conceptRequested. */
        conceptKey: deriveConceptKey(s.name),
      };
    })
  );

  return NextResponse.json({
    spaces: result,
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    durationMinutes: DEFAULT_DURATION_MINUTES,
  });
}
