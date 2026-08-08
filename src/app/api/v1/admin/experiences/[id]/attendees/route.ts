import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkInEmitter } from "@/lib/checkInEmitter";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN","FB_DIRECTOR"].includes(r));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  const where: any = { order: { seriesId: id, status: "PAID" } };
  if (sessionId) where.sessionId = sessionId;

  const tickets = await prisma.ticket.findMany({
    where,
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { name: true, email: true } },
      ticketType: { select: { name: true, tierCode: true } },
      session: { select: { title: true, startsAt: true } },
    },
  });

  return NextResponse.json({ tickets });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: seriesId } = await params;

  // Parse body — handle both JSON (fetch) and form-encoded (HTML form) submissions
  let ticketId: string | undefined;
  let method: string | undefined;
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    ticketId = body.ticketId;
    method = body.method;
  } else {
    const fd = await req.formData().catch(() => new FormData());
    ticketId = (fd.get("ticketId") as string) || undefined;
    method = (fd.get("method") as string) || undefined;
  }

  if (!ticketId) return NextResponse.json({ error: "ticketId required" }, { status: 400 });

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { order: { select: { id: true, seriesId: true } } },
  });
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  if (ticket.ticketStatus === "CHECKED_IN") return NextResponse.json({ error: "Already checked in" }, { status: 400 });

  const now = new Date();
  await prisma.$transaction([
    prisma.ticket.update({ where: { id: ticketId }, data: { ticketStatus: "CHECKED_IN", checkedInAt: now, checkedInById: session.user.id } }),
    prisma.experienceCheckin.create({ data: { ticketId, sessionId: ticket.sessionId, checkedInById: session.user.id, method: method ?? "ADMIN_OVERRIDE" } }),
  ]);

  // Broadcast real-time event to all SSE subscribers
  checkInEmitter.emit("ticket-checked-in", {
    ticketId: ticket.id,
    ticketCode: ticket.code,
    sessionId: ticket.sessionId ?? null,
    seriesId: ticket.order?.seriesId ?? null,
    userId: ticket.userId,
    orderId: ticket.order?.id ?? null,
    attendeeName: ticket.attendeeName ?? null,
    attendeeEmail: ticket.attendeeEmail ?? null,
    checkedInAt: now.toISOString(),
    result: "VALID",
  });

  // For HTML form submissions, redirect back to the attendees page.
  // Use a fixed same-origin path — do NOT use the Referer header directly,
  // as it is user-controlled and could redirect to an external domain.
  if (!ct.includes("application/json")) {
    const safeRedirect = `/admin/experiences/${seriesId}/attendees`;
    return NextResponse.redirect(new URL(safeRedirect, req.url), 303);
  }

  return NextResponse.json({ ok: true });
}
