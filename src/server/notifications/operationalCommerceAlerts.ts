import { prisma } from "@/lib/prisma";
import { getResendClient, isResendConfigured } from "@/server/invitation/resend";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || process.env.NEXTAUTH_URL || "https://www.okuhospitalitygroup.com";

type RecipientKind = "ACTION" | "AWARENESS";

// Explicitly authorised internal operational addresses. Messages are sent one
// at a time so no recipient sees another recipient in message headers.
const RECIPIENTS: Record<RecipientKind, readonly string[]> = {
  ACTION: ["events@okuhospitalitygroup.com", "admin@okuhospitalitygroup.com"],
  AWARENESS: ["tonka@okuhospitalitygroup.com", "denzil@okuhospitalitygroup.com"],
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(value);
}

function emailShell({ eyebrow, title, details, ctaLabel, ctaHref }: { eyebrow: string; title: string; details: string; ctaLabel: string; ctaHref: string }) {
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1a1614">
    <div style="background:#1a1614;padding:24px 32px"><span style="color:#c41e3a;font-size:27px;font-weight:700;font-family:Georgia,serif">OKÜ</span><span style="color:#e7dfd7;font-size:10px;letter-spacing:.16em;margin-left:10px">HOSPITALITY GROUP</span></div>
    <div style="padding:32px;background:#fff"><p style="margin:0 0 8px;color:#c41e3a;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase">${escapeHtml(eyebrow)}</p><h1 style="margin:0 0 20px;font-family:Georgia,serif;font-size:27px;font-weight:400">${escapeHtml(title)}</h1><div style="background:#f9f7f4;border-radius:8px;padding:18px 20px;line-height:1.65;font-size:14px">${details}</div><p style="margin:28px 0 0"><a href="${ctaHref}" style="display:inline-block;background:#c41e3a;color:#fff;text-decoration:none;padding:13px 20px;border-radius:7px;font-size:14px;font-weight:700">${escapeHtml(ctaLabel)}</a></p></div>
    <div style="background:#f9f7f4;padding:18px 32px;color:#7c7168;font-size:12px">Internal operational notification from OKÜ Hospitality Group.</div></div>`;
}

async function sendIndividually(args: { kind: RecipientKind; subject: string; html: string; auditAction: string; entityId: string }) {
  if (!isResendConfigured()) return { sent: 0, failed: RECIPIENTS[args.kind].length, skipped: true };
  const { client, fromEmail } = await getResendClient();
  const outcomes = await Promise.all(RECIPIENTS[args.kind].map(async (email) => {
    const result = await client.emails.send({ from: fromEmail, to: email, subject: args.subject, html: args.html });
    return !result.error;
  }));
  const sent = outcomes.filter(Boolean).length;
  const failed = outcomes.length - sent;
  await prisma.auditLog.create({ data: { actorId: "system:operational-alerts", action: args.auditAction, metadata: { entityId: args.entityId, recipientKind: args.kind, sent, failed } } }).catch(() => null);
  return { sent, failed, skipped: false };
}

export async function sendNewReservationOperationalAlerts(reservationId: string) {
  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId }, include: { venue: { select: { name: true } }, assignedSpace: { select: { name: true } }, requestedSpace: { select: { name: true } } } });
  if (!reservation) return;
  const venue = reservation.venue.name === "Gold House" ? "OKÜ & CATCH by OKÜ Hospitality Group" : reservation.venue.name;
  const space = reservation.assignedSpace?.name ?? reservation.requestedSpace?.name ?? "To be assigned";
  const details = `Reference: <strong>${escapeHtml(reservation.confirmationCode)}</strong><br>${escapeHtml(venue)} · ${escapeHtml(space)}<br>${reservation.partySize} guest${reservation.partySize === 1 ? "" : "s"} · ${escapeHtml(formatDate(reservation.reservationDate))}`;
  await Promise.all([
    sendIndividually({ kind: "ACTION", subject: `Action required: new reservation request — ${reservation.confirmationCode}`, html: emailShell({ eyebrow: "New reservation request", title: "Initiate the guest journey", details, ctaLabel: "Open Operations Board", ctaHref: `${BASE_URL}/host/operations?reservationId=${encodeURIComponent(reservation.id)}` }), auditAction: "reservation.operational_alert.action", entityId: reservation.id }),
    sendIndividually({ kind: "AWARENESS", subject: `New reservation request — ${reservation.confirmationCode}`, html: emailShell({ eyebrow: "Reservation notification", title: "A new reservation was received", details, ctaLabel: "Open Admin Console", ctaHref: `${BASE_URL}/admin` }), auditAction: "reservation.operational_alert.awareness", entityId: reservation.id }),
  ]);
}

export async function sendPaidTicketOperationalAlerts(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { series: { select: { id: true, title: true } }, session: { select: { startsAt: true } }, lineItems: { select: { qty: true } } } });
  if (!order || order.status !== "PAID") return;
  const quantity = order.lineItems.reduce((sum, item) => sum + item.qty, 0);
  const reference = order.id.slice(-8).toUpperCase();
  const details = `Order: <strong>${reference}</strong><br>${escapeHtml(order.series.title)} · ${quantity} ticket${quantity === 1 ? "" : "s"}<br>${escapeHtml(formatDate(order.session.startsAt))}`;
  await Promise.all([
    sendIndividually({ kind: "ACTION", subject: `Action required: new paid ticket sale — ${order.series.title}`, html: emailShell({ eyebrow: "Ticket sale", title: "Prepare the guest journey", details, ctaLabel: "Open Attendee List", ctaHref: `${BASE_URL}/admin/experiences/${encodeURIComponent(order.series.id)}/attendees` }), auditAction: "ticket.operational_alert.action", entityId: order.id }),
    sendIndividually({ kind: "AWARENESS", subject: `New paid ticket sale — ${order.series.title}`, html: emailShell({ eyebrow: "Ticket sale notification", title: "A ticket sale completed", details, ctaLabel: "Open Order", ctaHref: `${BASE_URL}/admin/orders?orderId=${encodeURIComponent(order.id)}` }), auditAction: "ticket.operational_alert.awareness", entityId: order.id }),
  ]);
}
