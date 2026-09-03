import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function POST(req: NextRequest, _context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    return NextResponse.json(
      { ok: false, error: "Passwords are managed by Google Workspace. Use force logout to revoke an OKÜ session." },
      { status: 409 },
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
