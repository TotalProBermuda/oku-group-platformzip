import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "hr:read");

    const jobs = await prisma.jobPost.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { applications: true } },
      },
    });

    return NextResponse.json({ ok: true, data: jobs });
  } catch (error: unknown) {
    const details = getAdminApiErrorDetails(error);
    return NextResponse.json({ ok: false, error: details.message }, { status: details.status });
  }
}
