import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { effectiveSeriesHosts } from "@/server/series/effectiveAssignments";
export { requireUnifiedAssignmentPreview as POST } from "@/server/series/legacySessionGuard";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:experiences:write");
    return NextResponse.json({ ok: true, hosts: await effectiveSeriesHosts((await params).id) });
  } catch { return NextResponse.json({ error: "Forbidden" }, { status: 403 }); }
}
