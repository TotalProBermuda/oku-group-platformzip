import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { effectiveSeriesHosts } from "@/server/series/effectiveAssignments";
export { requireUnifiedAssignmentPreview as POST } from "@/server/series/legacySessionGuard";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:experiences:write");
    const session = await prisma.session.findUnique({ where: { id: (await params).id }, include: { eventHosts: { include: { entity: { include: { linkedInfluencerProfile: true } } }, orderBy: { sortOrder: "asc" } } } });
    if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const seriesHosts = await effectiveSeriesHosts(session.seriesId);
    return NextResponse.json({ ok: true, overridesSeriesHost: session.overridesSeriesHost, seriesHosts, eventHosts: session.eventHosts, effectiveHosts: session.overridesSeriesHost ? session.eventHosts : seriesHosts });
  } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
}
