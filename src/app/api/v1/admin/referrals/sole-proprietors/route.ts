import { NextResponse } from "next/server";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { listSoleProprietors } from "@/server/referrals/organizationResolver";

export async function GET(req: Request) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    const items = await listSoleProprietors();
    return NextResponse.json({ ok: true, items });
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: error.status },
    );
  }
}
