import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { listSoleProprietors } from "@/server/referrals/organizationResolver";

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const items = await listSoleProprietors();
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: e?.status ?? 500 },
    );
  }
}
