import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { hasPermission } from "@/lib/permissions";
import type { RoleKey } from "@/types/roles";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    if (!hasPermission((roles ?? []) as RoleKey[], "admin:tickets:read")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        ticketType: { select: { name: true, tierCode: true, priceCents: true } },
        user: { select: { id: true, name: true, email: true } },
        session: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            series: { select: { id: true, title: true, venue: true } },
          },
        },
        order: {
          select: {
            id: true,
            orderNumber: true,
            status: true,
            orderType: true,
            channel: true,
            totalCents: true,
            currency: true,
            createdAt: true,
            paidAt: true,
            payment: {
              select: {
                provider: true,
                status: true,
                authNetTransId: true,
              },
            },
          },
        },
        checkins: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            method: true,
            createdAt: true,
            checkedInBy: { select: { name: true, email: true } },
          },
        },
        attendanceEvent: {
          select: { id: true, status: true, arrivalTime: true },
        },
        checkInLogs: {
          orderBy: { createdAt: "desc" },
          take: 25,
          select: {
            id: true,
            result: true,
            valid: true,
            scannedCode: true,
            deviceInfo: true,
            createdAt: true,
            scannedBy: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 });
    }

    const lastFour =
      ticket.order?.payment?.authNetTransId
        ? ticket.order.payment.authNetTransId.slice(-4)
        : null;

    const blockedReason =
      ticket.ticketStatus === "REFUNDED" ? "Order refunded"
      : ticket.ticketStatus === "CANCELLED" ? "Ticket cancelled"
      : ticket.ticketStatus === "VOIDED" ? "Ticket voided"
      : ticket.ticketStatus === "CHECKED_IN" ? `Already checked in${ticket.checkedInAt ? " at " + ticket.checkedInAt.toISOString() : ""}`
      : null;

    return NextResponse.json({
      ok: true,
      data: {
        ...ticket,
        order: ticket.order
          ? {
              ...ticket.order,
              payment: ticket.order.payment
                ? {
                    provider: ticket.order.payment.provider,
                    status: ticket.order.payment.status,
                    authNetTransIdMasked: lastFour ? `****${lastFour}` : null,
                  }
                : null,
            }
          : null,
        blockedReason,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
