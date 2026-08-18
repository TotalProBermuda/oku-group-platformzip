import { prisma } from "@/lib/prisma";
import {
  buildReservationConfirmationSubject,
  buildReservationRequestSubject,
  sendReservationConfirmationEmail,
  sendReservationRequestReceivedEmail,
  type ReservationEmailKind,
} from "@/server/reservations/confirmationEmail";

/**
 * Sends exactly the email implied by the persisted reservation state.
 * A request receipt is deliberately not a confirmation; confirmation is sent
 * only after the row has actually reached CONFIRMED.
 */
export async function deliverReservationStateEmail(reservationId: string, kind: ReservationEmailKind) {
  const reservation = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: { venue: true, zone: true, addons: true },
  });

  if (kind === "CONFIRMATION" && reservation.status !== "CONFIRMED") {
    throw new Error(`Cannot send a confirmation for reservation status ${reservation.status}`);
  }

  const alreadyOwedOrSent = await prisma.reservationCommunication.findFirst({
    where: {
      reservationId,
      templateKey: kind,
      status: { in: ["PENDING", "SENT"] },
    },
    select: { id: true },
  });
  if (alreadyOwedOrSent) return { skipped: true, communicationId: alreadyOwedOrSent.id };

  const props = {
    contactName: reservation.contactName,
    contactEmail: reservation.contactEmail,
    confirmationCode: reservation.confirmationCode,
    reservationDate: reservation.reservationDate,
    partySize: reservation.partySize,
    venueName: reservation.venue.name,
    venueCity: reservation.venue.city,
    zoneName: reservation.zone?.name ?? null,
    tableLabel: reservation.assignedTableLabel,
    occasion: reservation.occasion,
    seatingPreference: reservation.seatingPreference,
    notes: reservation.notes,
    addons: reservation.addons.map((addon) => ({ label: addon.label })),
  };
  const subject = kind === "CONFIRMATION"
    ? buildReservationConfirmationSubject(props)
    : buildReservationRequestSubject(props);
  const communication = await prisma.reservationCommunication.create({
    data: {
      reservationId,
      type: "EMAIL",
      templateKey: kind,
      recipient: reservation.contactEmail,
      subject,
      status: "PENDING",
    },
  });

  try {
    const result = kind === "CONFIRMATION"
      ? await sendReservationConfirmationEmail(props)
      : await sendReservationRequestReceivedEmail(props);
    await prisma.reservationCommunication.update({
      where: { id: communication.id },
      data: {
        status: result.sent ? "SENT" : "FAILED",
        sentAt: result.sent ? new Date() : null,
        bodySnapshot: result.bodySnapshot,
      },
    });
    return { skipped: false, sent: result.sent, reason: result.reason, communicationId: communication.id };
  } catch (error) {
    await prisma.reservationCommunication.update({
      where: { id: communication.id },
      data: { status: "FAILED" },
    }).catch(() => null);
    throw error;
  }
}
