import { prisma } from "@/lib/prisma";
import {
  buildReservationConfirmationSubject,
  buildReservationRequestSubject,
  buildReservationUpdatedSubject,
  sendReservationConfirmationEmail,
  sendReservationRequestReceivedEmail,
  sendReservationUpdatedEmail,
  type ReservationConfirmationInput,
  type ReservationEmailKind,
} from "@/server/reservations/confirmationEmail";

/**
 * Sends exactly the email implied by the persisted reservation state.
 * A request receipt is deliberately not a confirmation; confirmation is sent
 * only after the row has actually reached CONFIRMED.
 */
export async function deliverReservationStateEmail(
  reservationId: string,
  kind: ReservationEmailKind,
  options: { force?: boolean; guestMessage?: string; communicationId?: string } = {},
) {
  const reservation = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    include: {
      venue: true,
      zone: true,
      assignedSpace: true,
      addons: true,
      statusLogs: { where: { toStatus: "CONFIRMED" }, take: 1 },
    },
  });

  if (kind === "CONFIRMATION" && reservation.status !== "CONFIRMED" && reservation.statusLogs.length === 0) {
    throw new Error(`Cannot send a confirmation for reservation status ${reservation.status}`);
  }

  const alreadySent = kind === "RESERVATION_UPDATED" ? null : await prisma.reservationCommunication.findFirst({
    where: { reservationId, templateKey: kind, status: "SENT" },
    select: { id: true },
  });
  if (alreadySent && !options.force) return { skipped: true, communicationId: alreadySent.id };

  const props: ReservationConfirmationInput = {
    contactName: reservation.contactName,
    contactEmail: reservation.contactEmail,
    confirmationCode: reservation.confirmationCode,
    reservationDate: reservation.reservationDate,
    partySize: reservation.partySize,
    venueName: reservation.venue.name,
    venueCity: reservation.venue.city,
    zoneName: reservation.assignedSpace?.name ?? reservation.zone?.name ?? null,
    tableLabel: reservation.assignedTableLabel,
    occasion: reservation.occasion,
    seatingPreference: reservation.seatingPreference,
    notes: reservation.notes,
    addons: reservation.addons.map((addon) => ({ label: addon.label })),
  };
  const subject = kind === "CONFIRMATION"
    ? buildReservationConfirmationSubject(props)
    : kind === "RESERVATION_UPDATED"
      ? buildReservationUpdatedSubject(props)
      : buildReservationRequestSubject(props);
  const pending = !options.force
    ? await prisma.reservationCommunication.findFirst({
        where: {
          reservationId,
          templateKey: kind,
          status: "PENDING",
          ...(options.communicationId ? { id: options.communicationId } : {}),
        },
        orderBy: { createdAt: "asc" },
      })
    : null;
  const communication = pending ?? await prisma.reservationCommunication.create({
    data: {
      reservationId,
      type: "EMAIL",
      templateKey: kind,
      recipient: reservation.contactEmail,
      subject,
      status: "PENDING",
    },
  });
  if (kind === "RESERVATION_UPDATED") {
    props.guestMessage = options.guestMessage ?? pending?.bodySnapshot ?? null;
  }

  try {
    const result = kind === "CONFIRMATION"
      ? await sendReservationConfirmationEmail(props)
      : kind === "RESERVATION_UPDATED"
        ? await sendReservationUpdatedEmail(props)
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
