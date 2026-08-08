import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

/**
 * Pre-flight check used by the AddOperatorModal so we can warn before submit.
 * GET /api/v1/operators/check-email?email=foo@bar.com
 *   → { ok: true, exists: boolean, user?: { id, name, email } }
 */
export async function GET(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:users:edit");

    const email = (new URL(req.url).searchParams.get("email") ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: false, error: "email required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });

    return NextResponse.json({ ok: true, exists: !!user, user });
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return NextResponse.json({ ok: false, error: err.message ?? "unknown" }, { status: err.status ?? 500 });
  }
}
