import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;

    const account = await prisma.user.update({
      where: { id },
      data: { status: "ACTIVE", suspendedAt: null, suspensionReason: null },
      select: { id: true, status: true },
    });

    return NextResponse.json({ account });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
