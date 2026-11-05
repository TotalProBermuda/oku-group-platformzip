import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export type ChallengeContext = { orderId: string; amountCents: number; currency: string; transientToken: string; billing: unknown };
const label = "checkout-3ds-challenge";
function fingerprint(context: ChallengeContext) {
  return createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

// Store no card token, access JWT, or billing data. A challenge cannot be
// transplanted to another order, card token, amount, or billing address.
export async function bindChallenge(context: ChallengeContext, challenge: { authenticationTransactionId: string; cardType?: string }) {
  await prisma.orderEvent.create({ data: {
    orderId: context.orderId, eventType: "OTHER", eventLabel: label,
    eventPayload: { fingerprint: fingerprint(context), authenticationTransactionId: challenge.authenticationTransactionId,
      cardType: challenge.cardType ?? null, expiresAt: Date.now() + 10 * 60 * 1000 },
  } });
}

export async function requireBoundChallenge(context: ChallengeContext, transactionId: string) {
  const event = await prisma.orderEvent.findFirst({ where: { orderId: context.orderId, eventLabel: label }, orderBy: { createdAt: "desc" } });
  const data = event?.eventPayload as { fingerprint?: string; authenticationTransactionId?: string; cardType?: string; expiresAt?: number } | null;
  if (!data || data.fingerprint !== fingerprint(context) || data.authenticationTransactionId !== transactionId || !data.expiresAt || data.expiresAt <= Date.now()) {
    throw new Error("Verification does not match this checkout or has expired.");
  }
  return { authenticationTransactionId: transactionId, cardType: data.cardType || undefined };
}
