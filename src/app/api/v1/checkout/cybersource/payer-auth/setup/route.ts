import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOptionalSession } from "@/server/auth/session";
import { hasValidGuestCheckoutCredential } from "@/server/commerce/guestCheckout";
import { hasActiveCheckoutHold } from "@/server/commerce/checkoutHold";
import { setupPayerAuthentication } from "@/server/cybersource/payerAuthentication";

const Body = z.object({
  intentId: z.string().min(1),
  guestCheckoutToken: z.string().min(32).optional(),
  transientToken: z.string().min(20),
});

// Creates a one-time CyberSource 3-D Secure browser session. The token is
// passed directly to CyberSource and deliberately never persisted or logged.
export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const auth = await getOptionalSession();
    const order = await prisma.order.findUnique({ where: { id: body.intentId }, select: { id: true, userId: true, status: true } });
    const guestAuthorized = !auth && await hasValidGuestCheckoutCredential(body.intentId, body.guestCheckoutToken);
    if (!order || (auth ? order.userId !== auth.userId : !guestAuthorized)) {
      return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
    }
    if (order.status !== "PENDING" || !(await hasActiveCheckoutHold(order.id))) {
      return NextResponse.json({ ok: false, error: "Checkout session expired. Please start again." }, { status: 409 });
    }
    const setup = await setupPayerAuthentication(body.transientToken);
    return NextResponse.json({ ok: true, data: setup });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to initialize secure cardholder verification." }, { status: 400 });
  }
}
