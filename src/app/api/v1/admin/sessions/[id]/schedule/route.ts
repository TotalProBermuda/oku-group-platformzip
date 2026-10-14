import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { createReservationConflictRecords } from "@/server/events/eventOccupancyService";
import { lockOccupancySpaces } from "@/server/series/publicationLifecycle";
import { minimumSafeCapacity, updateSessionScheduleSchema } from "@/server/series/updateSessionSchedule";

class ScheduleUpdateError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles, userId } = await requireSession();
    if (!roles.includes("SUPERADMIN")) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const parsed = updateSessionScheduleSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Invalid schedule." }, { status: 400 });
    const { startsAt, endsAt, capacity } = parsed.data;
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.session.findUnique({ where: { id }, select: { id: true, startsAt: true, endsAt: true, capacity: true, soldCount: true, status: true } });
      if (!current) throw new ScheduleUpdateError(404, "Session not found.");
      const timeChanged = startsAt.getTime() !== current.startsAt.getTime() || endsAt.getTime() !== current.endsAt.getTime();
      const [activeTicketCount, existingOrderCount] = await Promise.all([
        tx.ticket.count({ where: { sessionId: id, ticketStatus: { notIn: ["CANCELLED", "REFUNDED", "VOIDED"] } } }),
        tx.order.count({ where: { sessionId: id, status: { notIn: ["FAILED", "CANCELLED"] } } }),
      ]);
      const minimumCapacity = minimumSafeCapacity(current.soldCount, activeTicketCount);
      if (capacity < minimumCapacity) throw new ScheduleUpdateError(409, "Capacity cannot be lower than " + minimumCapacity + " seats already sold or issued.");
      if (current.status !== "SCHEDULED") throw new ScheduleUpdateError(409, "Only scheduled sessions can be edited here.");
      if (timeChanged && (current.soldCount > 0 || activeTicketCount > 0 || existingOrderCount > 0)) {
        throw new ScheduleUpdateError(409, "This session has ticket or checkout history. Use the postponement workflow so attendees and orders are handled safely.");
      }
      const occupancies = timeChanged ? await tx.eventSpaceOccupancy.findMany({ where: { sessionId: id, status: "ACTIVE" }, orderBy: [{ venueId: "asc" }, { spaceId: "asc" }] }) : [];
      if (occupancies.length) {
        const openConflicts = await tx.eventReservationConflict.count({ where: { occupancyId: { in: occupancies.map((item) => item.id) }, status: "OPEN" } });
        if (openConflicts) throw new ScheduleUpdateError(409, "Resolve open host reservation conflicts before changing this session time.");
      }
      const changed = await tx.session.updateMany({ where: { id, status: "SCHEDULED", soldCount: { lte: capacity } }, data: { startsAt, endsAt, capacity } });
      if (changed.count !== 1) throw new ScheduleUpdateError(409, "Ticket inventory changed while saving. Refresh and try again.");
      let reservationConflictCount = 0;
      for (const occupancy of occupancies) {
        await lockOccupancySpaces(tx, occupancy.venueId, occupancy.scope, occupancy.spaceId);
        const synced = await tx.eventSpaceOccupancy.update({ where: { id: occupancy.id }, data: {
          eventStartsAt: startsAt, eventEndsAt: endsAt,
          blockStartsAt: new Date(startsAt.getTime() - occupancy.setupMinutes * 60_000),
          blockEndsAt: new Date(endsAt.getTime() + occupancy.resetMinutes * 60_000),
        } });
        reservationConflictCount += (await createReservationConflictRecords(tx, synced)).length;
      }
      await tx.auditLog.create({ data: { actorId: userId, action: "session.schedule.updated", metadata: {
        sessionId: id, previousStartsAt: current.startsAt.toISOString(), previousEndsAt: current.endsAt.toISOString(), previousCapacity: current.capacity,
        startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), capacity, reservationConflictCount,
      } } });
      const session = await tx.session.findUnique({ where: { id }, select: { id: true, startsAt: true, endsAt: true, capacity: true, soldCount: true, status: true } });
      return { session, reservationConflictCount };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true, data: result.session, reservationConflictCount: result.reservationConflictCount });
  } catch (error) {
    if (error instanceof ScheduleUpdateError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return NextResponse.json({ ok: false, error: "Ticket inventory changed while saving. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update session schedule." }, { status: 500 });
  }
}
