import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mergeSponsors, resolveSponsors, type SponsorSurface } from "@/lib/sponsor-render";
import { effectiveSeriesSponsors } from "@/server/series/effectiveAssignments";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scopeTypeValue = searchParams.get("scopeType");
  const scopeType = scopeTypeValue === "SERIES" || scopeTypeValue === "EVENT" ? scopeTypeValue : null;
  const scopeId = searchParams.get("scopeId");
  const requestedSurface = searchParams.get("surface");
  const surfaces: readonly SponsorSurface[] = ["event_page", "ticket", "email", "check_in"];
  const surface: SponsorSurface = surfaces.includes(requestedSurface as SponsorSurface)
    ? requestedSurface as SponsorSurface
    : "event_page";

  if (!scopeType || !scopeId) {
    return NextResponse.json({ error: "scopeType and scopeId required" }, { status: 400 });
  }

  const INCLUDE = {
    tier: true,
    entity: { select: { id: true, displayName: true, logoUrl: true, websiteUrl: true } },
  };

  if (scopeType === "SERIES") {
    const assignments = await effectiveSeriesSponsors(scopeId);
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
      ? effectiveSeriesSponsors(sessionRecord.seriesId)
      : Promise.resolve([]),
  ]);

  const resolved = mergeSponsors(seriesAssignments, eventAssignments, surface);
  return NextResponse.json(resolved);
}
