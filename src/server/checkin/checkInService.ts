import { prisma } from "@/lib/prisma";
import { checkInEmitter } from "@/lib/checkInEmitter";

export interface CheckInResult {
  result: "VALID" | "ALREADY_CHECKED_IN" | "INVALID" | "EXPIRED";
  ticket?: {
    id: string;
    code: string;
    attendeeName: string | null;
    ticketType: { name: string; tierCode: string | null } | null;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      membership: { tier: string; status: string } | null;
    };
    session: {
      id: string;
      title: string | null;
      startsAt: Date;
      series: { title: string; venue: string | null } | null;
    } | null;
    attendanceEvent: { id: string; status: string } | null;
    checkedInAt: Date | null;
  };
  message: string;
}

export async function validateAndCheckIn(
  code: string,
  scannedByUserId: string,
  opts: {
    method?: "QR" | "MANUAL" | "ADMIN_OVERRIDE";
    deviceInfo?: string;
    expectedSessionId?: string;
  } = {}
): Promise<CheckInResult> {
  const ticket = await prisma.ticket.findUnique({
    where: { code },
    include: {
      ticketType: { select: { name: true, tierCode: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          membership: { select: { tier: true, status: true } },
        },
      },
      session: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          series: { select: { title: true, venue: true } },
        },
      },
      order: { select: { id: true, seriesId: true } },
      attendanceEvent: { select: { id: true, status: true } },
    },
  });

  // Log the scan attempt regardless of result
  const logBase = {
    scannedCode: code,
    ticketId: ticket?.id ?? null,
    scannedByUserId,
    deviceInfo: opts.deviceInfo ?? null,
  };

  if (!ticket) {
    await prisma.checkInLog.create({
      data: { ...logBase, valid: false, result: "INVALID" },
    });
    return { result: "INVALID", message: "Ticket not found" };
  }

  // Soft session-scope guard for the staff scanner: when a session is selected,
  // refuse tickets belonging to a different session and surface a clear message.
  if (opts.expectedSessionId && ticket.sessionId && ticket.sessionId !== opts.expectedSessionId) {
    await prisma.checkInLog.create({
      data: { ...logBase, valid: false, result: "INVALID" },
    });
    return {
      result: "INVALID",
      message: "Ticket is for a different session",
      ticket: buildTicketPayload(ticket),
    };
  }

  if (ticket.ticketStatus === "CANCELLED" || ticket.ticketStatus === "VOIDED" || ticket.ticketStatus === "REFUNDED") {
    await prisma.checkInLog.create({
      data: { ...logBase, valid: false, result: "EXPIRED" },
    });
    return { result: "EXPIRED", message: `Ticket is ${ticket.ticketStatus.toLowerCase()}`, ticket: buildTicketPayload(ticket) };
  }

  if (ticket.ticketStatus === "CHECKED_IN") {
    await prisma.checkInLog.create({
      data: { ...logBase, valid: false, result: "ALREADY_CHECKED_IN" },
    });
    return {
      result: "ALREADY_CHECKED_IN",
      message: `Already checked in at ${ticket.checkedInAt?.toLocaleTimeString() ?? "unknown time"}`,
      ticket: buildTicketPayload(ticket),
    };
  }

  // Atomic claim — only one concurrent scan can flip ISSUED -> CHECKED_IN.
  const claim = await prisma.ticket.updateMany({
    where: { id: ticket.id, ticketStatus: "ISSUED" },
    data: { ticketStatus: "CHECKED_IN", checkedInAt: new Date(), checkedInById: scannedByUserId },
  });

  if (claim.count === 0) {
    // Lost the race — another scan claimed it. Re-read for the truth.
    const fresh = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: {
        ticketType: { select: { name: true, tierCode: true } },
        user: {
          select: { id: true, name: true, email: true, membership: { select: { tier: true, status: true } } },
        },
        session: {
          select: { id: true, title: true, startsAt: true, series: { select: { title: true, venue: true } } },
        },
        attendanceEvent: { select: { id: true, status: true } },
      },
    });
    await prisma.checkInLog.create({
      data: { ...logBase, valid: false, result: "ALREADY_CHECKED_IN" },
    });
    return {
      result: "ALREADY_CHECKED_IN",
      message: `Already checked in at ${fresh?.checkedInAt?.toLocaleTimeString() ?? "unknown time"}`,
      ticket: fresh ? buildTicketPayload(fresh) : undefined,
    };
  }

  // We own the claim. Now write side-effects; tolerate the rare unique-conflict
  // on attendanceEvent (ticketId @unique) from a stale concurrent path.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.experienceCheckin.create({
        data: {
          ticketId: ticket.id,
          sessionId: ticket.sessionId,
          checkedInById: scannedByUserId,
          method: opts.method ?? "QR",
        },
      });

      await tx.attendanceEvent.create({
        data: {
          ticketId: ticket.id,
          sessionId: ticket.sessionId,
          userId: ticket.userId,
          recordedByUserId: scannedByUserId,
          status: "ARRIVED",
          arrivalTime: new Date(),
        },
      });

      await tx.checkInLog.create({
        data: { ...logBase, valid: true, result: "VALID" },
      });
    });
  } catch (err: any) {
    // P2002 = unique violation; treat as best-effort — the claim has already succeeded.
    if (err?.code !== "P2002") throw err;
    try {
      await prisma.checkInLog.create({
        data: { ...logBase, valid: true, result: "VALID" },
      });
    } catch { /* ignore */ }
  }

  // Re-fetch with updated attendance event
  const updatedTicket = await prisma.ticket.findUnique({
    where: { id: ticket.id },
    include: {
      ticketType: { select: { name: true, tierCode: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          membership: { select: { tier: true, status: true } },
        },
      },
      session: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          series: { select: { title: true, venue: true } },
        },
      },
      attendanceEvent: { select: { id: true, status: true } },
    },
  });

  const now = new Date().toISOString();

  // Broadcast real-time event to all SSE subscribers
  checkInEmitter.emit("ticket-checked-in", {
    ticketId: ticket.id,
    ticketCode: ticket.code,
    sessionId: ticket.sessionId ?? null,
    seriesId: (ticket as any).order?.seriesId ?? null,
    userId: ticket.userId,
    orderId: (ticket as any).order?.id ?? null,
    attendeeName: ticket.attendeeName ?? null,
    attendeeEmail: (ticket as any).attendeeEmail ?? null,
    checkedInAt: now,
    result: "VALID",
  });

  return {
    result: "VALID",
    message: "Checked in successfully",
    ticket: buildTicketPayload(updatedTicket!),
  };
}

