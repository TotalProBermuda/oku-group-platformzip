import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logAdminAction } from "@/lib/adminAudit";
import { requireAdminRoles } from "@/server/auth/adminGuard";

function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Creates the commercial anchor for a new organisation. It intentionally does
 * not send email: provisioning and sending a time-limited sign-in invitation
 * are separate audited actions so an operator can verify the record first.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminRoles(request, ["SUPERADMIN"]);
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = normalizeEmail(body.email);

    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a partner name and valid email" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return NextResponse.json(
        { error: "This email already belongs to a user. Review that profile before granting partner access." },
        { status: 409 },
      );
    }

    const partner = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          name,
          status: "ACTIVE",
          roles: { create: [{ roleKey: "PARTNER" }] },
        },
      });
      return tx.partnerProfile.create({
        data: { userId: user.id, name, approved: true },
        select: { id: true, name: true, approved: true, user: { select: { id: true, email: true, name: true } } },
      });
    });

    await logAdminAction({
      targetUserId: partner.user.id,
      performedByUserId: auth.userId,
      action: "USER_CREATED",
      summary: `Partner profile provisioned for ${partner.name}`,
      newValue: { partnerId: partner.id, email: partner.user.email, roleKey: "PARTNER" },
      reason: "Superadmin partner provisioning",
    });

    return NextResponse.json({ partner }, { status: 201 });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: status === 500 ? "Unable to provision partner" : "Unauthorized" }, { status });
  }
}
