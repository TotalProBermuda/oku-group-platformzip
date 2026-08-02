import { getResendClient, isResendConfigured } from "@/server/invitation/resend";

export interface ReservationConfirmationInput {
  contactName: string;
  contactEmail: string;
  confirmationCode: string;
  reservationDate: Date;
  partySize: number;
  venueName: string;
  venueCity: string | null;
  zoneName: string | null;
  occasion: string | null;
  seatingPreference: string | null;
  notes: string | null;
  addons: { label: string }[];
}

export interface ReservationConfirmationResult {
  sent: boolean;
  reason?: string;
  bodySnapshot: string;
  subject: string;
}

const PANAMA_TZ = "America/Panama";

function formatReservationDateTime(date: Date): { dateLine: string; timeLine: string } {
  const dateLine = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: PANAMA_TZ,
  }).format(date);
  const timeLine = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: PANAMA_TZ,
  }).format(date);
  return { dateLine, timeLine };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(props: ReservationConfirmationInput): string {
  const { dateLine, timeLine } = formatReservationDateTime(props.reservationDate);
  const greeting = `Hi ${escapeHtml(props.contactName.split(" ")[0] || props.contactName)},`;
  const venueLine = props.venueCity
    ? `${escapeHtml(props.venueName)} · ${escapeHtml(props.venueCity)}`
    : escapeHtml(props.venueName);

  const detailsRows: { label: string; value: string }[] = [
    { label: "Date", value: dateLine },
    { label: "Time", value: timeLine },
    { label: "Party size", value: `${props.partySize} ${props.partySize === 1 ? "guest" : "guests"}` },
  ];
  if (props.zoneName) detailsRows.push({ label: "Seating", value: escapeHtml(props.zoneName) });
  if (props.occasion) detailsRows.push({ label: "Occasion", value: escapeHtml(props.occasion) });
  if (props.seatingPreference) detailsRows.push({ label: "Preference", value: escapeHtml(props.seatingPreference) });
  if (props.addons.length > 0) {
    detailsRows.push({ label: "Add-ons", value: props.addons.map((a) => escapeHtml(a.label)).join(", ") });
  }

  const detailsHtml = detailsRows
    .map(
      (r) => `
      <tr>
        <td style="padding:8px 0;font-size:13px;color:#8a7d70;width:110px;vertical-align:top">${r.label}</td>
        <td style="padding:8px 0;font-size:14px;color:#1a1614;font-weight:500">${r.value}</td>
      </tr>`
    )
    .join("");

  const notesBlock = props.notes
    ? `<div style="margin:24px 0 0;padding:14px 16px;background:#f9f5ef;border-left:3px solid #c41e3a;border-radius:4px">
         <div style="font-size:11px;font-weight:700;letter-spacing:0.12em;color:#8a7d70;margin-bottom:6px">YOUR NOTE</div>
         <div style="font-size:14px;line-height:1.5;color:#4a423b">${escapeHtml(props.notes)}</div>
       </div>`
    : "";

  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f0ea;margin:0;padding:24px;color:#1a1614">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5dccf">
    <div style="text-align:center;margin-bottom:24px">
      <span style="font-size:11px;font-weight:700;letter-spacing:0.18em;color:#c41e3a">OKÜ HOSPITALITY GROUP</span>
    </div>
    <h1 style="font-size:24px;line-height:1.25;margin:0 0 4px;color:#1a1614">Reservation confirmed</h1>
    <p style="font-size:14px;color:#8a7d70;margin:0 0 24px">${venueLine}</p>
    <p style="font-size:15px;line-height:1.55;color:#4a423b;margin:0 0 8px">${greeting}</p>
    <p style="font-size:15px;line-height:1.55;color:#4a423b;margin:0 0 24px">
      We look forward to welcoming you to <strong>${escapeHtml(props.venueName)}</strong>. Your booking is confirmed below.
    </p>

    <div style="background:#1a1614;color:#fff;border-radius:8px;padding:20px;text-align:center;margin:0 0 24px">
      <div style="font-size:11px;font-weight:700;letter-spacing:0.18em;color:#e5dccf;margin-bottom:6px">CONFIRMATION CODE</div>
      <div style="font-size:28px;font-weight:700;letter-spacing:0.12em;font-family:'SF Mono','Menlo',monospace">${escapeHtml(props.confirmationCode)}</div>
      <div style="font-size:12px;color:#8a7d70;margin-top:8px">Show this code or your name on arrival</div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin:0 0 8px">${detailsHtml}</table>

    ${notesBlock}

    <p style="font-size:13px;color:#6b5e54;line-height:1.55;margin:32px 0 0">
      Need to change or cancel your reservation? Simply reply to this email and our team will help — please include your confirmation code.
    </p>

    <div style="border-top:1px solid #e5dccf;margin-top:32px;padding-top:16px;text-align:center">
      <p style="font-size:12px;color:#8a7d70;margin:0">OKÜ Hospitality Group · Casco Viejo, Panama City</p>
    </div>
  </div>
</body></html>`;
}

function buildText(props: ReservationConfirmationInput): string {
  const { dateLine, timeLine } = formatReservationDateTime(props.reservationDate);
  const lines: string[] = [
    `Hi ${props.contactName.split(" ")[0] || props.contactName},`,
    "",
    `Your reservation at ${props.venueName} is confirmed.`,
    "",
    `CONFIRMATION CODE: ${props.confirmationCode}`,
    "Show this code or your name on arrival.",
    "",
    `Date:        ${dateLine}`,
    `Time:        ${timeLine}`,
    `Party size:  ${props.partySize} ${props.partySize === 1 ? "guest" : "guests"}`,
  ];
  if (props.zoneName) lines.push(`Seating:     ${props.zoneName}`);
  if (props.occasion) lines.push(`Occasion:    ${props.occasion}`);
  if (props.seatingPreference) lines.push(`Preference:  ${props.seatingPreference}`);
  if (props.addons.length > 0) lines.push(`Add-ons:     ${props.addons.map((a) => a.label).join(", ")}`);
  if (props.notes) {
    lines.push("");
    lines.push("Your note:");
    lines.push(props.notes);
  }
  lines.push(
    "",
    "Need to change or cancel? Just reply to this email with your confirmation code.",
    "",
    "— OKÜ Hospitality Group · Casco Viejo, Panama City"
  );
  return lines.join("\n");
}

export function buildReservationConfirmationSubject(props: Pick<ReservationConfirmationInput, "venueName" | "confirmationCode">): string {
  return `Your reservation at ${props.venueName} — ${props.confirmationCode}`;
}

export async function sendReservationConfirmationEmail(
  props: ReservationConfirmationInput
): Promise<ReservationConfirmationResult> {
  const subject = buildReservationConfirmationSubject(props);
  const html = buildHtml(props);
  const text = buildText(props);

  if (!isResendConfigured()) {
    return { sent: false, reason: "RESEND_NOT_CONFIGURED", bodySnapshot: text, subject };
  }

  try {
    const { client, fromEmail } = await getResendClient();
    await client.emails.send({
      from: fromEmail,
      to: props.contactEmail,
      subject,
      html,
      text,
    });
    return { sent: true, bodySnapshot: text, subject };
  } catch (e) {
    return {
      sent: false,
      reason: e instanceof Error ? e.message : "send_failed",
      bodySnapshot: text,
      subject,
    };
  }
}
