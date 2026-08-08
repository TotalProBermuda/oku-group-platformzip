import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { listUnresolvedOrganizations } from "@/server/referrals/organizationResolver";

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const items = await listUnresolvedOrganizations();
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
