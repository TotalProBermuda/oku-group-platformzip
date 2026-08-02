import { NextRequest, NextResponse } from "next/server";
import { SeriesStatus, SessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let pos = 0;
  let first = true;
  while (pos < bytes.length) {
    const chunk = first ? 75 : 74;
    parts.push((first ? "" : " ") + bytes.slice(pos, pos + chunk).toString("utf8"));
    pos += chunk;
    first = false;
  }
  return parts.join("\r\n");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    include: { series: true },
  });

  const visibleStatuses: SeriesStatus[] = [SeriesStatus.PUBLISHED, SeriesStatus.SOLD_OUT];
  if (
    !session ||
    session.status !== SessionStatus.SCHEDULED ||
    !visibleStatuses.includes(session.series.status)
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const title = session.title ?? session.series.title;
  const description = session.series.description ?? "";
  const location = [session.series.venue, session.series.venueAddress, session.series.city]
    .filter(Boolean)
    .join(", ");

  const uid = `session-${session.id}@okugroup.com`;
  const dtStart = icsDate(new Date(session.startsAt));
  const dtEnd = icsDate(new Date(session.endsAt));
  const dtStamp = icsDate(new Date());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//OKÜ Hospitality Group//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    foldLine(`UID:${uid}`),
    foldLine(`DTSTAMP:${dtStamp}`),
    foldLine(`DTSTART:${dtStart}`),
    foldLine(`DTEND:${dtEnd}`),
    foldLine(`SUMMARY:${escapeIcs(title)}`),
    foldLine(`DESCRIPTION:${escapeIcs(description)}`),
    foldLine(`LOCATION:${escapeIcs(location)}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  const icsContent = lines.join("\r\n");

  return new NextResponse(icsContent, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="event-${session.id}.ics"`,
      "Cache-Control": "no-cache",
    },
  });
}
