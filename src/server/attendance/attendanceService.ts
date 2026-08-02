import { prisma } from "@/lib/prisma";

export async function markSeated(attendanceEventId: string, staffUserId: string) {
  const event = await prisma.attendanceEvent.findUnique({ where: { id: attendanceEventId } });
  if (!event) throw Object.assign(new Error("Attendance event not found"), { status: 404 });
  if (event.status === "LEFT_EARLY" || event.status === "COMPLETED" || event.status === "NO_SHOW") {
    throw Object.assign(new Error("Cannot seat — outcome already recorded"), { status: 400 });
  }
  return prisma.attendanceEvent.update({
    where: { id: attendanceEventId },
    data: { status: "SEATED", seatedTime: new Date() },
  });
}

export async function recordOutcome(
  attendanceEventId: string,
  outcomeType: "COMPLETED" | "LEFT_EARLY" | "NO_SHOW" | "DISSATISFIED" | "UNKNOWN",
  reasonCode: "WAIT_TIME" | "SERVICE" | "PRICE" | "EXPERIENCE" | "UNKNOWN" = "UNKNOWN",
  notes?: string
) {
  const event = await prisma.attendanceEvent.findUnique({ where: { id: attendanceEventId } });
  if (!event) throw Object.assign(new Error("Attendance event not found"), { status: 404 });

  const now = new Date();
  const durationMinutes = event.arrivalTime
    ? Math.round((now.getTime() - event.arrivalTime.getTime()) / 60000)
    : null;

  const statusMap: Record<typeof outcomeType, "COMPLETED" | "LEFT_EARLY" | "NO_SHOW" | "LEFT_EARLY" | "COMPLETED"> = {
    COMPLETED: "COMPLETED",
    LEFT_EARLY: "LEFT_EARLY",
    NO_SHOW: "NO_SHOW",
    DISSATISFIED: "LEFT_EARLY",
    UNKNOWN: "COMPLETED",
  };

  await prisma.$transaction([
    prisma.attendanceEvent.update({
      where: { id: attendanceEventId },
      data: {
        status: statusMap[outcomeType],
        departureTime: now,
        durationMinutes,
      },
    }),
    prisma.attendanceOutcome.upsert({
      where: { attendanceEventId },
      create: { attendanceEventId, outcomeType, reasonCode, notes },
      update: { outcomeType, reasonCode, notes },
    }),
  ]);
}

export async function getSessionAttendance(sessionId: string) {
  return prisma.attendanceEvent.findMany({
    where: { sessionId },
    orderBy: { arrivalTime: "desc" },
    include: {
      ticket: {
        select: {
          code: true,
          attendeeName: true,
          ticketType: { select: { name: true, tierCode: true } },
        },
      },
      user: { select: { name: true, email: true } },
      outcome: true,
    },
  });
}

export async function markNoShows(sessionId: string) {
  const unattended = await prisma.ticket.findMany({
    where: {
      sessionId,
      ticketStatus: "ISSUED",
      order: { status: "PAID" },
    },
  });

  for (const ticket of unattended) {
    const existing = await prisma.attendanceEvent.findUnique({ where: { ticketId: ticket.id } });
    if (!existing) {
      await prisma.attendanceEvent.create({
        data: {
          ticketId: ticket.id,
          sessionId,
          userId: ticket.userId,
          recordedByUserId: ticket.userId, // system action
          status: "NO_SHOW",
          arrivalTime: new Date(),
        },
      });
    }
  }

  return unattended.length;
}
