import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

function isHost(roles: string[]) {
  return roles.some((r) => ["RESTAURANT_HOST", "RESTAURANT_SUPERVISOR", "STREETSIDE_HOST", "SUPERADMIN"].includes(r));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, roles } = await requireSession();
    if (!isHost(roles)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const contact = await prisma.hostInfluencerContact.findUnique({ where: { id } });
    if (!contact || contact.hostUserId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const data: any = {};
    if ("isPaid" in body) data.isPaid = Boolean(body.isPaid);
    if ("notes" in body) data.notes = body.notes;
    if ("contactInfo" in body) data.contactInfo = body.contactInfo;
    if ("agreedAmount" in body) data.agreedAmountCents = Math.round(Number(body.agreedAmount) * 100);
    if ("paymentMethod" in body) data.paymentMethod = body.paymentMethod;

    const updated = await prisma.hostInfluencerContact.update({ where: { id }, data });
    return NextResponse.json({ ok: true, contact: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, roles } = await requireSession();
    if (!isHost(roles)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await params;
    const contact = await prisma.hostInfluencerContact.findUnique({ where: { id } });
    if (!contact || contact.hostUserId !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.hostInfluencerContact.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 });
  }
}
