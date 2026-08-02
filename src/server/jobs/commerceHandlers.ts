import { prisma } from "@/lib/prisma";
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
      <p style="margin:0;color:#c5c0b8;font-size:11px">You are receiving this email because you have an account with OKÜ.</p>
    </div>`;
}

export async function handleSendOrderEmail(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { name: true, email: true } },
      series: { select: { title: true, startsAt: true, venue: true } },
      tickets: { select: { code: true } },
      lineItems: { select: { nameSnapshot: true, qty: true, unitPriceCents: true, totalCents: true } },
    },
  });

  if (!order || !order.user?.email) {
    console.log("[email] Order or user email not found, skipping:", orderId);
    return;
  }

  let resend;
  try {
    resend = await getResendClient();
  } catch {
    console.log("[email] Resend not configured — order confirmation not sent for", orderId);
    return;
  }

  const ticketCodes = order.tickets.map((t) => t.code);
  const totalFormatted = `$${(order.totalCents / 100).toFixed(2)}`;
  const eventDate = order.series?.startsAt
    ? new Date(order.series.startsAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : null;

  const ticketsHtml = ticketCodes.length
    ? ticketCodes
        .map(
          (code) => `
        <div style="background:white;border:1px solid #e5e0d8;border-radius:8px;padding:16px 20px;margin-bottom:8px;display:flex;align-items:center;gap:16px">
          <div style="background:#1a1614;border-radius:6px;padding:8px 12px">
            <span style="font-family:monospace;font-size:13px;color:white;font-weight:600;letter-spacing:0.06em">${code}</span>
          </div>
          <a href="${BASE_URL}/my/tickets" style="font-size:12px;color:#c41e3a;text-decoration:none">View ticket →</a>
        </div>`
        )
        .join("")
    : "";

  const lineItemsHtml = order.lineItems
    .map(
      (li) =>
        `<tr><td style="padding:8px 0;color:#4b4540;font-size:14px">${li.nameSnapshot} × ${li.qty}</td><td style="padding:8px 0;color:#4b4540;font-size:14px;text-align:right">$${(li.totalCents / 100).toFixed(2)}</td></tr>`
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:white">
      ${emailHeader()}
      <div style="padding:40px 32px">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#c41e3a">Booking Confirmed</p>
        <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#1a1614;letter-spacing:-0.01em">Your tickets are ready</h1>
        <p style="color:#4b4540;margin:0 0 32px;font-size:15px;line-height:1.6">Hi ${order.user.name ?? "Guest"}, thank you for your booking. Your tickets for <strong>${order.series?.title ?? "the experience"}</strong> are confirmed.</p>
        
        <div style="background:#f9f7f4;border-radius:12px;padding:24px;margin-bottom:32px">
          ${order.series?.venue ? `<p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af">${order.series.venue}</p>` : ""}
          <p style="margin:0 0 4px;font-size:20px;font-family:Georgia,serif;color:#1a1614;font-weight:400">${order.series?.title ?? "Experience"}</p>
          ${eventDate ? `<p style="margin:0;font-size:14px;color:#7c7168">${eventDate}</p>` : ""}
        </div>

        ${ticketCodes.length ? `<p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#9ca3af">Your Ticket${ticketCodes.length > 1 ? "s" : ""}</p>${ticketsHtml}` : ""}

        <table style="width:100%;margin-top:24px;border-top:1px solid #e5e0d8;padding-top:16px">
          <tbody>${lineItemsHtml}</tbody>
          <tfoot>
            <tr style="border-top:1px solid #e5e0d8">
              <td style="padding:12px 0 0;font-weight:700;color:#1a1614;font-size:15px">Total paid</td>
              <td style="padding:12px 0 0;font-weight:700;color:#1a1614;font-size:15px;text-align:right">${totalFormatted}</td>
            </tr>
          </tfoot>
        </table>

        <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e5e0d8">
          <p style="margin:0 0 8px;font-size:12px;color:#9ca3af">Order reference: <span style="font-family:monospace;color:#4b4540">${order.id.slice(-8).toUpperCase()}</span></p>
          <a href="${BASE_URL}/my/tickets" style="display:inline-block;margin-top:12px;background:#c41e3a;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.02em">View My Tickets</a>
        </div>
      </div>
      ${emailFooter()}
    </div>`;

  const { data, error } = await resend.client.emails.send({
    from: resend.fromEmail,
    to: order.user.email,
    subject: `Booking confirmed — ${order.series?.title ?? "Your OKÜ Experience"}`,
    html,
  });

  if (error) {
    console.error("[email] Failed to send order confirmation:", error);
  } else {
    console.log("[email] Order confirmation sent:", data?.id, "→", order.user.email);
  }
}

export async function handleMembershipWelcomeEmail({
  userEmail,
  userName,
  tier,
  renewsAt,
}: {
  userEmail: string;
  userName: string | null;
  tier: string;
  renewsAt: Date;
}) {
  let resend;
  try {
    resend = await getResendClient();
  } catch {
    console.log("[email] Resend not configured — membership welcome not sent to", userEmail);
    return;
  }

  const tierLabel = tier === "FOUNDER" ? "Founder" : tier === "PATRON" ? "Patron" : tier;
  const renewsFormatted = renewsAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  const html = `
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:white">
      ${emailHeader()}
      <div style="padding:40px 32px">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#c41e3a">Welcome to OKÜ ${tierLabel}</p>
        <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#1a1614;letter-spacing:-0.01em">Your membership is active</h1>
        <p style="color:#4b4540;margin:0 0 32px;font-size:15px;line-height:1.6">Hi ${userName ?? "Member"}, your OKÜ <strong>${tierLabel}</strong> membership is now active. Welcome to the inner circle.</p>

        <div style="background:#1a1614;border-radius:12px;padding:28px 32px;margin-bottom:32px">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5)">Membership</p>
          <p style="margin:0 0 16px;font-size:22px;font-family:Georgia,serif;color:white;font-weight:400">OKÜ ${tierLabel}</p>
          <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.5)">Renews ${renewsFormatted}</p>
        </div>

        <a href="${BASE_URL}/my/membership" style="display:inline-block;background:#c41e3a;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.02em">View My Membership</a>
      </div>
      ${emailFooter()}
    </div>`;

  const { data, error } = await resend.client.emails.send({
    from: resend.fromEmail,
    to: userEmail,
    subject: `Welcome to OKÜ ${tierLabel} — Your membership is active`,
    html,
  });

  if (error) {
    console.error("[email] Failed to send membership welcome:", error);
  } else {
    console.log("[email] Membership welcome sent:", data?.id, "→", userEmail);
  }
}

export async function handleFounderApplicationStatusEmail({
  userEmail,
  userName,
  status,
  reviewNotes,
}: {
  userEmail: string;
  userName: string | null;
  status: "APPROVED" | "DECLINED" | "UNDER_REVIEW";
  reviewNotes?: string | null;
}) {
  let resend;
  try {
    resend = await getResendClient();
  } catch {
    console.log("[email] Resend not configured — founder status email not sent to", userEmail);
    return;
  }

  if (status === "UNDER_REVIEW") {
    const html = `
      <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:white">
        ${emailHeader()}
        <div style="padding:40px 32px">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#c41e3a">Application Received</p>
          <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#1a1614">Your Founder application is under review</h1>
          <p style="color:#4b4540;margin:0 0 32px;font-size:15px;line-height:1.6">Hi ${userName ?? "Applicant"}, we have received your OKÜ Founder membership application. Our team will review it and be in touch shortly.</p>
          <a href="${BASE_URL}/my/membership" style="display:inline-block;background:#1a1614;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600">Check Application Status</a>
        </div>
        ${emailFooter()}
      </div>`;

    await resend.client.emails.send({
      from: resend.fromEmail,
      to: userEmail,
      subject: "OKÜ Founder Application — Under Review",
      html,
    });
    return;
  }

  if (status === "APPROVED") {
    const html = `
      <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:white">
        ${emailHeader()}
        <div style="padding:40px 32px">
          <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#c41e3a">Congratulations</p>
          <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#1a1614">Welcome to OKÜ Founders</h1>
          <p style="color:#4b4540;margin:0 0 32px;font-size:15px;line-height:1.6">Hi ${userName ?? "Member"}, your OKÜ Founder membership application has been approved. Your membership is now active.</p>
          ${reviewNotes ? `<div style="background:#f9f7f4;border-radius:8px;padding:20px;margin-bottom:24px"><p style="margin:0;color:#4b4540;font-size:14px;font-style:italic">"${reviewNotes}"</p></div>` : ""}
          <a href="${BASE_URL}/my/membership" style="display:inline-block;background:#c41e3a;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600">View Your Membership</a>
        </div>
        ${emailFooter()}
      </div>`;

    await resend.client.emails.send({
      from: resend.fromEmail,
      to: userEmail,
      subject: "You're in — OKÜ Founder Membership Approved",
      html,
    });
    return;
  }

  if (status === "DECLINED") {
    const html = `
      <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:white">
        ${emailHeader()}
        <div style="padding:40px 32px">
          <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#1a1614">OKÜ Founder Application Update</h1>
          <p style="color:#4b4540;margin:0 0 32px;font-size:15px;line-height:1.6">Hi ${userName ?? "Applicant"}, after careful review we are unable to offer a Founder membership at this time. We appreciate your interest in OKÜ and invite you to explore our Patron membership.</p>
          ${reviewNotes ? `<div style="background:#f9f7f4;border-radius:8px;padding:20px;margin-bottom:24px"><p style="margin:0;color:#4b4540;font-size:14px;font-style:italic">"${reviewNotes}"</p></div>` : ""}
          <a href="${BASE_URL}/membership" style="display:inline-block;background:#1a1614;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600">Explore Membership Options</a>
        </div>
        ${emailFooter()}
      </div>`;

    await resend.client.emails.send({
      from: resend.fromEmail,
      to: userEmail,
      subject: "OKÜ Founder Application — Update",
      html,
    });
  }
}

export async function handlePatronPendingApprovalEmail({
  userEmail,
  userName,
}: {
  userEmail: string;
  userName: string | null;
}) {
  let resend;
  try {
    resend = await getResendClient();
  } catch {
    console.log("[email] Resend not configured — patron pending email not sent to", userEmail);
    return;
  }

  const html = `
    <div style="font-family:sans-serif;max-width:580px;margin:0 auto;background:white">
      ${emailHeader()}
      <div style="padding:40px 32px">
        <p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#c41e3a">Membership Request</p>
        <h1 style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;font-weight:400;color:#1a1614">Your Patron membership is pending</h1>
        <p style="color:#4b4540;margin:0 0 32px;font-size:15px;line-height:1.6">Hi ${userName ?? "Member"}, your OKÜ Patron membership request has been received. Our team will confirm your membership shortly and you will receive a follow-up email once active.</p>
        <a href="${BASE_URL}/my/membership" style="display:inline-block;background:#1a1614;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:600">Check Status</a>
      </div>
      ${emailFooter()}
    </div>`;

  await resend.client.emails.send({
    from: resend.fromEmail,
    to: userEmail,
    subject: "OKÜ Patron Membership — Pending Confirmation",
    html,
  });
}
