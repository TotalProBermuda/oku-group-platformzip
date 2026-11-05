import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    // The Superadmin commercial-persona picker only wants Referrer profiles
    // that are not yet linked to any platform user — `?unlinkedOnly=true`.
    const unlinkedOnly = req.nextUrl.searchParams.get("unlinkedOnly") === "true";

    const referrers = await prisma.referrer.findMany({
      where: unlinkedOnly ? { userId: null } : undefined,
      select: {
        id:           true,
        referrerType: true,
        referralCode: true,
        isActive:     true,
        userId:       true,
        fullName:     true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ user: { name: "asc" } }, { fullName: "asc" }],
    });

    return NextResponse.json({ ok: true, data: referrers });
  } catch (error: unknown) {
    const details = getAdminApiErrorDetails(error);
    return NextResponse.json({ ok: false, error: details.message }, { status: details.status });
  }
}
