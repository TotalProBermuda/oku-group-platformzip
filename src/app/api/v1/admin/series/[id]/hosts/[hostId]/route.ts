import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"].includes(r));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; hostId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { hostId } = await params;
  const body = await req.json().catch(() => ({}));

  const data: any = {};
  if ("role"               in body) data.role               = body.role;
  if ("isFrontFacing"      in body) data.isFrontFacing      = body.isFrontFacing;
  if ("commissionShareBps" in body) data.commissionShareBps = body.commissionShareBps;
  if ("sortOrder"          in body) data.sortOrder          = body.sortOrder;

  const host = await prisma.seriesHost.update({
    where: { id: hostId },
    data,
    include: {
      entity: {
        include: {
          linkedInfluencerProfile: { select: { id: true, handle: true, refCode: true, commissionRateBps: true } },
        },
      },
    },
  });
  return NextResponse.json({ ok: true, host });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; hostId: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { hostId } = await params;
  await prisma.seriesHost.delete({ where: { id: hostId } });
  return NextResponse.json({ ok: true });
}
