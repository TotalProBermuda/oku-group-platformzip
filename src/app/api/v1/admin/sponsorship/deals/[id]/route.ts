import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession, type Session } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";

function isAdmin(s: Session | null) {
  return s?.user?.roles?.includes("SUPERADMIN") ?? false;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const deal = await prisma.sponsorDeal.findUnique({
    where: { id },
    include: {
      entity:      true,
      slot:        { include: { series: { select: { id: true, title: true } } } },
      application: true,
      payments:    { orderBy: { paidAt: "desc" } },
      placements:  { orderBy: { createdAt: "desc" } },
    },
  });
  if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, deal });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: Prisma.SponsorDealUpdateInput = {};
  const allowed = ["agreedPriceCents", "internalNotes", "isActive", "termsAgreedAt", "activationDeadline"] as const;
  for (const key of allowed) {
    if (key in body) {
      if (key === "termsAgreedAt" || key === "activationDeadline") {
        data[key] = body[key] ? new Date(body[key]) : null;
      } else {
        data[key] = body[key];
      }
    }
  }

  const deal = await prisma.sponsorDeal.update({ where: { id }, data });
  return NextResponse.json({ ok: true, deal });
}
