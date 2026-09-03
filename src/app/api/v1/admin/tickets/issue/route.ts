import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { hasPermission } from "@/lib/permissions";
import type { RoleKey } from "@/types/roles";

export const dynamic = "force-dynamic";

const IssueBody = z.object({
  sessionId: z.string().min(1),
  ticketTypeId: z.string().min(1).optional(),
  attendeeName: z.string().min(1).max(120),
  attendeeEmail: z.string().email().optional(),
  reason: z.string().min(1).max(280),
  note: z.string().max(1000).optional(),
}).strict();

function generateTicketCode() {
  return "TIX-" + Math.random().toString(36).slice(2, 10).toUpperCase();
}

function generateOrderNumber() {
  return "COMP-" + Math.random().toString(36).slice(2, 10).toUpperCase();
}

export async function POST(req: Request) {
  try {
    const { userId, roles } = await requireSession();
    if (!hasPermission((roles ?? []) as RoleKey[], "admin:tickets:write")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    let body: z.infer<typeof IssueBody>;
    try {
      body = IssueBody.parse(await req.json());
    } catch (zerr: any) {
      return NextResponse.json(
        { ok: false, error: "Invalid request", issues: zerr.issues ?? [] },
        { status: 400 }
      );
    }

    const session = await prisma.session.findUnique({
      where: { id: body.sessionId },
      include: { series: { select: { id: true } } },
    });
    if (!session) {
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    }

    if (body.ticketTypeId) {
      const tt = await prisma.ticketType.findUnique({ where: { id: body.ticketTypeId } });
      if (!tt || tt.seriesId !== session.seriesId) {
        return NextResponse.json(
          { ok: false, error: "Ticket type does not belong to this session's series" },
          { status: 400 }
        );
      }
    }

    // Resolve or create attendee user
    let attendeeUserId: string;
    if (body.attendeeEmail) {
      const existing = await prisma.user.findUnique({
        where: { email: body.attendeeEmail.toLowerCase() },
      });
      if (existing) {
        attendeeUserId = existing.id;
      } else {
        const created = await prisma.user.create({
          data: {
            email: body.attendeeEmail.toLowerCase(),
            name: body.attendeeName,
          },
        });
        attendeeUserId = created.id;
      }
    } else {
      // No email — attribute the comp ticket to the issuing admin so foreign keys resolve.
      attendeeUserId = userId;
    }

    // Bounded retry on unique-violation collisions for ticket.code / order.orderNumber.
    let attempts = 0;
    const MAX_ATTEMPTS = 4;
    let created: { ticket: { id: string; code: string }; order: { id: string; orderNumber: string | null } } | null = null;
    let lastErr: any = null;

    while (attempts < MAX_ATTEMPTS && !created) {
      attempts += 1;
      const code = generateTicketCode();
      const orderNumber = generateOrderNumber();
      try {
        created = await issueOnce({ code, orderNumber });
      } catch (e: any) {
        if (e?.code === "P2002") {
          lastErr = e;
          continue;
        }
        throw e;
      }
    }

    if (!created) {
      return NextResponse.json(
        { ok: false, error: "Could not allocate a unique ticket code; please retry." },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      data: {
        ticketId: created.ticket.id,
        ticketCode: created.ticket.code,
        orderId: created.order.id,
        orderNumber: created.order.orderNumber,
      },
    });

    async function issueOnce({ code, orderNumber }: { code: string; orderNumber: string }) {
      return prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          userId: attendeeUserId,
          seriesId: session.seriesId,
          sessionId: session.id,
          status: "PAID",
          orderType: "TICKET",
          channel: "DIRECT",
          orderNumber,
          subtotalCents: 0,
          totalCents: 0,
          currency: "USD",
          paidAt: new Date(),
          placedAt: new Date(),
        },
      });

      const ticket = await tx.ticket.create({
        data: {
          orderId: order.id,
          userId: attendeeUserId,
          sessionId: session.id,
          ticketTypeId: body.ticketTypeId ?? null,
          code,
          attendeeName: body.attendeeName,
          attendeeEmail: body.attendeeEmail?.trim().toLowerCase() ?? null,
          attendeeEmailNormalized: body.attendeeEmail?.trim().toLowerCase() ?? null,
          ticketStatus: "ISSUED",
          checkInNotes: body.note ?? null,
        },
      });

      try {
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: "admin.tickets.comp_issued",
            metadata: {
              ticketId: ticket.id,
              ticketCode: ticket.code,
              orderId: order.id,
              orderNumber,
              sessionId: session.id,
              seriesId: session.seriesId,
              ticketTypeId: body.ticketTypeId ?? null,
              attendeeName: body.attendeeName,
              attendeeEmail: body.attendeeEmail ?? null,
              reason: body.reason,
              note: body.note ?? null,
              timestamp: new Date().toISOString(),
            },
          },
        });
      } catch {
        // Non-fatal — comp ticket creation must not be blocked by audit log failure.
      }

        return { ticket, order };
      });
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
