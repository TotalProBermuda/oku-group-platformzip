import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartnerForSeries, PartnerAuthError, hasFullSeriesAccess, accessibleSessionIds } from "@/lib/partnerAuth";

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requirePartnerForSeries(id);
    const sessionId = req.nextUrl.searchParams.get("sessionId");

    const fullAccess = hasFullSeriesAccess(auth);
    const allowedSessions = accessibleSessionIds(auth);
    const where: any = { order: { seriesId: id, status: "PAID" } };
    if (sessionId) {
      if (!fullAccess && !allowedSessions.has(sessionId)) {
        return new Response("Forbidden", { status: 403 });
      }
      where.sessionId = sessionId;
    } else if (!fullAccess) {
      where.sessionId = { in: Array.from(allowedSessions) };
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        code: true,
        attendeeName: true,
        attendeeEmail: true,
        ticketStatus: true,
        checkedInAt: true,
        createdAt: true,
        user: { select: { name: true, email: true } },
        ticketType: { select: { name: true } },
        session: { select: { title: true, startsAt: true } },
      },
    });

    const header = [
      "Ticket Code","Attendee Name","Attendee Email","Account Name","Account Email",
      "Ticket Type","Session","Session Starts At","Status","Checked In At","Issued At",
    ];
    const rows = tickets.map((t) =>
      [
        t.code,
        t.attendeeName ?? t.user?.name ?? "",
        t.attendeeEmail ?? t.user?.email ?? "",
        t.user?.name ?? "",
        t.user?.email ?? "",
        t.ticketType?.name ?? "",
        t.session?.title ?? "",
        t.session?.startsAt ? t.session.startsAt.toISOString() : "",
        t.ticketStatus,
        t.checkedInAt ? t.checkedInAt.toISOString() : "",
        t.createdAt.toISOString(),
      ].map(csvCell).join(",")
    );
    const body = [header.join(","), ...rows].join("\n");

    const ts = new Date().toISOString().slice(0, 10);
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="attendees-${id}-${ts}.csv"`,
      },
    });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return new Response(e.message, { status: e.status });
    if (e.message === "Unauthorized") return new Response("Unauthorized", { status: 401 });
    console.error("[partner/attendees/export]", e);
    return new Response("Internal error", { status: 500 });
  }
}
