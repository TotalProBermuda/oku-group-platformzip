import { getResendClient, isResendConfigured } from "@/server/invitation/resend";
import { getRoleTemplate } from "./roles";
import type { PartnerDelegateRole } from "@prisma/client";

const BASE_URL =
  process.env.NEXTAUTH_URL ??
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.NEXT_PUBLIC_BASE_URL ??
  "https://okuhospitality.com";

interface SendSeatInviteInput {
  toEmail: string;
  toName?: string | null;
  rawToken: string;
  roleCode: PartnerDelegateRole;
  partnerName: string;
  scopeLabel: string;
  expiresAt: Date;
}

function buildHtml(props: SendSeatInviteInput, link: string): string {
  const role = getRoleTemplate(props.roleCode);
  const greeting = props.toName ? `Hi ${props.toName},` : "Hi,";
  const expires = props.expiresAt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f0ea;margin:0;padding:24px;color:#1a1614">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5dccf">
    <div style="text-align:center;margin-bottom:24px">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.18em;color:#c41e3a">OKÜ HOSPITALITY GROUP</span>
    </div>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 12px">You've been invited as a ${role.label}</h1>
    <p style="font-size:15px;line-height:1.55;color:#4a423b;margin:0 0 8px">${greeting}</p>
    <p style="font-size:15px;line-height:1.55;color:#4a423b;margin:0 0 20px">
      <strong>${props.partnerName}</strong> has invited you to help lead <strong>${props.scopeLabel}</strong>
      as a <strong>${role.label}</strong>.
    </p>
    <p style="font-size:14px;line-height:1.55;color:#6b5e54;margin:0 0 24px;padding:12px 16px;background:#f9f5ef;border-left:3px solid #c41e3a;border-radius:4px">
      ${role.description}
    </p>
    <div style="text-align:center;margin:32px 0">
      <a href="${link}" style="display:inline-block;background:#c41e3a;color:#fff;text-decoration:none;font-weight:600;padding:14px 32px;border-radius:6px;font-size:15px">Accept invitation</a>
    </div>
    <p style="font-size:12px;color:#8a7d70;text-align:center;margin:0 0 4px">This invitation expires on ${expires}.</p>
    <p style="font-size:12px;color:#8a7d70;text-align:center;margin:0">If the button doesn't work, paste this link in your browser:<br/><span style="word-break:break-all;color:#6b5e54">${link}</span></p>
  </div>
</body></html>`;
}

function buildText(props: SendSeatInviteInput, link: string): string {
  const role = getRoleTemplate(props.roleCode);
  return `${props.toName ? `Hi ${props.toName},` : "Hi,"}

${props.partnerName} has invited you to help lead "${props.scopeLabel}" as a ${role.label}.

${role.description}

Accept your invitation: ${link}

This invitation expires on ${props.expiresAt.toISOString()}.

— OKÜ Hospitality Group`;
}

export async function sendSeatInviteEmail(props: SendSeatInviteInput): Promise<{ sent: boolean; reason?: string; previewLink: string }> {
  const link = `${BASE_URL}/seats/invite/${props.rawToken}`;
  if (!isResendConfigured()) {
    return { sent: false, reason: "RESEND_NOT_CONFIGURED", previewLink: link };
  }
  try {
    const { client, fromEmail } = await getResendClient();
    const role = getRoleTemplate(props.roleCode);
    await client.emails.send({
      from: fromEmail,
      to: props.toEmail,
      subject: `${props.partnerName} invited you as a ${role.label} — OKÜ`,
      html: buildHtml(props, link),
      text: buildText(props, link),
    });
    return { sent: true, previewLink: link };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "send_failed", previewLink: link };
  }
}
