import { getResendClient } from "@/server/invitation/resend";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://oku.group";

function emailHeader() {
  return `
    <div style="background:#1a1614;padding:24px 32px;display:flex;align-items:center;gap:12px">
      <span style="color:#c41e3a;font-size:26px;font-weight:700;font-family:Georgia,serif;letter-spacing:-0.01em">OKÜ</span>
      <span style="color:#9ca3af;font-size:10px;letter-spacing:0.18em;text-transform:uppercase;padding-top:4px">HOSPITALITY GROUP</span>
    </div>`;
}

function emailFooter() {
  return `
    <div style="background:#f9f7f4;padding:24px 32px;border-top:1px solid #e5e0d8;text-align:center">
      <p style="margin:0 0 8px;color:#9ca3af;font-size:12px">OKÜ Hospitality Group · Panama City, Panama</p>
      <p style="margin:0;color:#c5c0b8;font-size:11px">This invitation expires in 7 days. If you did not expect this email, you can safely ignore it.</p>
    </div>`;
}

export async function sendInfluencerInviteEmail(opts: {
  toEmail: string;
  toName: string;
  token: string;
  eventTitle?: string | null;
  eventImageUrl?: string | null;
  commissionPct: number;
}) {
  let resend;
  try {
    resend = await getResendClient();
  } catch {
    console.log("[email] Resend not configured — influencer invite not sent to", opts.toEmail);
    return;
  }

  const acceptUrl = `${BASE_URL}/influencer/accept-invite?token=${opts.token}`;

  const eventSection = opts.eventTitle
    ? `
      <div style="border:1px solid #e5e0d8;border-radius:12px;overflow:hidden;margin-bottom:32px">
        ${opts.eventImageUrl ? `<img src="${opts.eventImageUrl}" alt="${opts.eventTitle}" style="width:100%;height:180px;object-fit:cover;display:block" />` : ""}
        <div style="padding:20px 24px">
          <p style="margin:0;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#c41e3a">Event</p>
          <p style="margin:4px 0 0;font-family:Georgia,serif;font-size:20px;color:#1a1614">${opts.eventTitle}</p>
        </div>
      </div>`
    : "";

  const html = `
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:white">
      ${emailHeader()}
      <div style="padding:40px 32px">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#c41e3a">Creator Invitation</p>
        <h1 style="margin:0 0 16px;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#1a1614;letter-spacing:-0.01em">You're invited to collaborate</h1>
        <p style="color:#4b4540;margin:0 0 32px;font-size:15px;line-height:1.7">Hi ${opts.toName}, OKÜ Hospitality Group would like to invite you to collaborate as an influencer creator. Your commission rate has been set at <strong>${opts.commissionPct}%</strong>.</p>
        ${eventSection}
        <p style="color:#4b4540;margin:0 0 8px;font-size:14px;line-height:1.6">To get started, click the button below to accept your invitation and complete your creator profile. This link expires in <strong>7 days</strong>.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="${acceptUrl}" style="display:inline-block;background:#c41e3a;color:white;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.02em">Accept Invitation &amp; Set Up Profile</a>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin:0;text-align:center">Or copy this link: <a href="${acceptUrl}" style="color:#c41e3a">${acceptUrl}</a></p>
      </div>
      ${emailFooter()}
    </div>`;

  await resend.client.emails.send({
    from: resend.fromEmail,
    to: opts.toEmail,
    subject: `You're invited to collaborate with OKÜ${opts.eventTitle ? ` — ${opts.eventTitle}` : ""}`,
    html,
  });
}
