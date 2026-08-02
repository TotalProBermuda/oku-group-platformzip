import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import { EventPermissionType, EventPermissionStatus } from "@prisma/client";

const GrantBody = z.object({
  seriesId: z.string(),
  userId: z.string().optional(),
  inviteEmail: z.string().email().optional(),
  permissionType: z.nativeEnum(EventPermissionType),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const { userId } = await requireSession();

  // Only admins, superadmins, or the series influencer host can grant permissions
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: true, influencer: { select: { id: true } } },
  });

  const isAdminOrSuper =
    user?.roles.some((r) => ["ADMIN", "SUPERADMIN"].includes(r.roleKey)) ??
    false;

  const body = GrantBody.parse(await req.json());

  // Check if non-admin is the series influencer
  if (!isAdminOrSuper) {
    const series = await prisma.series.findUnique({
      where: { id: body.seriesId },
      select: { influencerId: true, commercialOwnerInfluencerId: true },
    });
    const influencerId = user?.influencer?.id;
    const isHost =
      influencerId &&
      (series?.influencerId === influencerId ||
        series?.commercialOwnerInfluencerId === influencerId);

    if (!isHost) {
      return NextResponse.json(
        { ok: false, error: "Forbidden — only admin or series host can grant permissions" },
        { status: 403 }
      );
    }
  }

  const permission = await prisma.eventPermission.create({
    data: {
      seriesId: body.seriesId,
      userId: body.userId,
      inviteEmail: body.inviteEmail,
      permissionType: body.permissionType,
      grantedByUserId: userId,
      status: EventPermissionStatus.ACTIVE,
      notes: body.notes,
    },
  });

  return NextResponse.json({ ok: true, data: permission }, { status: 201 });
}

export async function GET(req: Request) {
  const { userId } = await requireSession();
  const { searchParams } = new URL(req.url);
  const seriesId = searchParams.get("seriesId");

  if (!seriesId) {
    return NextResponse.json(
      { ok: false, error: "seriesId required" },
      { status: 400 }
    );
  }

  const permissions = await prisma.eventPermission.findMany({
    where: { seriesId, status: { not: EventPermissionStatus.REVOKED } },
    include: {
      user: { select: { id: true, name: true, email: true } },
      grantedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, data: permissions });
}

export async function DELETE(req: Request) {
  const { userId } = await requireSession();
  const { searchParams } = new URL(req.url);
  const permissionId = searchParams.get("id");

  if (!permissionId) {
    return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });
  }

  await prisma.eventPermission.update({
    where: { id: permissionId },
    data: { status: EventPermissionStatus.REVOKED },
  });

  return NextResponse.json({ ok: true });
}
