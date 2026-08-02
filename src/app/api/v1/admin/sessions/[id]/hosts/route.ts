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

  const { id: sessionId } = await params;

  const [sessionRecord, hosts] = await Promise.all([
    prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true, overridesSeriesHost: true, seriesId: true,
        series: {
          select: {
            seriesHosts: {
              include: { entity: { include: { linkedInfluencerProfile: { select: { id: true, handle: true, profileImageUrl: true } } } } },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    }),
    prisma.eventHost.findMany({
      where: { sessionId },
      include: {
        entity: {
          include: {
            linkedInfluencerProfile: { select: { id: true, handle: true, refCode: true, commissionRateBps: true, profileImageUrl: true } },
            linkedUser: { select: { id: true, name: true, email: true } },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  if (!sessionRecord) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const effectiveHosts = sessionRecord.overridesSeriesHost
    ? hosts
    : sessionRecord.series.seriesHosts;

  return NextResponse.json({
    ok: true,
    overridesSeriesHost: sessionRecord.overridesSeriesHost,
    seriesHosts:         sessionRecord.series.seriesHosts,
    eventHosts:          hosts,
    effectiveHosts,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const { entityId, role, isFrontFacing, commissionShareBps, sortOrder } = body;

  if (!entityId) return NextResponse.json({ error: "entityId required" }, { status: 400 });

  const host = await prisma.eventHost.upsert({
    where: { sessionId_entityId: { sessionId, entityId } },
    create: {
      sessionId,
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
          linkedInfluencerProfile: { select: { id: true, handle: true, refCode: true, commissionRateBps: true } },
        },
      },
    },
  });

  return NextResponse.json({ ok: true, host }, { status: 201 });
}
