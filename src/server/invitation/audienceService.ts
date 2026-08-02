import { prisma } from "@/lib/prisma";
import { InviteAudienceMode, MembershipStatus } from "@prisma/client";

export interface AudienceRecipient {
  userId: string;
  email: string;
  name: string | null;
}

export async function resolveAudience(
  audienceMode: InviteAudienceMode,
  excludeUserIds: string[] = []
): Promise<AudienceRecipient[]> {
  const exclude = new Set(excludeUserIds);

  if (audienceMode === "NONE") return [];

  // INDIVIDUAL invitations are created one-at-a-time (Partner Portal /
  // admin attendee tools) and never resolved through the broadcast
  // pipeline. Return empty so audience preview/send is a no-op.
  if (audienceMode === "INDIVIDUAL") return [];

  if (audienceMode === "ALL_USERS") {
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE", id: { notIn: [...exclude] } },
      select: { id: true, email: true, name: true },
    });
    return users.map((u) => ({ userId: u.id, email: u.email, name: u.name }));
  }

  const tierFilter =
    audienceMode === "PATRON_ONLY"
      ? ["PATRON"]
      : audienceMode === "FOUNDER_ONLY"
      ? ["FOUNDER"]
      : audienceMode === "PATRON_AND_FOUNDER"
      ? ["PATRON", "FOUNDER"]
      : null;

  if (!tierFilter) return [];

  const memberships = await prisma.membership.findMany({
    where: {
      tier: { in: tierFilter as any[] },
      status: MembershipStatus.ACTIVE,
      user: { status: "ACTIVE", id: { notIn: [...exclude] } },
    },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  return memberships.map((m) => ({
    userId: m.user.id,
    email: m.user.email,
    name: m.user.name,
  }));
}

export async function previewAudienceCount(
  audienceMode: InviteAudienceMode
): Promise<number> {
  const audience = await resolveAudience(audienceMode);
  return audience.length;
}
