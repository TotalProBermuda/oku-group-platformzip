import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOptionalSession } from "@/server/auth/session";
import { createCybersourceCaptureContext } from "@/server/cybersource/client";
import { getActiveCheckoutAdapter } from "@/server/payments/providers";
import { hasValidGuestCheckoutCredential } from "@/server/commerce/guestCheckout";
import { hasActiveCheckoutHold } from "@/server/commerce/checkoutHold";
import { gatePublicPostAsync } from "@/server/rateLimit";

const Body = z.object({ intentId: z.string().min(1), guestCheckoutToken: z.string().min(32).optional() });

/**
 * Produces a one-time Flex capture context only for the signed-in owner of a
 * pending order.  The target origins are server-owned and never taken from the
 * request, so a hostile caller cannot mint a context for another site.
 */
export async function POST(req: Request) {
  let stage = "parse_request";
  try {
    const raw = await req.json();
    stage = "rate_limit";
    const gate = await gatePublicPostAsync(req, raw, "cybersource-capture-context", { limit: 12, windowMs: 10 * 60_000, requireDistributed: true });
    if (!gate.ok) return gate.response;
    stage = "validate_request";
    const { intentId, guestCheckoutToken } = Body.parse(raw);
    stage = "resolve_session";
    const auth = await getOptionalSession();
    stage = "resolve_gateway";
    const { provider } = await getActiveCheckoutAdapter();
    if (provider !== "CYBERSOURCE") {
      return NextResponse.json({ ok: false, error: "Cybersource is not the active checkout gateway." }, { status: 409 });
    }
    stage = "load_order";
    const order = await prisma.order.findUnique({
      where: { id: intentId },
      select: { id: true, userId: true, status: true, totalCents: true, currency: true },
    });
    stage = "authorize_order";
    const guestAuthorized = !auth && await hasValidGuestCheckoutCredential(intentId, guestCheckoutToken);
    if (!order || (auth ? order.userId !== auth.userId : !guestAuthorized)) {
      return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
    }
    stage = "validate_hold";
    if (order.status !== "PENDING" || !(await hasActiveCheckoutHold(order.id))) {
      return NextResponse.json({ ok: false, error: "Order is no longer awaiting payment." }, { status: 409 });
    }
    stage = "create_capture_context";
    const context = await createCybersourceCaptureContext({
      amount: (order.totalCents / 100).toFixed(2),
      currency: order.currency,
    });
    return NextResponse.json({ ok: true, data: context });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to initialize secure card entry.";
    console.error("Cybersource checkout initialization failure", {
      stage,
      message,
    });
    return NextResponse.json(
      {
        ok: false,
        error: message,
        stage,
      },
      { status: 400 },
    );
  }
}
