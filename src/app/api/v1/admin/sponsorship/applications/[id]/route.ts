import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession, type Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SponsorApplicationStatus } from "@prisma/client";

function isAdmin(s: Session | null) {
  return s?.user?.roles?.includes("SUPERADMIN") ?? false;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const app = await prisma.sponsorApplication.findUnique({
    where: { id },
    include: {
      slot:   { include: { series: { select: { id: true, title: true } } } },
      entity: true,
      deal:   { include: { payments: true, placements: true } },
    },
  });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, application: app });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { status, reviewNotes, agreedPriceCents } = body;

  const parsedStatus = status ? Object.values(SponsorApplicationStatus).find((value) => value === status) : undefined;
  if (status && !parsedStatus) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const app = await prisma.sponsorApplication.update({
    where: { id },
    data: {
      ...(parsedStatus ? { status: parsedStatus, reviewedAt: new Date(), reviewedByUserId: session?.user?.id ?? null } : {}),
      ...(reviewNotes !== undefined ? { reviewNotes } : {}),
    },
    include: {
      slot:   { select: { id: true, title: true } },
      entity: { select: { id: true, displayName: true } },
    },
  });

  // Auto-create deal when approved
  if (status === "APPROVED" && !await prisma.sponsorDeal.findUnique({ where: { applicationId: id } })) {
    if (agreedPriceCents != null) {
      await prisma.sponsorDeal.create({
        data: {
          applicationId:   id,
          slotId:          app.slotId   ?? null,
          entityId:        app.entityId ?? null,
          agreedPriceCents: agreedPriceCents,
        },
      });
    }
  }

  return NextResponse.json({ ok: true, application: app });
}
