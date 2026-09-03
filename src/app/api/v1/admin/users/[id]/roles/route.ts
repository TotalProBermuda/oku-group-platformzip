import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";
import { RoleKey } from "@prisma/client";
import { assertMayManageUser } from "@/server/auth/productionAccount";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    await assertMayManageUser(userId, id);
    const { roleKey } = await req.json();

    if (!Object.values(RoleKey).includes(roleKey)) {
      return NextResponse.json({ ok: false, error: "Invalid role" }, { status: 400 });
    }

    await prisma.userRole.upsert({
      where:  { userId_roleKey: { userId: id, roleKey } },
      create: { userId: id, roleKey },
      update: {},
    });

    await logAdminAction({
      targetUserId:      id,
      performedByUserId: userId,
      action:            "ROLE_ASSIGNED",
      summary:           `Role ${roleKey} assigned`,
      newValue:          { roleKey },
    });

    const updated = await prisma.user.findUnique({
      where: { id },
      include: { roles: { select: { roleKey: true } } },
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
