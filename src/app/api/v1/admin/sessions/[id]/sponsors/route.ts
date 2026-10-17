import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { effectiveSeriesSponsors } from "@/server/series/effectiveAssignments";
export { requireUnifiedAssignmentPreview as POST } from "@/server/series/legacySessionGuard";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:experiences:write");
    const session = await prisma.session.findUnique({ where: { id: (await params).id } });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const eventAssignments = await prisma.sponsorAssignment.findMany({ where: { scopeType: "EVENT", scopeId: session.id }, include: { tier: true, entity: { select: { id: true, displayName: true, logoUrl: true, websiteUrl: true } } } });
    return NextResponse.json({ eventAssignments, seriesAssignments: session.inheritsSeriesSponsors ? await effectiveSeriesSponsors(session.seriesId) : [], inheritsSeriesSponsors: session.inheritsSeriesSponsors });
  } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
}
