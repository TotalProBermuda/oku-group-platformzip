import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/server/auth/adminGuard";

export const dynamic = "force-dynamic";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  let s = String(v);
  // Neutralize spreadsheet formula-injection vectors (Excel/Sheets/Numbers).
  // If a cell starts with =, +, -, @, tab, or CR, prefix with a single quote.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  try {
    const { userId } = await requireAdminPermission(req, "admin:tickets:write");

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId") ?? undefined;
    const seriesId = searchParams.get("seriesId") ?? undefined;

    if (!sessionId && !seriesId) {
      return NextResponse.json(
        { ok: false, error: "sessionId or seriesId is required" },
        { status: 400 }
      );
    }

    const where: any = {};
    if (sessionId) where.sessionId = sessionId;
    if (seriesId) where.session = { seriesId };

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "asc" },
      include: {
        ticketType: { select: { name: true } },
        user: { select: { name: true, email: true } },
        session: {
          select: {
            title: true,
            startsAt: true,
            series: { select: { title: true } },
          },
        },
        order: { select: { orderNumber: true, status: true, channel: true } },
      },
    });

    const headers = [
      "ticket_code",
      "attendee_name",
      "attendee_email",
      "ticket_status",
      "checked_in_at",
      "ticket_type",
      "series",
      "session",
      "session_starts_at",
      "order_number",
      "order_status",
      "order_channel",
      "created_at",
    ];

    const rows = tickets.map((t) => [
      t.code,
      t.attendeeName ?? t.user.name ?? "",
      t.attendeeEmail ?? t.user.email ?? "",
      t.ticketStatus,
      t.checkedInAt ? t.checkedInAt.toISOString() : "",
      t.ticketType?.name ?? "",
      t.session?.series?.title ?? "",
      t.session?.title ?? "",
      t.session?.startsAt ? t.session.startsAt.toISOString() : "",
      t.order?.orderNumber ?? "",
      t.order?.status ?? "",
      t.order?.channel ?? "",
      t.createdAt.toISOString(),
    ]);

    const csv =
      headers.join(",") +
      "\n" +
      rows.map((r) => r.map(csvEscape).join(",")).join("\n") +
      "\n";

    try {
      await prisma.auditLog.create({
        data: {
          actorId: userId,
          action: "admin.tickets.export",
          metadata: {
            sessionId: sessionId ?? null,
            seriesId: seriesId ?? null,
            rowCount: tickets.length,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch {
      // non-fatal
    }

    const fname = `tickets_${sessionId ?? seriesId ?? "export"}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fname}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
