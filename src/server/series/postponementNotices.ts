import { createHash } from "node:crypto";
import type { ManagedSession } from "./sessionState";
import type { ManagementInput } from "./sessionFields";

export function postponementRecipients(session: ManagedSession) {
  const contacts = new Map<string, { email: string; locale: "en" | "es" | "pt" }>();
  let missingContacts = 0;
  for (const ticket of session.tickets) {
    if (["CANCELLED", "REFUNDED", "VOIDED"].includes(ticket.ticketStatus)) continue;
    // A no-contact comp belongs to its issuing admin; never notify that admin as attendee.
    const buyerOrder = session.Order.find(o => o.id === ticket.orderId);
    const hasPurchasedLines = Boolean(buyerOrder?.lineItems.length);
    const email = (ticket.attendeeEmail || (ticket.order.channel === "ADMIN" || !hasPurchasedLines ? "" : ticket.order.user.email) || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { missingContacts++; continue; }
    const legacyContact = buyerOrder?.events[0]?.eventPayload;
    const legacyLocale = legacyContact && typeof legacyContact === "object" && !Array.isArray(legacyContact) ? legacyContact.locale : null;
    const locale = ticket.order.checkoutLocale ?? legacyLocale;
    if (!contacts.has(email)) contacts.set(email, { email, locale: locale === "es" || locale === "pt" ? locale : "en" });
  }
  return {
    recipients: [...contacts.values()].sort((a, b) => a.email.localeCompare(b.email)),
    counts: { queued: contacts.size, missingContacts, locales: {
      en: [...contacts.values()].filter(c => c.locale === "en").length,
      es: [...contacts.values()].filter(c => c.locale === "es").length,
      pt: [...contacts.values()].filter(c => c.locale === "pt").length,
    } },
  };
}
export function noticePayload(session: ManagedSession, next: { startsAt: Date; endsAt: Date }, input: NonNullable<ManagementInput["postponement"]>, locale: "en" | "es" | "pt", title = session.title ?? "") {
  const messages = {
    en: { subject: "Event schedule update", preserve: "Your existing admission remains valid for the confirmed replacement date. No new ticket is needed.", hold: "Keep your existing ticket. A replacement date is pending; ticket sales and check-in are paused. No refund, cancellation or transfer has been made." },
    es: { subject: "Actualización del horario del evento", preserve: "Tu entrada sigue siendo válida para la nueva fecha confirmada. No necesitas otra entrada.", hold: "Conserva tu entrada. La nueva fecha está pendiente; las ventas y el registro están pausados. No se ha realizado ningún reembolso, cancelación ni traslado." },
    pt: { subject: "Atualização do horário do evento", preserve: "Seu ingresso continua válido para a nova data confirmada. Não é necessário outro ingresso.", hold: "Guarde seu ingresso. A nova data está pendente; as vendas e a entrada estão pausadas. Nenhum reembolso, cancelamento ou transferência foi realizado." },
  }[locale];
  return {
    sessionId: session.id, title,
    subject: messages.subject, body: input.treatment === "PRESERVE_ADMISSION" ? messages.preserve : messages.hold,
    originalSchedule: { startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(), timeZone: "America/Panama" },
    replacementSchedule: input.treatment === "PRESERVE_ADMISSION" ? { startsAt: next.startsAt.toISOString(), endsAt: next.endsAt.toISOString(), timeZone: "America/Panama" } : null,
    treatment: input.treatment, reason: input.reason, locale,
  };
}
export function recipientKey(email: string) { return createHash("sha256").update(email).digest("hex"); }
