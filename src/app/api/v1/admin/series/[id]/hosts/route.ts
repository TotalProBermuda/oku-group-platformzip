import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN", "ADMIN_COMMERCIAL"].includes(r));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const hosts = await prisma.seriesHost.findMany({
    where: { seriesId: id },
    include: {
      entity: {
        include: {
          linkedInfluencerProfile: { select: { id: true, handle: true, refCode: true, commissionRateBps: true, profileImageUrl: true } },
          linkedUser: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ ok: true, hosts });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: seriesId } = await params;
  const body = await req.json().catch(() => ({}));
  const { entityId, role, isFrontFacing, commissionShareBps, sortOrder } = body;

  if (!entityId) return NextResponse.json({ error: "entityId required" }, { status: 400 });

  const validRoles = ["PRIMARY_HOST", "CO_HOST", "SPONSOR", "BRAND_PARTNER"];
  if (role && !validRoles.includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const host = await prisma.seriesHost.upsert({
    where: { seriesId_entityId: { seriesId, entityId } },
    create: {
      seriesId,
      entityId,
      role:               role              ?? "PRIMARY_HOST",
      isFrontFacing:      isFrontFacing      ?? true,
      commissionShareBps: commissionShareBps ?? null,
      sortOrder:          sortOrder          ?? 0,
    },
    update: {
      role:               role              ?? "PRIMARY_HOST",
      isFrontFacing:      isFrontFacing      ?? true,
      commissionShareBps: commissionShareBps ?? null,
      sortOrder:          sortOrder          ?? 0,
    },
    include: {
      entity: {
        include: {
          linkedInfluencerProfile: { select: { id: true, handle: true, refCode: true, commissionRateBps: true, profileImageUrl: true } },
        },
      },
    },
  });

  return NextResponse.json({ ok: true, host }, { status: 201 });
}
