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
import { findBlockingOccupancy } from "@/server/events/eventOccupancyService";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const venueSlug = searchParams.get("venueSlug") ?? "gold-house";
  const date = searchParams.get("date");        // YYYY-MM-DD
  const time = searchParams.get("time");        // HH:MM
  const partySize = Math.max(1, parseInt(searchParams.get("partySize") ?? "2", 10));
  const locale = searchParams.get("locale") ?? "en";

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
      conceptKey: true,
      capacity: true,
      requiresApproval: true,
      weatherSensitive: true,
    },
  });

  // Compute availability in parallel — same overlap formula as capacityService
  const result = await Promise.all(
    spaces.map(async (s) => {
      const [held, occupancy] = await Promise.all([
        getHeldCovers(s.id, startAt, endAt),
        findBlockingOccupancy(prisma, { venueId: venue.id, spaceId: s.id, startAt, endAt, locale }),
      ]);
      const available = s.capacity - held;
      return {
        id: s.id,
        name: s.name,
        capacity: s.capacity,
        held,
        available: Math.max(0, available),
        // Event/buyout occupancy always wins over ordinary dining capacity.
        isAvailable: !occupancy && available >= partySize,
        requiresApproval: s.requiresApproval,
        weatherSensitive: s.weatherSensitive,
        /** Stable data key used by the booking flow and POS mapping. */
        conceptKey: s.conceptKey,
        // Safe public descriptor only. Private events never expose their title,
        // image, URL, ticket status, or any reservation/customer data.
        eventConflict: occupancy?.card ?? null,
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
