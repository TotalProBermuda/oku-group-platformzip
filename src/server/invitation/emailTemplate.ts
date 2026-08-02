import { Series } from "@prisma/client";

interface InviteEmailProps {
  recipientName: string | null;
  series: Pick<Series, "title" | "startsAt" | "endsAt" | "venueAddress" | "city" | "description" | "heroImageUrl" | "inviteFlyerImageUrl">;
  rsvpUrl: string;
  declineUrl: string;
  audienceLabel?: string;
}

function formatDate(d: Date | null | undefined): string {
  if (!d) return "Date TBD";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(d));
}

export function buildInvitationEmailHtml(props: InviteEmailProps): string {
  const { recipientName, series, rsvpUrl, declineUrl, audienceLabel } = props;
  const flyerUrl = series.inviteFlyerImageUrl ?? series.heroImageUrl;
  const greeting = recipientName ? `Dear ${recipientName},` : "Dear Guest,";
  const venue = [series.venueAddress, series.city].filter(Boolean).join(", ") || "OKÜ Hospitality Group";

  const badgeHtml = audienceLabel
    ? `<div style="text-align:center;margin-bottom:24px"><span style="background:#1a1614;color:#f5f0ea;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;padding:6px 14px;border-radius:20px">${audienceLabel}</span></div>`
    : "";

  const flyerHtml = flyerUrl
    ? `<img src="${flyerUrl}" alt="${series.title}" style="width:100%;max-width:560px;border-radius:8px;display:block;margin:0 auto 32px" />`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>You're invited — ${series.title}</title>
</head>
<body style="margin:0;padding:0;background:#f5f0ea;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0ea;padding:40px 16px">
<tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;width:100%">
    <!-- Header -->
    <tr>
      <td style="background:#1a1614;padding:28px 32px;text-align:center">
        <span style="color:#c41e3a;font-size:28px;font-weight:700;letter-spacing:0.08em;font-family:Georgia,serif">OKÜ</span>
        <span style="color:#9ca3af;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;margin-left:8px;font-family:sans-serif">HOSPITALITY GROUP</span>
      </td>
    </tr>
    <!-- Body -->
    <tr>
      <td style="padding:40px 40px 32px">
        ${badgeHtml}
        ${flyerHtml}
        <p style="margin:0 0 8px;color:#7c7168;font-size:13px;text-transform:uppercase;letter-spacing:0.12em;font-family:sans-serif">You are invited</p>
        <h1 style="margin:0 0 24px;color:#1a1614;font-size:28px;line-height:1.2;font-family:Georgia,serif">${series.title}</h1>
        <p style="margin:0 0 8px;color:#4b4540;font-size:15px;line-height:1.6;font-family:sans-serif">${greeting}</p>
        <p style="margin:0 0 24px;color:#4b4540;font-size:15px;line-height:1.6;font-family:sans-serif">We warmly invite you to join us for an exclusive experience.</p>

        <!-- Event details -->
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f7f4;border-radius:8px;padding:20px;margin-bottom:32px">
          <tr>
            <td style="padding:0 0 12px">
              <p style="margin:0;color:#7c7168;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-family:sans-serif">Date &amp; Time</p>
              <p style="margin:4px 0 0;color:#1a1614;font-size:15px;font-family:sans-serif">${formatDate(series.startsAt)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 0 0;border-top:1px solid #e8e3db">
              <p style="margin:0;color:#7c7168;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-family:sans-serif">Venue</p>
              <p style="margin:4px 0 0;color:#1a1614;font-size:15px;font-family:sans-serif">${venue}</p>
            </td>
          </tr>
        </table>

        ${series.description ? `<p style="margin:0 0 32px;color:#4b4540;font-size:15px;line-height:1.7;font-family:sans-serif">${series.description}</p>` : ""}

        <!-- CTA Buttons -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px">
          <tr>
            <td style="padding-right:8px" width="50%">
              <a href="${rsvpUrl}" style="display:block;text-align:center;background:#c41e3a;color:#ffffff;font-size:15px;font-weight:600;font-family:sans-serif;padding:16px 24px;border-radius:8px;text-decoration:none;letter-spacing:0.04em">RSVP</a>
            </td>
            <td style="padding-left:8px" width="50%">
              <a href="${declineUrl}" style="display:block;text-align:center;background:#f5f0ea;color:#7c7168;font-size:15px;font-weight:600;font-family:sans-serif;padding:16px 24px;border-radius:8px;text-decoration:none;letter-spacing:0.04em;border:1px solid #e8e3db">Decline</a>
            </td>
          </tr>
        </table>
        <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;font-family:sans-serif;text-align:center">
          This invitation is personal and non-transferable.<br />
          OKÜ Hospitality Group · Panama City
        </p>
      </td>
    </tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

export function buildInvitationEmailText(props: InviteEmailProps): string {
  const { recipientName, series, rsvpUrl, declineUrl } = props;
  const greeting = recipientName ? `Dear ${recipientName},` : "Dear Guest,";
  return `OKÜ HOSPITALITY GROUP — You Are Invited

${greeting}

${series.title}
${formatDate(series.startsAt)}
${series.venueAddress ?? ""} ${series.city ?? ""}

${series.description ?? ""}

RSVP: ${rsvpUrl}
Decline: ${declineUrl}

This invitation is personal and non-transferable.
OKÜ Hospitality Group · Panama City`;
}
