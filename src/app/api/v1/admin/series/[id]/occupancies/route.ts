import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createReservationConflictRecords } from "@/server/events/eventOccupancyService";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"].includes(r));
}

const occupancyBody = z.object({
  sessionId: z.string().optional(),
  scope: z.enum(["SPACE", "VENUE"]),
  policy: z.enum(["EXCLUSIVE", "COEXIST"]).default("EXCLUSIVE"),
  spaceId: z.string().nullable().optional(),
  eventStartsAt: z.string().datetime(),
  eventEndsAt: z.string().datetime(),
  setupMinutes: z.number().int().min(0).max(720).default(0),
  resetMinutes: z.number().int().min(0).max(720).default(0),
  guestMessageEn: z.string().trim().max(160).optional(),
  guestMessageEs: z.string().trim().max(160).optional(),
  guestMessagePt: z.string().trim().max(160).optional(),
});

async function lockAffectedSpaces(tx: Prisma.TransactionClient, venueId: string, scope: "SPACE" | "VENUE", spaceId: string | null) {
  const ids = scope === "VENUE"
    ? (await tx.restaurantSpace.findMany({ where: { venueId }, select: { id: true }, orderBy: { id: "asc" } })).map((s: { id: string }) => s.id)
    : spaceId ? [spaceId] : [];
  for (const id of ids) await tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${id}))`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id: seriesId } = await params;
  const occupancies = await prisma.eventSpaceOccupancy.findMany({
    where: { seriesId }, orderBy: { blockStartsAt: "asc" },
    include: { space: { select: { id: true, name: true } }, session: { select: { id: true, startsAt: true, endsAt: true, status: true } }, _count: { select: { reservationConflicts: true } } },
  });
  return NextResponse.json({ occupancies });
}

/**
 * Creates an operational event block. Existing reservations are never cancelled
 * here: conflicts are recorded for the manager workflow. Only ACTIVE +
 * EXCLUSIVE blocks affect public availability.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as { id: string }).id;
  const { id: seriesId } = await params;
  const parsed = occupancyBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid occupancy", details: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const eventStartsAt = new Date(body.eventStartsAt);
  const eventEndsAt = new Date(body.eventEndsAt);
  if (eventEndsAt <= eventStartsAt) return NextResponse.json({ error: "Event end must be after event start" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const series = await tx.series.findUnique({ where: { id: seriesId }, select: { id: true, venueId: true, spaceId: true, status: true } });
      if (!series?.venueId) throw new Error("SERIES_VENUE_REQUIRED");
      const spaceId = body.scope === "SPACE" ? (body.spaceId ?? series.spaceId) : null;
      if (body.scope === "SPACE" && !spaceId) throw new Error("SPACE_REQUIRED");
      if (spaceId) {
        const valid = await tx.restaurantSpace.findFirst({ where: { id: spaceId, venueId: series.venueId, isActive: true }, select: { id: true } });
        if (!valid) throw new Error("INVALID_SPACE");
      }
      if (body.sessionId) {
        const validSession = await tx.session.findFirst({ where: { id: body.sessionId, seriesId }, select: { id: true } });
        if (!validSession) throw new Error("INVALID_SESSION");
      }
      await lockAffectedSpaces(tx, series.venueId, body.scope, spaceId);
      const occupancy = await tx.eventSpaceOccupancy.create({ data: {
        seriesId, sessionId: body.sessionId, venueId: series.venueId, spaceId,
        scope: body.scope, policy: body.policy,
        // A draft series cannot silently block diners. Publishing activates it.
        status: series.status === "PUBLISHED" ? "ACTIVE" : "DRAFT",
        eventStartsAt, eventEndsAt,
        blockStartsAt: new Date(eventStartsAt.getTime() - body.setupMinutes * 60_000),
        blockEndsAt: new Date(eventEndsAt.getTime() + body.resetMinutes * 60_000),
        setupMinutes: body.setupMinutes, resetMinutes: body.resetMinutes,
        guestMessageEn: body.guestMessageEn || null, guestMessageEs: body.guestMessageEs || null, guestMessagePt: body.guestMessagePt || null,
        createdByUserId: actorId,
      } });
      const conflicts = await createReservationConflictRecords(tx, occupancy);
      // The creator receives the result immediately, but the conflict is also
      // placed in the in-app inbox of the restaurant decision-makers. This is
      // durable operational notice, not a best-effort browser toast.
      if (conflicts.length) {
        const recipients = await tx.user.findMany({
          where: { roles: { some: { roleKey: { in: ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"] } } } },
          select: { id: true },
        });
        await tx.notification.createMany({
          data: recipients.map((user) => ({
            userId: user.id,
            title: "Reservations need review for an event block",
            body: `${conflicts.length} existing reservation(s) overlap this new ${body.scope === "VENUE" ? "whole-restaurant" : "space"} event block. No guest was cancelled automatically.`,
            href: `/admin/experiences/${seriesId}`,
          })),
        });
      }
      await tx.auditLog.create({ data: { actorId, action: "EVENT_OCCUPANCY_CREATED", metadata: { seriesId, occupancyId: occupancy.id, scope: body.scope, policy: body.policy, conflicts: conflicts.length } } });
      return { occupancy, conflictCount: conflicts.length };
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    const code = err?.message;
    const message = code === "SPACE_REQUIRED" ? "Select a physical space for a space-specific event." : code === "INVALID_SPACE" ? "Space must be active and belong to this restaurant." : code === "INVALID_SESSION" ? "Session does not belong to this series." : code === "SERIES_VENUE_REQUIRED" ? "Select the restaurant before scheduling this event." : "Could not create event occupancy.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const updateBody = z.object({ id: z.string(), status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "POSTPONED", "CANCELLED"]) });

/** Pause/postpone/cancel is a deliberate operator action; it releases future
 * public booking blocks without deleting history or hiding conflict records. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const actorId = (session!.user as { id: string }).id;
  const { id: seriesId } = await params;
  const parsed = updateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid occupancy update" }, { status: 400 });
  const occupancy = await prisma.eventSpaceOccupancy.findFirst({ where: { id: parsed.data.id, seriesId }, select: { id: true, venueId: true, scope: true, spaceId: true, series: { select: { status: true } } } });
  if (!occupancy) return NextResponse.json({ error: "Occupancy not found" }, { status: 404 });
  if (parsed.data.status === "ACTIVE" && occupancy.series.status !== "PUBLISHED") {
    return NextResponse.json({ error: "Publish the event before activating a dining block." }, { status: 409 });
  }
  const updated = await prisma.$transaction(async (tx) => {
    await lockAffectedSpaces(tx, occupancy.venueId, occupancy.scope, occupancy.spaceId);
    const value = await tx.eventSpaceOccupancy.update({ where: { id: occupancy.id }, data: { status: parsed.data.status } });
    await tx.auditLog.create({ data: { actorId, action: "EVENT_OCCUPANCY_STATUS_CHANGED", metadata: { seriesId, occupancyId: occupancy.id, status: parsed.data.status } } });
    return value;
  });
  return NextResponse.json({ occupancy: updated });
}
