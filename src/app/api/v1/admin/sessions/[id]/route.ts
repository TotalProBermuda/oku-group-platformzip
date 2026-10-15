import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { Prisma } from "@prisma/client";
import { sessionTicketPriceInputSchema, updateSessionContentSchema } from "@/server/series/createSessionInput";
import { legacySessionWriteBlocked, managedWriteMessage } from "@/server/series/legacySessionGuard";
import { lockSessionInventory } from "@/server/commerce/sessionInventory";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const session = await prisma.session.findUnique({
      where: { id },
      select: { id: true, title: true, subtitle: true, description: true, flyerImageUrl: true, flyerImageUrlEn: true, flyerImageUrlEs: true, flyerImageUrlPt: true, startsAt: true, giftBagEnabled: true, streetsideEnabled: true },
    });

    if (!session) {
      return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, data: session });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles, userId } = await requireSession();
    if (!roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    if (await legacySessionWriteBlocked(id)) return NextResponse.json({ ok: false, error: managedWriteMessage }, { status: 409 });
    if (body.giftBagEnabled === false && await prisma.ticket.count({ where: { sessionId: id, entitlementSnapshot: { equals: Prisma.DbNull } } }) > 0)
      return NextResponse.json({ ok: false, error: "Existing ticket rights require owner review before disabling gift bags." }, { status: 409 });

    const update: Prisma.SessionUpdateInput = {};
    let ticketPriceOverrides: Array<{ ticketTypeId: string; priceCents: number }> | null = null;
    if ("ticketPrices" in body) {
      const parsedPrices = sessionTicketPriceInputSchema.safeParse(body.ticketPrices);
      if (!parsedPrices.success) return NextResponse.json({ ok: false, error: "Use one non-negative USD price per ticket type." }, { status: 400 });
      const owner = await prisma.session.findUnique({ where: { id }, select: { id: true, seriesId: true } });
      if (!owner) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
      const requestedIds = parsedPrices.data.map((price) => price.ticketTypeId);
      if (requestedIds.length) {
        const validTickets = await prisma.ticketType.findMany({ where: { seriesId: owner.seriesId, id: { in: requestedIds } }, select: { id: true } });
        if (validTickets.length !== requestedIds.length) return NextResponse.json({ ok: false, error: "Session prices must reference ticket types in this series." }, { status: 400 });
      }
      ticketPriceOverrides = parsedPrices.data;
    }
    const contentKeys = ["title", "subtitle", "description", "flyerImageUrl", "flyerImageUrlEn", "flyerImageUrlEs", "flyerImageUrlPt"] as const;
    const contentInput = Object.fromEntries(contentKeys.filter((key) => key in body).map((key) => [key, body[key]]));
    if (Object.keys(contentInput).length) {
      const parsedContent = updateSessionContentSchema.safeParse(contentInput);
      if (!parsedContent.success) return NextResponse.json({ ok: false, error: "Check the session title, description and flyer link." }, { status: 400 });
      Object.assign(update, parsedContent.data);
    }
    if (body.allowLateSales !== undefined) {
      if (typeof body.allowLateSales !== "boolean") return NextResponse.json({ error: "Invalid late-sales setting" }, { status: 400 });
      update.allowLateSales = body.allowLateSales;
    }
    if (body.giftBagEnabled !== undefined) update.giftBagEnabled = Boolean(body.giftBagEnabled);
    if (body.streetsideEnabled !== undefined) update.streetsideEnabled = Boolean(body.streetsideEnabled);

    const session = await prisma.$transaction(async tx => {
      await lockSessionInventory(tx, id);
      if (await legacySessionWriteBlocked(id, tx)) throw Object.assign(new Error(managedWriteMessage), { status: 409 });
      const updated = await tx.session.update({
      where: { id },
      data: update,
      select: { id: true, title: true, subtitle: true, description: true, flyerImageUrl: true, flyerImageUrlEn: true, flyerImageUrlEs: true, flyerImageUrlPt: true, startsAt: true, giftBagEnabled: true, streetsideEnabled: true, allowLateSales: true },
      });
      if (ticketPriceOverrides) {
        await tx.sessionTicketPrice.deleteMany({ where: { sessionId: id } });
        if (ticketPriceOverrides.length) await tx.sessionTicketPrice.createMany({ data: ticketPriceOverrides.map((price) => ({ sessionId: id, ...price })) });
      }
      if (body.allowLateSales !== undefined) await tx.auditLog.create({ data: {
        actorId: userId, action: "session.late_sales.updated", metadata: { sessionId: id, allowLateSales: body.allowLateSales },
      } });
      if (Object.keys(contentInput).length) await tx.auditLog.create({ data: {
        actorId: userId, action: "session.content.updated", metadata: { sessionId: id, fields: Object.keys(contentInput) },
      } });
      if (ticketPriceOverrides) await tx.auditLog.create({ data: {
        actorId: userId, action: "session.ticket_prices.updated", metadata: { sessionId: id, ticketTypeIds: ticketPriceOverrides.map((price) => price.ticketTypeId) },
      } });
      return updated;
    });

    return NextResponse.json({ ok: true, data: session });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
