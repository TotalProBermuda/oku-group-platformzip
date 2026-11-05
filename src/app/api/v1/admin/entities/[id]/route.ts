import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { Session } from "next-auth";
import { EntityType, Prisma } from "@prisma/client";
import { z } from "zod/v3";

function isAdmin(session: Session | null) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_COMMERCIAL"].includes(r));
}

const nullableText = z.preprocess((value) => value === "" ? null : value, z.string().nullable().optional());
const PatchBody = z.object({
  type: z.nativeEnum(EntityType).optional(),
  displayName: z.string().trim().min(1).optional(),
  logoUrl: nullableText,
  description: nullableText,
  websiteUrl: nullableText,
  instagramUrl: nullableText,
  twitterUrl: nullableText,
  linkedUserId: nullableText,
  linkedInfluencerProfileId: nullableText,
}).strict();

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
  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid entity update" }, { status: 400 });
  const data: Prisma.EntityUpdateInput = parsed.data;

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