export async function searchTickets(query: string, sessionId?: string) {
  const where: any = {
    order: { status: "PAID" },
    ticketStatus: { in: ["ISSUED", "CHECKED_IN"] },
  };

  if (sessionId) where.sessionId = sessionId;

  const isCode = query.toUpperCase().startsWith("TIX-") || /^[A-Z0-9\-]{6,}$/i.test(query);

  if (isCode) {
    where.code = { contains: query.toUpperCase(), mode: "insensitive" };
  } else {
    // Search by attendee name or user name/email
    where.OR = [
      { attendeeName: { contains: query, mode: "insensitive" } },
      { user: { name: { contains: query, mode: "insensitive" } } },
      { user: { email: { contains: query, mode: "insensitive" } } },
    ];
  }

  return prisma.ticket.findMany({
    where,
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      ticketType: { select: { name: true, tierCode: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          membership: { select: { tier: true, status: true } },
        },
      },
      session: {
        select: {
          id: true,
          title: true,
          startsAt: true,
          series: { select: { title: true, venue: true } },
        },
      },
      attendanceEvent: { select: { id: true, status: true } },
    },
  });
}

function buildTicketPayload(ticket: any) {
  return {
    id: ticket.id,
    code: ticket.code,
    attendeeName: ticket.attendeeName,
    ticketType: ticket.ticketType,
    user: ticket.user,
    session: ticket.session,
    attendanceEvent: ticket.attendanceEvent,
    checkedInAt: ticket.checkedInAt,
  };
}
