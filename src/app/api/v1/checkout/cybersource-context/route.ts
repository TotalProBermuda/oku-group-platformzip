import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getOptionalSession } from "@/server/auth/session";
import { hasValidGuestCheckoutCredential } from "@/server/commerce/guestCheckout";
import { hasActiveCheckoutHold } from "@/server/commerce/checkoutHold";
import { getActiveCheckoutAdapter } from "@/server/payments/providers";
import { createMicroformContext, trustedCheckoutOrigin } from "@/server/cybersource/microform";
import { gatePublicPostAsync } from "@/server/rateLimit";

const Body = z.object({
  intentId: z.string().min(1),
  guestCheckoutToken: z.string().min(32).optional(),
});

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const gate = await gatePublicPostAsync(request, raw, "cybersource-context", {
    limit: 12,
    windowMs: 10 * 60_000,
    requireDistributed: true,
  });
  if (!gate.ok) return gate.response;

  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid checkout request." }, { status: 400 });

  const auth = await getOptionalSession();
  const order = await prisma.order.findUnique({ where: { id: parsed.data.intentId } });
  const guestAuthorized = !auth && await hasValidGuestCheckoutCredential(parsed.data.intentId, parsed.data.guestCheckoutToken);
  if (!order || (auth ? order.userId !== auth.userId : !guestAuthorized)) {
    return NextResponse.json({ ok: false, error: "Order not found." }, { status: 404 });
  }
  if (order.status !== "PENDING" || !(await hasActiveCheckoutHold(order.id))) {
    return NextResponse.json({ ok: false, error: "Checkout session expired. Please start again." }, { status: 410 });
  }
  const { provider } = await getActiveCheckoutAdapter();
  if (provider !== "CYBERSOURCE") {
    return NextResponse.json({ ok: false, error: "Hosted card fields are not available for the active payment gateway." }, { status: 409 });
  }

  try {
    const context = await createMicroformContext(trustedCheckoutOrigin(new URL(request.url).origin));
    return NextResponse.json({ ok: true, data: context });
  } catch {
    // Do not reveal configuration, credential, or provider diagnostics to a
    // public checkout visitor.
    return NextResponse.json({ ok: false, error: "Secure card entry is temporarily unavailable." }, { status: 503 });
  }
}
