import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { createCybersourceCaptureContext } from "@/server/cybersource/client";
import { getActiveCheckoutAdapter } from "@/server/payments/providers";

const Body = z.object({ intentId: z.string().min(1) });

/**
 * Produces a one-time Flex capture context only for the signed-in owner of a
 * pending order.  The target origins are server-owned and never taken from the
 * request, so a hostile caller cannot mint a context for another site.
 */
export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();
    const { intentId } = Body.parse(await req.json());
    const { provider } = await getActiveCheckoutAdapter();
    if (provider !== "CYBERSOURCE") {
      return NextResponse.json({ ok: false, error: "Cybersource is not the active checkout gateway." }, { status: 409 });
    }
    const order = await prisma.order.findUnique({
      where: { id: intentId },
      select: { id: true, userId: true, status: true, totalCents: true, currency: true },
    });
    if (!order || order.userId !== userId) {
      return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
    }
    if (order.status !== "PENDING") {
      return NextResponse.json({ ok: false, error: "Order is no longer awaiting payment." }, { status: 409 });
    }
    const context = await createCybersourceCaptureContext({
      amount: (order.totalCents / 100).toFixed(2),
      currency: order.currency,
    });
    return NextResponse.json({ ok: true, data: context });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Unable to initialize secure card entry." },
      { status: 400 },
    );
  }
}
