import { NextResponse } from "next/server";
import { z } from "zod/v3";
import { Prisma } from "@prisma/client";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { hasPermission } from "@/lib/permissions";
import type { RoleKey } from "@/types/roles";
import { lockSessionInventory, safeInventoryFloor } from "@/server/commerce/sessionInventory";
import { purchasedEntitlements, sessionProductEnabled } from "@/server/commerce/sessionProducts";

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
    } catch (zerr: unknown) {
      return NextResponse.json(
        { ok: false, error: "Invalid request", issues: zerr instanceof z.ZodError ? zerr.issues : [] },
        { status: 400 }
      );
    }

    const foundSession = await prisma.session.findUnique({
      where: { id: body.sessionId },
      include: { series: { select: { id: true } } },
    });
    if (!foundSession) {
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    }
    const session = foundSession;

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
    let lastErr: unknown = null;

    while (attempts < MAX_ATTEMPTS && !created) {
      attempts += 1;
      const code = generateTicketCode();
      const orderNumber = generateOrderNumber();
      try {
        created = await issueOnce({ code, orderNumber });
      } catch (e: unknown) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
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
      await lockSessionInventory(tx, session.id);
      const current = await tx.session.findUnique({ where: { id: session.id }, include: { series: true } });
      if (!current || !["SCHEDULED", "SOLD_OUT"].includes(current.status)) throw Object.assign(new Error("This session is not open for admission issuance."), { status: 409 });
      const floor = await safeInventoryFloor(tx, current.id, current.soldCount);
      if (floor >= current.capacity) throw Object.assign(new Error("This session has no uncommitted capacity."), { status: 409 });
      if (body.ticketTypeId && !sessionProductEnabled(current, current.series, body.ticketTypeId)) throw Object.assign(new Error("This product is disabled for this session."), { status: 409 });
      if (body.ticketTypeId) {
        await tx.$queryRaw`SELECT "id" FROM "TicketType" WHERE "id" = ${body.ticketTypeId} FOR UPDATE`;
        const product = await tx.ticketType.findUnique({ where: { id: body.ticketTypeId } });
        if (!product || product.seriesId !== current.seriesId || product.ticketStatus !== "ACTIVE") throw Object.assign(new Error("This ticket product is unavailable."), { status: 409 });
        if (product.typeCapacity !== null) {
          const changed = await tx.ticketType.updateMany({ where: { id: product.id, soldCount: product.soldCount, typeCapacity: { gt: product.soldCount } }, data: { soldCount: { increment: 1 } } });
          if (changed.count !== 1) throw Object.assign(new Error("This ticket product has no capacity."), { status: 409 });
        }
      }
      await tx.session.update({ where: { id: current.id }, data: { soldCount: floor + 1, ...(floor + 1 === current.capacity ? { status: "SOLD_OUT" } : {}) } });
      const rights = purchasedEntitlements(current);
      const order = await tx.order.create({
        data: {
          userId: attendeeUserId,
          seriesId: session.seriesId,
          sessionId: session.id,
          status: "PAID",
          orderType: "TICKET",
          channel: "ADMIN",
          entitlementSnapshot: rights,
          checkoutLocale: "en",
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
          entitlementSnapshot: rights,
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
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}
