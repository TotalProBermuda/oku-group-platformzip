import { prisma } from "@/lib/prisma";
import { InviteAudienceMode, InvitationStatus } from "@prisma/client";
import { resolveAudience } from "./audienceService";
import { generateInviteToken } from "./tokenService";
import { getResendClient } from "./resend";
import { buildInvitationEmailText } from "./emailTemplate";
import { renderInvitationEmail, formatEventDate } from "./emailTemplates";
import type { EmailTemplate } from "./emailTemplates/types";

interface EmailConfig {
  template?: EmailTemplate;
  customSubject?: string;
  customMessage?: string;
  flyerImageUrl?: string;
  heroImageUrl?: string;
  youtubeUrl?: string;
  audienceLabel?: string;
}

const BASE_URL = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? "https://localhost:5000";

function audienceLabel(mode: InviteAudienceMode): string | undefined {
  if (mode === "FOUNDER_ONLY") return "For Founder Members";
  if (mode === "PATRON_ONLY") return "For Patron Members";
  if (mode === "PATRON_AND_FOUNDER") return "For OKÜ Members";
  return undefined;
}

export async function createInvitationsForSegment(
  seriesId: string,
  audienceMode: InviteAudienceMode,
  createdByUserId: string,
  options: { resendToNonResponders?: boolean } = {}
) {
  const series = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      heroImageUrl: true,
      inviteFlyerImageUrl: true,
      inviteRequiresRegistration: true,
      venueAddress: true,
      city: true,
      description: true,
      minMembershipTier: true,
    },
  });

  let excludeUserIds: string[] = [];
  if (options.resendToNonResponders) {
    const existing = await prisma.eventInvitation.findMany({
      where: {
        seriesId,
        status: { in: [InvitationStatus.DECLINED, InvitationStatus.RSVP_CONFIRMED, InvitationStatus.RSVP_STARTED] },
      },
      select: { recipientUserId: true },
    });
    excludeUserIds = existing.map((e) => e.recipientUserId).filter(Boolean) as string[];
  } else {
    const existing = await prisma.eventInvitation.findMany({
      where: { seriesId },
      select: { recipientUserId: true, recipientEmail: true },
    });
    excludeUserIds = existing.map((e) => e.recipientUserId).filter(Boolean) as string[];
  }

  const audience = await resolveAudience(audienceMode, excludeUserIds);

  const invitations = await prisma.$transaction(
    audience.map((r) =>
      prisma.eventInvitation.create({
        data: {
          seriesId,
          recipientUserId: r.userId,
          recipientEmail: r.email,
          recipientName: r.name,
          audienceSegment: audienceMode,
          status: "SENT",
          inviteToken: generateInviteToken(),
          createdByUserId,
          flyerImageUrl: series.inviteFlyerImageUrl ?? series.heroImageUrl,
        },
      })
    )
  );

  return { created: invitations.length, invitations };
}

export async function sendInvitationEmails(
  seriesId: string,
  invitationIds: string[],
  emailConfig: EmailConfig = {}
) {
  const series = await prisma.series.findUniqueOrThrow({
    where: { id: seriesId },
    select: {
      title: true,
      subtitle: true,
      slug: true,
      startsAt: true,
      endsAt: true,
      heroImageUrl: true,
      inviteFlyerImageUrl: true,
      inviteRequiresRegistration: true,
      venueAddress: true,
      city: true,
      description: true,
      minMembershipTier: true,
    },
  });

  const invitations = await prisma.eventInvitation.findMany({
    where: { id: { in: invitationIds } },
  });

  let emailClient: Awaited<ReturnType<typeof getResendClient>> | null = null;
  try {
    emailClient = await getResendClient();
  } catch {
    await prisma.eventLog?.create?.({
      data: {
        eventType: "invitation_email_skipped",
        payload: { reason: "RESEND_NOT_CONFIGURED", seriesId, count: invitations.length },
      } as any,
    }).catch(() => {});
    return { sent: 0, skipped: invitations.length, error: "RESEND_NOT_CONFIGURED" };
  }

  let sent = 0;
  const errors: string[] = [];
  const venueStr = [series.venueAddress, series.city].filter(Boolean).join(", ") || "OKÜ Hospitality Group";

  for (const inv of invitations) {
    const rsvpUrl = `${BASE_URL}/invite/${inv.inviteToken}/rsvp`;
    const declineUrl = `${BASE_URL}/invite/${inv.inviteToken}/decline`;
    const label = emailConfig.audienceLabel ?? audienceLabel(inv.audienceSegment);
    const subject = emailConfig.customSubject ?? `You're invited — ${series.title}`;

    const html = renderInvitationEmail({
      template: emailConfig.template ?? "CLASSIC",
      eventTitle: series.title,
      eventSubtitle: series.subtitle ?? undefined,
      eventDate: formatEventDate(series.startsAt),
      eventVenue: venueStr,
      eventDescription: series.description ?? undefined,
      eventSlug: series.slug,
      recipientName: inv.recipientName,
      flyerImageUrl: emailConfig.flyerImageUrl ?? series.inviteFlyerImageUrl,
      heroImageUrl: emailConfig.heroImageUrl ?? series.heroImageUrl,
      youtubeUrl: emailConfig.youtubeUrl,
      customSubject: emailConfig.customSubject,
      customMessage: emailConfig.customMessage,
      audienceLabel: label,
      rsvpUrl,
      declineUrl,
    });

    try {
      await emailClient.client.emails.send({
        from: emailClient.fromEmail,
        to: inv.recipientEmail.toLowerCase(),
        subject,
        html,
        text: buildInvitationEmailText({
          recipientName: inv.recipientName,
          series: series as any,
          rsvpUrl,
          declineUrl,
        }),
      });
      sent++;
    } catch (e: any) {
      errors.push(`${inv.recipientEmail}: ${e.message}`);
    }
  }

  return { sent, skipped: errors.length, errors };
}

export async function getInvitationMetrics(seriesId: string) {
  const counts = await prisma.eventInvitation.groupBy({
    by: ["status"],
    where: { seriesId },
    _count: { _all: true },
  });

  const map: Record<string, number> = {};
  for (const row of counts) {
    map[row.status] = row._count._all;
  }

  const registrants = await prisma.eventRegistrant.count({ where: { seriesId } });
  const ticketed = await prisma.eventRegistrant.count({
    where: { seriesId, registrationStatus: { in: ["TICKETED", "CHECKED_IN"] } },
  });
  const checkedIn = await prisma.eventRegistrant.count({
    where: { seriesId, registrationStatus: "CHECKED_IN" },
  });

  return {
    sent: (map["SENT"] ?? 0) + (map["OPENED"] ?? 0) + (map["DECLINED"] ?? 0) + (map["RSVP_STARTED"] ?? 0) + (map["RSVP_CONFIRMED"] ?? 0),
    opened: map["OPENED"] ?? 0,
    declined: map["DECLINED"] ?? 0,
    rsvpStarted: map["RSVP_STARTED"] ?? 0,
    rsvpConfirmed: map["RSVP_CONFIRMED"] ?? 0,
    registered: registrants,
    ticketed,
    checkedIn,
  };
}
