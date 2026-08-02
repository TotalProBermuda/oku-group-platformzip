import { prisma } from "@/lib/prisma";
import { randomBytes } from "crypto";

export function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}

export async function validateToken(token: string) {
  const invitation = await prisma.eventInvitation.findUnique({
    where: { inviteToken: token },
    include: {
      series: {
        select: {
          id: true,
          slug: true,
          title: true,
          heroImageUrl: true,
          inviteFlyerImageUrl: true,
          inviteRequiresRegistration: true,
          startsAt: true,
          endsAt: true,
          venueAddress: true,
          city: true,
          description: true,
          minMembershipTier: true,
        },
      },
    },
  });

  if (!invitation) return { valid: false, reason: "NOT_FOUND" as const };
  if (invitation.status === "REVOKED") return { valid: false, reason: "REVOKED" as const };
  if (invitation.status === "EXPIRED") return { valid: false, reason: "EXPIRED" as const };
  if (invitation.status === "DECLINED") return { valid: false, reason: "DECLINED" as const };

  return { valid: true, invitation };
}

export async function markOpened(token: string) {
  const inv = await prisma.eventInvitation.findUnique({ where: { inviteToken: token } });
  if (!inv || inv.openedAt) return;
  await prisma.eventInvitation.update({
    where: { inviteToken: token },
    data: { openedAt: new Date(), status: inv.status === "SENT" ? "OPENED" : inv.status },
  });
}

export async function markDeclined(token: string, source: "EMAIL" | "WEB" = "WEB") {
  await prisma.eventInvitation.update({
    where: { inviteToken: token },
    data: {
      status: "DECLINED",
      declinedAt: new Date(),
      respondedAt: new Date(),
      responseSource: source,
    },
  });
}

export async function markRsvpStarted(token: string, source: "EMAIL" | "WEB" = "WEB") {
  const inv = await prisma.eventInvitation.findUnique({ where: { inviteToken: token } });
  if (!inv) return;
  await prisma.eventInvitation.update({
    where: { inviteToken: token },
    data: {
      status: "RSVP_STARTED",
      rsvpStartedAt: inv.rsvpStartedAt ?? new Date(),
      responseSource: source,
    },
  });
}

export async function markRsvpConfirmed(invitationId: string) {
  await prisma.eventInvitation.update({
    where: { id: invitationId },
    data: {
      status: "RSVP_CONFIRMED",
      rsvpConfirmedAt: new Date(),
      respondedAt: new Date(),
    },
  });
}
