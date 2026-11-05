import { NextRequest, NextResponse } from "next/server";
import { getAdminApiErrorDetails } from "@/app/api/v1/admin/errorDetails";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;

    const logs = await prisma.userAuditLog.findMany({
      where:   { targetUserId: id },
      orderBy: { createdAt: "desc" },
      include: {
        performedBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ ok: true, data: logs });
  } catch (e: unknown) {
    const error = getAdminApiErrorDetails(e);
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
  }
}
