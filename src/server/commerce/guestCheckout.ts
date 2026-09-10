import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";

const GUEST_CHECKOUT_EVENT = "guest-checkout-credential";
const TTL_MS = 30 * 60 * 1000;

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * A guest token is intentionally scoped to one pending order. It is never
 * stored in plaintext and does not create a browser-wide authenticated session.
 */
export async function createGuestCheckoutCredential(orderId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  await prisma.orderEvent.create({
    data: {
      orderId,
      eventType: "OTHER",
      eventLabel: GUEST_CHECKOUT_EVENT,
      eventPayload: { tokenHash: digest(token), expiresAt: expiresAt.toISOString() },
    },
  });
  return { token, expiresAt };
}

export async function hasValidGuestCheckoutCredential(orderId: string, token?: string) {
  if (!token || token.length < 32) return false;
  const event = await prisma.orderEvent.findFirst({
    where: { orderId, eventLabel: GUEST_CHECKOUT_EVENT },
    orderBy: { createdAt: "desc" },
  });
  const payload = event?.eventPayload as { tokenHash?: string; expiresAt?: string } | null;
  if (!payload?.tokenHash || !payload.expiresAt || Date.parse(payload.expiresAt) <= Date.now()) return false;

  const expected = Buffer.from(payload.tokenHash, "hex");
  const received = Buffer.from(digest(token), "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
