import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession, type Session } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";

function isAdmin(s: Session | null) {
  return s?.user?.roles?.includes("SUPERADMIN") ?? false;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { pid } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Prisma.SponsorPlacementUpdateInput = {};
  const fields = ["label", "assetUrl", "altText", "linkUrl", "isActive", "impressions", "clicks", "notes", "activatedAt", "expiresAt"] as const;
  for (const key of fields) {
    if (key in body) {
      if (key === "activatedAt" || key === "expiresAt") {
        data[key] = body[key] ? new Date(body[key]) : null;
      } else {
        data[key] = body[key];
      }
    }
  }

  const placement = await prisma.sponsorPlacement.update({ where: { id: pid }, data });
  return NextResponse.json({ ok: true, placement });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { pid } = await params;
  await prisma.sponsorPlacement.delete({ where: { id: pid } });
  return NextResponse.json({ ok: true });
}
