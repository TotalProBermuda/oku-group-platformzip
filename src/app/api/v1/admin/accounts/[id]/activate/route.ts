import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { assertMayManageUser } from "@/server/auth/productionAccount";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    await assertMayManageUser(userId, id);

    const account = await prisma.user.update({
      where: { id },
      data: { status: "ACTIVE", suspendedAt: null, suspensionReason: null },
      select: { id: true, status: true },
    });

    return NextResponse.json({ account });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = typeof err === "object" && err && "status" in err ? Number(err.status) : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
