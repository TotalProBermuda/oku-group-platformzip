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

    await prisma.beneficiaryProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        proofOfAddressStatus: "NOT_REQUIRED",
        identificationStatus: "NOT_REQUIRED",
        taxOrRucStatus: "NOT_REQUIRED",
        sourceOfFundsStatus: "NOT_REQUIRED",
        bankReadinessStatus: "MISSING_INFO",
      },
      // Never overwrite Finance review/hold decisions on an existing profile.
      update: {},
    });

    const result = await issuePasswordlessToken({
      email: user.email,
      purpose: "REFERRER_INVITE",
      requireExistingUserId: user.id,
      callbackUrl: "/my/beneficiary",
    });
    if (!result.issued) {
      return NextResponse.json({ ok: false, error: "Invitation could not be issued" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const detail = error && typeof error === "object" ? error as { status?: unknown; message?: unknown } : {};
    const status = typeof detail.status === "number" && detail.status >= 400 && detail.status <= 599 ? detail.status : 500;
    const message = status === 500 ? "Failed to send invitation" : typeof detail.message === "string" ? detail.message : "Invitation could not be issued";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}