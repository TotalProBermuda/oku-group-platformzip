import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN", "FB_DIRECTOR"].includes(r));
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const entity = await prisma.entity.findUnique({
    where: { id },
    include: {
      linkedInfluencerProfile: { select: { id: true, handle: true, refCode: true, commissionRateBps: true, displayName: true } },
      linkedUser: { select: { id: true, name: true, email: true } },
      seriesHosts: { include: { series: { select: { id: true, title: true, slug: true } } }, orderBy: { createdAt: "desc" } },
      eventHosts:  { include: { session: { select: { id: true, title: true, startsAt: true, series: { select: { id: true, title: true } } } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!entity) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, entity });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const allowed = ["type", "displayName", "logoUrl", "description", "websiteUrl", "instagramUrl", "twitterUrl",
                   "linkedUserId", "linkedInfluencerProfileId"] as const;
  const data: any = {};
  for (const key of allowed) {
    if (key in body) data[key] = body[key] === "" ? null : body[key];
  }

  const entity = await prisma.entity.update({
    where: { id },
    data,
    include: {
      linkedInfluencerProfile: { select: { id: true, handle: true, refCode: true, commissionRateBps: true } },
      linkedUser: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json({ ok: true, entity });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  await prisma.entity.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
