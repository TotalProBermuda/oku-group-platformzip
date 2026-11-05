import { NextRequest, NextResponse } from "next/server";
import { HostPaymentMethod } from "@prisma/client";
import { z } from "zod/v3";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { getHostApiErrorDetails } from "@/app/api/v1/host/errorDetails";

const PatchBody = z.object({
  isPaid: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  contactInfo: z.string().nullable().optional(),
  agreedAmount: z.number().finite().nonnegative().optional(),
  paymentMethod: z.nativeEnum(HostPaymentMethod).optional(),
}).strict();

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

    const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "Invalid promoter update" }, { status: 400 });
    const body = parsed.data;
    const data = {
      ...(body.isPaid !== undefined && { isPaid: body.isPaid }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.contactInfo !== undefined && { contactInfo: body.contactInfo }),
      ...(body.agreedAmount !== undefined && { agreedAmountCents: Math.round(body.agreedAmount * 100) }),
      ...(body.paymentMethod !== undefined && { paymentMethod: body.paymentMethod }),
    };

    const updated = await prisma.hostInfluencerContact.update({ where: { id }, data });
    return NextResponse.json({ ok: true, contact: updated });
  } catch (e: unknown) {
    const error = getHostApiErrorDetails(e);
    return NextResponse.json({ error: error.message }, { status: error.status });
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
  } catch (e: unknown) {
    const error = getHostApiErrorDetails(e);
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
}
