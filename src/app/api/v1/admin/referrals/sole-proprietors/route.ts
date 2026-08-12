import { NextResponse } from "next/server";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { listSoleProprietors } from "@/server/referrals/organizationResolver";

export async function GET(req: Request) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    const items = await listSoleProprietors();
    return NextResponse.json({ ok: true, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: e?.status ?? 500 },
    );
  }
}
