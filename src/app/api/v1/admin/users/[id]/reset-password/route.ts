import { NextRequest, NextResponse } from "next/server";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function POST(req: NextRequest, _context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    return NextResponse.json(
      { ok: false, error: "Passwords are managed by Google Workspace. Use force logout to revoke an OKÜ session." },
      { status: 409 },
    );
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}
