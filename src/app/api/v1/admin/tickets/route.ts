import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { hasPermission } from "@/lib/permissions";
import type { RoleKey } from "@/types/roles";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { roles } = await requireSession();
    if (!hasPermission((roles ?? []) as RoleKey[], "admin:tickets:read")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const status = searchParams.get("status") ?? undefined;
    const checkedIn = searchParams.get("checkedIn") ?? undefined;
    const sessionId = searchParams.get("sessionId") ?? undefined;
    const seriesId = searchParams.get("seriesId") ?? undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 200);

    const where: any = {};
    if (status) where.ticketStatus = status;
    if (sessionId) where.sessionId = sessionId;
    if (seriesId) where.session = { seriesId };
    if (checkedIn === "yes") where.checkedInAt = { not: null };
    if (checkedIn === "no") where.checkedInAt = null;

    if (q) {
      const isCode = /^[A-Z0-9\-]{4,}$/i.test(q);
      const isOrderNumber = /^[A-Z0-9\-]{4,}$/i.test(q);
      where.OR = [
        ...(isCode ? [{ code: { contains: q.toUpperCase(), mode: "insensitive" as const } }] : []),
        ...(isOrderNumber
          ? [{ order: { orderNumber: { contains: q.toUpperCase(), mode: "insensitive" as const } } }]
          : []),
        { attendeeName: { contains: q, mode: "insensitive" as const } },
        { attendeeEmail: { contains: q, mode: "insensitive" as const } },
        { user: { name: { contains: q, mode: "insensitive" as const } } },
        { user: { email: { contains: q, mode: "insensitive" as const } } },
      ];
    }

    const tickets = await prisma.ticket.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        ticketType: { select: { name: true, tierCode: true } },
        user: { select: { id: true, name: true, email: true } },
        session: {
          select: {
            id: true,
            title: true,
            startsAt: true,
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
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      data: tickets.map((t) => ({
        id: t.id,
        code: t.code,
        attendeeName: t.attendeeName,
        attendeeEmail: t.attendeeEmail,
        ticketStatus: t.ticketStatus,
        checkedInAt: t.checkedInAt,
        createdAt: t.createdAt,
        ticketType: t.ticketType,
        user: t.user,
        session: t.session,
        order: t.order,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
