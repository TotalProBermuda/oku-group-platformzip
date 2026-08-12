import { NextResponse } from "next/server";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { listUnresolvedOrganizations } from "@/server/referrals/organizationResolver";

export async function GET(req: Request) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    const items = await listUnresolvedOrganizations();
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status ?? 500 });
  }
}
