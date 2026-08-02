import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mergeSponsors, resolveSponsors } from "@/lib/sponsor-render";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scopeType = searchParams.get("scopeType") as "SERIES" | "EVENT" | null;
  const scopeId = searchParams.get("scopeId");
  const surface = (searchParams.get("surface") ?? "event_page") as any;

  if (!scopeType || !scopeId) {
    return NextResponse.json({ error: "scopeType and scopeId required" }, { status: 400 });
  }

  const INCLUDE = {
    tier: true,
    entity: { select: { id: true, displayName: true, logoUrl: true, websiteUrl: true } },
  };

  if (scopeType === "SERIES") {
    const assignments = await prisma.sponsorAssignment.findMany({
      where: { scopeType: "SERIES", scopeId, isActive: true },
      include: INCLUDE,
      orderBy: [{ tier: { displayOrder: "asc" } }, { sortOrder: "asc" }],
    });
    const resolved = resolveSponsors(assignments, surface, false);
    return NextResponse.json(resolved);
  }

  const sessionRecord = await prisma.session.findUnique({
    where: { id: scopeId },
    select: { id: true, seriesId: true, inheritsSeriesSponsors: true },
  });
  if (!sessionRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [eventAssignments, seriesAssignments] = await Promise.all([
    prisma.sponsorAssignment.findMany({
      where: { scopeType: "EVENT", scopeId, isActive: true },
      include: INCLUDE,
      orderBy: [{ tier: { displayOrder: "asc" } }, { sortOrder: "asc" }],
    }),
    sessionRecord.inheritsSeriesSponsors
      ? prisma.sponsorAssignment.findMany({
          where: { scopeType: "SERIES", scopeId: sessionRecord.seriesId, isActive: true },
          include: INCLUDE,
          orderBy: [{ tier: { displayOrder: "asc" } }, { sortOrder: "asc" }],
        })
      : Promise.resolve([]),
  ]);

  const resolved = mergeSponsors(seriesAssignments, eventAssignments, surface);
  return NextResponse.json(resolved);
}
