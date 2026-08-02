import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

function isHost(roles: string[]) {
  return roles.some((r) => ["RESTAURANT_HOST", "STREETSIDE_HOST", "SUPERADMIN"].includes(r));
}

export async function GET(req: NextRequest) {
  try {
    const { userId, roles } = await requireSession();
    if (!isHost(roles)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const seriesId = searchParams.get("seriesId");

    const contacts = await prisma.hostInfluencerContact.findMany({
      where: {
        hostUserId: userId,
        ...(seriesId ? { seriesId } : {}),
      },
      include: { series: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, contacts });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, roles } = await requireSession();
    if (!isHost(roles)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { name, contactInfo, agreedAmount, currency, paymentMethod, notes, seriesId } = body;

    if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const contact = await prisma.hostInfluencerContact.create({
      data: {
        hostUserId: userId,
        seriesId: seriesId || null,
        name: name.trim(),
        contactInfo: contactInfo?.trim() || null,
        agreedAmountCents: Math.round(Number(agreedAmount ?? 0) * 100),
        currency: currency || "USD",
        paymentMethod: paymentMethod || "CASH",
        notes: notes?.trim() || null,
        isPaid: false,
      },
      include: { series: { select: { id: true, title: true } } },
    });

    return NextResponse.json({ ok: true, contact }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
