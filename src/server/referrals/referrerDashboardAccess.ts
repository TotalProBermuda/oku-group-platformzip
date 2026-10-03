import { prisma } from "@/lib/prisma";

type ReferrerIdentityLookup =
  | { userId: string; email?: never }
  | { userId?: never; email: string };

export async function hasLinkedReferrerIdentity(
  lookup: ReferrerIdentityLookup,
): Promise<boolean> {
  const user = await prisma.user.findFirst({
    where: lookup.userId
      ? { id: lookup.userId }
      : { email: { equals: lookup.email, mode: "insensitive" } },
    select: {
      id: true,
      referralActor: { select: { id: true, status: true } },
      referrer: { select: { id: true, isActive: true } },
    },
  });

  if (!user) return false;
  if (user.referralActor?.status === "ACTIVE" || user.referrer?.isActive) return true;

  const adminLinks = await prisma.auditLog.findMany({
    where: {
      action: "referral.actor.admin_identity_link",
      metadata: { path: ["linkedUserId"], equals: user.id },
    },
    select: { actorId: true },
  });
  if (adminLinks.length === 0) return false;

  const activeLinkedActor = await prisma.referralActor.findFirst({
    where: {
      id: { in: adminLinks.map((link) => link.actorId) },
      status: "ACTIVE",
    },
    select: { id: true },
  });
  return Boolean(activeLinkedActor);
}