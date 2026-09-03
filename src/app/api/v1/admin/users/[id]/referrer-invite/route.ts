import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { issuePasswordlessToken } from "@/server/auth/passwordless";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        status: true,
        roles: { select: { roleKey: true } },
      },
    });
    if (!user || !user.roles.some((role) => role.roleKey === "REFERRER")) {
      return NextResponse.json({ ok: false, error: "Referrer not found" }, { status: 404 });
    }
    if (user.status !== "ACTIVE") {
      return NextResponse.json({ ok: false, error: "Only active referrers can be invited" }, { status: 409 });
    }

    const result = await issuePasswordlessToken({
      email: user.email,
      purpose: "REFERRER_INVITE",
      requireExistingUserId: user.id,
      callbackUrl: "/referrer/dashboard",
    });
    if (!result.issued) {
      return NextResponse.json({ ok: false, error: "Invitation could not be issued" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const status = error?.status || 500;
    return NextResponse.json(
      { ok: false, error: status === 500 ? "Failed to send invitation" : error.message },
      { status },
    );
  }
}